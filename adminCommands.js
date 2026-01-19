/**
 * adminCommands.js
 * Handles admin slash commands for managing sprints and disciplines
 */
// const fs = require('fs'); // Unused - keeping for potential future use
const fs = require('fs');
const path = require('path');
const { slackApp } = require('./appHome');
const { getEnvironmentCommand } = require('./commandUtils');
const cache = require('./cache/redisClient');
const { UsersRepository } = require('./db/repository');
const { 
  SPRINTS_FILE, 
  DISCIPLINES_FILE,
  readSprints,
  readDisciplines,
  findCurrentSprint,
  findNextSprint,
  loadJSON,
  saveJSON,
  upsertSprint
} = require('./dataUtils');

const DISCIPLINE_OPTIONS = [
  { label: 'Account', value: 'account' },
  { label: 'Producer', value: 'producer' },
  { label: 'PO', value: 'po' },
  { label: 'UI Engineer', value: 'uiEng' },
  { label: 'BE Engineer', value: 'beEng' },
];

function getDisciplinesSourceFile() {
  const isStaging = process.env.TRIAGE_ENV === 'staging' || process.env.NODE_ENV === 'staging';
  const stagingPath = path.join(__dirname, 'disciplines.staging.json');
  if (isStaging && fs.existsSync(stagingPath)) return stagingPath;
  return DISCIPLINES_FILE;
}

async function getDisciplineMembersIncludingInactive(discipline) {
  const useDatabase =
    process.env.USE_DATABASE !== 'false' &&
    !!process.env.DATABASE_URL;

  if (useDatabase) {
    const rows = await UsersRepository.getUsersByDisciplineIncludingInactive(discipline);
    const active = rows.filter(r => r.active);
    const inactive = rows.filter(r => !r.active);
    return { active, inactive };
  }

  const sourceFile = getDisciplinesSourceFile();
  const all = loadJSON(sourceFile) || {};
  const members = Array.isArray(all?.[discipline]) ? all[discipline] : [];
  const normalized = members
    .filter(m => m?.slackId)
    .map(m => ({
      slackId: m.slackId,
      name: m.name || m.slackId,
      active: m.active !== false
    }));

  return {
    active: normalized.filter(m => m.active),
    inactive: normalized.filter(m => !m.active),
  };
}

function buildConfirm({ title, bodyText, confirmText }) {
  return {
    title: { type: 'plain_text', text: title },
    text: { type: 'mrkdwn', text: bodyText },
    confirm: { type: 'plain_text', text: confirmText },
    deny: { type: 'plain_text', text: 'Cancel' }
  };
}

async function buildAdminDisciplinesModalView({ discipline, showInactive }) {
  const selected = discipline || 'account';
  const { active, inactive } = await getDisciplineMembersIncludingInactive(selected);

  const selectOptions = DISCIPLINE_OPTIONS.map(o => ({
    text: { type: 'plain_text', text: o.label },
    value: o.value
  }));

  const selectedOption = selectOptions.find(o => o.value === selected) || selectOptions[0];

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Discipline Management' } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Select a discipline and manage rotations. “Remove from rotations” deactivates a user globally (they remain in the system).' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Discipline*' },
      accessory: {
        type: 'static_select',
        action_id: 'admin_disciplines_select',
        options: selectOptions,
        initial_option: selectedOption
      }
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Add member' }, style: 'primary', action_id: 'admin_disciplines_add_member', value: JSON.stringify({ discipline: selected }) },
      ]
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*Active members* (${active.length})` } },
  ];

  const deactivateConfirm = buildConfirm({
    title: 'Remove from rotations',
    bodyText: 'This will deactivate the user and remove them from *all* rotations.\n\n- **THEN** they will not appear in any discipline rotation until reactivated.\n- **NOTE**: This does not delete the user.',
    confirmText: 'Remove'
  });

  active.slice(0, 40).forEach(u => {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${u.name}* (<@${u.slackId}>)` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Remove from rotations' },
        style: 'danger',
        action_id: 'admin_disciplines_deactivate',
        value: JSON.stringify({ slackId: u.slackId, discipline: selected }),
        confirm: deactivateConfirm
      }
    });
  });

  if (active.length > 40) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_Showing first 40 of ${active.length} active members_` }] });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Inactive members* (${inactive.length})` },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: showInactive ? 'Hide' : 'Show' },
      action_id: 'admin_disciplines_toggle_inactive',
      value: JSON.stringify({ discipline: selected })
    }
  });

  const reactivateConfirm = buildConfirm({
    title: 'Reactivate user',
    bodyText: 'This will reactivate the user and include them in rotations again.',
    confirmText: 'Reactivate'
  });

  if (showInactive) {
    inactive.slice(0, 40).forEach(u => {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${u.name}* (<@${u.slackId}>)` },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Reactivate' },
          style: 'primary',
          action_id: 'admin_disciplines_reactivate',
          value: JSON.stringify({ slackId: u.slackId, discipline: selected }),
          confirm: reactivateConfirm
        }
      });
    });

    if (inactive.length > 40) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_Showing first 40 of ${inactive.length} inactive members_` }] });
    }
  } else {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_Inactive users are excluded from all rotations. Use “Show” to view and reactivate._` }]
    });
  }

  // Slack modal limit: 100 blocks
  if (blocks.length > 100) blocks.splice(100);

  return {
    type: 'modal',
    callback_id: 'admin_disciplines_modal',
    title: { type: 'plain_text', text: 'Disciplines' },
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ discipline: selected, showInactive: !!showInactive }),
    blocks
  };
}

async function buildAdminSprintsModalView({ page = 0, pageSize = 12 } = {}) {
  const raw = await readSprints();
  const all = Array.isArray(raw) ? raw : [];

  const sprints = all
    .slice()
    .sort((a, b) => (Number(a?.sprintIndex) || 0) - (Number(b?.sprintIndex) || 0));

  const total = sprints.length;
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 12, 25));
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));

  const start = safePage * safePageSize;
  const pageItems = sprints.slice(start, start + safePageSize);

  let current = null;
  let next = null;
  try {
    current = await findCurrentSprint();
    if (current && typeof current.index === 'number') {
      next = await findNextSprint(current.index);
    }
  } catch {
    // Best-effort only; don't block admin UI on summary.
  }

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Sprint Management' } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          'Manage sprint definitions.\n- **No deletions**: old sprints are retained for audit.\n- **Edits require a reason** and are recorded in the audit log.'
      }
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*Total:* ${total}  •  *Page:* ${safePage + 1}/${totalPages}  •  *Page size:* ${safePageSize}` },
        ...(current ? [{ type: 'mrkdwn', text: `*Current:* ${current.sprintName || 'N/A'} (${String(current.startDate).slice(0, 10)} → ${String(current.endDate).slice(0, 10)})` }] : []),
        ...(next ? [{ type: 'mrkdwn', text: `*Next:* ${next.sprintName || 'N/A'} (${String(next.startDate).slice(0, 10)} → ${String(next.endDate).slice(0, 10)})` }] : [])
      ].slice(0, 10)
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Add sprint' },
          style: 'primary',
          action_id: 'admin_sprints_add',
          value: JSON.stringify({ page: safePage, pageSize: safePageSize })
        },
        ...(safePage > 0
          ? [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Prev' },
                action_id: 'admin_sprints_prev_page',
                value: JSON.stringify({ page: safePage - 1, pageSize: safePageSize })
              }
            ]
          : []),
        ...(safePage < totalPages - 1
          ? [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Next' },
                action_id: 'admin_sprints_next_page',
                value: JSON.stringify({ page: safePage + 1, pageSize: safePageSize })
              }
            ]
          : [])
      ]
    },
    { type: 'divider' }
  ];

  if (pageItems.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No sprints found. Use “Add sprint” to create the first sprint._' }
    });
  } else {
    pageItems.forEach((s) => {
      const sprintIndex = Number.isFinite(s?.sprintIndex) ? s.sprintIndex : null;
      const startDate = String(s?.startDate || '').slice(0, 10) || 'N/A';
      const endDate = String(s?.endDate || '').slice(0, 10) || 'N/A';
      const name = s?.sprintName || 'Unnamed Sprint';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${name}*\n*Index:* ${sprintIndex ?? 'N/A'}  •  *Dates:* ${startDate} → ${endDate}`
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit' },
          action_id: 'admin_sprints_edit',
          value: JSON.stringify({ sprintIndex, page: safePage, pageSize: safePageSize })
        }
      });
      blocks.push({ type: 'divider' });
    });
  }

  // Slack modal limit: 100 blocks
  if (blocks.length > 100) blocks.splice(100);

  return {
    type: 'modal',
    callback_id: 'admin_sprints_modal',
    title: { type: 'plain_text', text: 'Sprints' },
    close: { type: 'plain_text', text: 'Close' },
    private_metadata: JSON.stringify({ page: safePage, pageSize: safePageSize }),
    blocks
  };
}


/**
 * /admin-sprints
 * Lists all sprints and provides options to add new ones
 */
slackApp.command(getEnvironmentCommand('admin-sprints'), async ({ command, ack, client, logger }) => {
  // Acknowledge immediately to prevent timeout
  await ack();
  
  try {
    // Check if user is in admin channel
    const isAdmin = command.channel_id === process.env.ADMIN_CHANNEL_ID;
    if (!isAdmin) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: "This command can only be used in the admin channel."
      });
      return;
    }

    // Open fast, then update to the full view (trigger_id expires quickly).
    const probeView = {
      type: 'modal',
      title: { type: 'plain_text', text: 'Sprints' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Loading sprints…' } }]
    };

    const opened = await client.views.open({ trigger_id: command.trigger_id, view: probeView });

    const view = await buildAdminSprintsModalView({ page: 0, pageSize: 12 });
    await client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view });
  } catch (error) {
    logger.error("Error handling admin-sprints command:", error);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Error: ${error.message}`
    });
  }
});

/**
 * admin_sprints_next_page: paginate forward
 */
slackApp.action('admin_sprints_next_page', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const payload = JSON.parse(action.value || '{}');
    const page = Number.isFinite(payload?.page) ? payload.page : (Number(meta.page) || 0);
    const pageSize = Number.isFinite(payload?.pageSize) ? payload.pageSize : (Number(meta.pageSize) || 12);
    const view = await buildAdminSprintsModalView({ page, pageSize });
    await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
  } catch (error) {
    logger?.error?.("Error paginating sprints modal (next):", error);
  }
});

/**
 * admin_sprints_prev_page: paginate backward
 */
slackApp.action('admin_sprints_prev_page', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const payload = JSON.parse(action.value || '{}');
    const page = Number.isFinite(payload?.page) ? payload.page : (Number(meta.page) || 0);
    const pageSize = Number.isFinite(payload?.pageSize) ? payload.pageSize : (Number(meta.pageSize) || 12);
    const view = await buildAdminSprintsModalView({ page, pageSize });
    await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
  } catch (error) {
    logger?.error?.("Error paginating sprints modal (prev):", error);
  }
});

/**
 * admin_sprints_add: open Add Sprint modal (views.push)
 */
slackApp.action('admin_sprints_add', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const triggerId = body.trigger_id;
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const page = Number(meta.page) || 0;
    const pageSize = Number(meta.pageSize) || 12;

    const addView = {
      type: 'modal',
      callback_id: 'admin_sprints_add_modal',
      title: { type: 'plain_text', text: 'Add Sprint' },
      submit: { type: 'plain_text', text: 'Add' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ parentViewId: body.view.id, page, pageSize }),
      blocks: [
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'Sprint index is auto-assigned (max index + 1). Sprints are never deleted.' }]
        },
        {
          type: 'input',
          block_id: 'sprint_name',
          element: {
            type: 'plain_text_input',
            action_id: 'sprint_name_input',
            placeholder: { type: 'plain_text', text: 'e.g., FY27 Sp1' }
          },
          label: { type: 'plain_text', text: 'Sprint Name' }
        },
        {
          type: 'input',
          block_id: 'start_date',
          element: { type: 'datepicker', action_id: 'start_date_input', placeholder: { type: 'plain_text', text: 'Select start date' } },
          label: { type: 'plain_text', text: 'Start Date' }
        },
        {
          type: 'input',
          block_id: 'end_date',
          element: { type: 'datepicker', action_id: 'end_date_input', placeholder: { type: 'plain_text', text: 'Select end date' } },
          label: { type: 'plain_text', text: 'End Date' }
        }
      ]
    };

    if (!triggerId) {
      await client.views.update({
        view_id: body.view.id,
        hash: body.view.hash,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Sprints' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: ':warning: Missing trigger_id; please close and re-run `/admin-sprints`.' } }]
        }
      });
      return;
    }

    try {
      await client.views.push({ trigger_id: triggerId, view: addView });
      return;
    } catch (pushErr) {
      logger?.warn?.('[admin_sprints_add] views.push failed, falling back to views.open', {
        error: pushErr?.data?.error || pushErr?.message
      });
    }

    await client.views.open({ trigger_id: triggerId, view: addView });
  } catch (error) {
    logger?.error?.('Error opening add sprint modal:', error);
  }
});

/**
 * admin_sprints_edit: open Edit Sprint modal (views.push)
 */
slackApp.action('admin_sprints_edit', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const triggerId = body.trigger_id;
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const payload = JSON.parse(action.value || '{}');
    const sprintIndex = payload?.sprintIndex;
    const page = Number.isFinite(payload?.page) ? payload.page : (Number(meta.page) || 0);
    const pageSize = Number.isFinite(payload?.pageSize) ? payload.pageSize : (Number(meta.pageSize) || 12);

    if (!Number.isFinite(sprintIndex)) return;

    const all = await readSprints();
    const sprint = (Array.isArray(all) ? all : []).find(s => Number(s?.sprintIndex) === Number(sprintIndex));
    if (!sprint) return;

    const editView = {
      type: 'modal',
      callback_id: 'admin_sprints_edit_modal',
      title: { type: 'plain_text', text: 'Edit Sprint' },
      submit: { type: 'plain_text', text: 'Save' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ parentViewId: body.view.id, sprintIndex, page, pageSize }),
      blocks: [
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Editing sprint *Index ${sprintIndex}*. Provide a reason for audit logging.` }] },
        {
          type: 'input',
          block_id: 'sprint_name',
          element: {
            type: 'plain_text_input',
            action_id: 'sprint_name_input',
            initial_value: String(sprint.sprintName || '')
          },
          label: { type: 'plain_text', text: 'Sprint Name' }
        },
        {
          type: 'input',
          block_id: 'start_date',
          element: {
            type: 'datepicker',
            action_id: 'start_date_input',
            initial_date: String(sprint.startDate || '').slice(0, 10)
          },
          label: { type: 'plain_text', text: 'Start Date' }
        },
        {
          type: 'input',
          block_id: 'end_date',
          element: {
            type: 'datepicker',
            action_id: 'end_date_input',
            initial_date: String(sprint.endDate || '').slice(0, 10)
          },
          label: { type: 'plain_text', text: 'End Date' }
        },
        {
          type: 'input',
          block_id: 'reason',
          element: {
            type: 'plain_text_input',
            action_id: 'reason_input',
            multiline: true,
            placeholder: { type: 'plain_text', text: 'Why are you making this change?' }
          },
          label: { type: 'plain_text', text: 'Edit reason' }
        }
      ]
    };

    if (!triggerId) return;

    try {
      await client.views.push({ trigger_id: triggerId, view: editView });
      return;
    } catch (pushErr) {
      logger?.warn?.('[admin_sprints_edit] views.push failed, falling back to views.open', {
        error: pushErr?.data?.error || pushErr?.message
      });
    }

    await client.views.open({ trigger_id: triggerId, view: editView });
  } catch (error) {
    logger?.error?.('Error opening edit sprint modal:', error);
  }
});

/**
 * admin_sprints_add_modal submission
 */
slackApp.view('admin_sprints_add_modal', async ({ ack, body, view, client, logger }) => {
  try {
    const sprintName = view.state.values.sprint_name.sprint_name_input.value;
    const startDate = view.state.values.start_date.start_date_input.selected_date;
    const endDate = view.state.values.end_date.end_date_input.selected_date;

    const errors = {};
    if (!sprintName) errors.sprint_name = 'Sprint name is required';
    if (!startDate) errors.start_date = 'Start date is required';
    if (!endDate) errors.end_date = 'End date is required';
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      errors.end_date = 'End date must be after start date';
    }
    if (Object.keys(errors).length > 0) {
      await ack({ response_action: 'errors', errors });
      return;
    }

    await ack();

    const meta = JSON.parse(view.private_metadata || '{}');
    const parentViewId = meta.parentViewId || null;
    const page = Number(meta.page) || 0;
    const pageSize = Number(meta.pageSize) || 12;

    const all = await readSprints();
    const maxIndex = (Array.isArray(all) ? all : [])
      .map(s => Number.isFinite(s?.sprintIndex) ? s.sprintIndex : -1)
      .reduce((m, v) => Math.max(m, v), -1);
    const sprintIndex = maxIndex + 1;

    await upsertSprint({
      sprintName,
      startDate,
      endDate,
      sprintIndex,
      changedBy: body.user.id,
      reason: 'Sprint added via /admin-sprints'
    });

    if (parentViewId) {
      const updated = await buildAdminSprintsModalView({ page, pageSize });
      await client.views.update({ view_id: parentViewId, view: updated });
    }
  } catch (error) {
    logger?.error?.('Error saving new sprint:', error);
    await ack();
  }
});

/**
 * admin_sprints_edit_modal submission
 */
slackApp.view('admin_sprints_edit_modal', async ({ ack, body, view, client, logger }) => {
  try {
    const sprintName = view.state.values.sprint_name.sprint_name_input.value;
    const startDate = view.state.values.start_date.start_date_input.selected_date;
    const endDate = view.state.values.end_date.end_date_input.selected_date;
    const reason = view.state.values.reason.reason_input.value;

    const errors = {};
    if (!sprintName) errors.sprint_name = 'Sprint name is required';
    if (!startDate) errors.start_date = 'Start date is required';
    if (!endDate) errors.end_date = 'End date is required';
    if (!reason || !String(reason).trim()) errors.reason = 'A reason is required for audit logging';
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      errors.end_date = 'End date must be after start date';
    }
    if (Object.keys(errors).length > 0) {
      await ack({ response_action: 'errors', errors });
      return;
    }

    await ack();

    const meta = JSON.parse(view.private_metadata || '{}');
    const parentViewId = meta.parentViewId || null;
    const sprintIndex = meta.sprintIndex;
    const page = Number(meta.page) || 0;
    const pageSize = Number(meta.pageSize) || 12;

    if (!Number.isFinite(sprintIndex)) return;

    await upsertSprint({
      sprintName,
      startDate,
      endDate,
      sprintIndex,
      changedBy: body.user.id,
      reason: String(reason).trim()
    });

    if (parentViewId) {
      const updated = await buildAdminSprintsModalView({ page, pageSize });
      await client.views.update({ view_id: parentViewId, view: updated });
    }
  } catch (error) {
    logger?.error?.('Error updating sprint:', error);
    await ack();
  }
});

/**
 * Legacy compatibility: add_sprint button click (kept for any in-flight old modals)
 */
slackApp.action('add_sprint', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const triggerId = body.trigger_id;
    if (!triggerId) return;
    await client.views.push({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'admin_sprints_add_modal',
        title: { type: 'plain_text', text: 'Add Sprint' },
        submit: { type: 'plain_text', text: 'Add' },
        close: { type: 'plain_text', text: 'Cancel' },
        private_metadata: JSON.stringify({ parentViewId: body.view?.id || null, page: 0, pageSize: 12 }),
        blocks: [
          {
            type: 'input',
            block_id: 'sprint_name',
            element: { type: 'plain_text_input', action_id: 'sprint_name_input' },
            label: { type: 'plain_text', text: 'Sprint Name' }
          },
          {
            type: 'input',
            block_id: 'start_date',
            element: { type: 'datepicker', action_id: 'start_date_input' },
            label: { type: 'plain_text', text: 'Start Date' }
          },
          {
            type: 'input',
            block_id: 'end_date',
            element: { type: 'datepicker', action_id: 'end_date_input' },
            label: { type: 'plain_text', text: 'End Date' }
          }
        ]
      }
    });
  } catch (error) {
    logger?.error?.("Error opening legacy add sprint modal:", error);
  }
});

/**
 * /admin-disciplines
 * Lists all disciplines and allows managing team members
 */
slackApp.command(getEnvironmentCommand('admin-disciplines'), async ({ command, ack, client, logger }) => {
  await ack();
  
  try {
    // Check if user is in admin channel
    const isAdmin = command.channel_id === process.env.ADMIN_CHANNEL_ID;
    if (!isAdmin) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: "This command can only be used in the admin channel."
      });
      return;
    }

    // Open fast, then update to the full view (trigger_id expires quickly).
    const probeView = {
      type: 'modal',
      title: { type: 'plain_text', text: 'Disciplines' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Loading disciplines…' } }]
    };

    const opened = await client.views.open({ trigger_id: command.trigger_id, view: probeView });

    const view = await buildAdminDisciplinesModalView({ discipline: 'account', showInactive: false });
    await client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view });
  } catch (error) {
    logger.error("Error handling admin-disciplines command:", error);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Error: ${error.message}`
    });
  }
});

/**
 * admin_disciplines_select: in-place navigation between disciplines
 */
slackApp.action('admin_disciplines_select', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const selected = action?.selected_option?.value || null;
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const showInactive = !!meta.showInactive;

    const view = await buildAdminDisciplinesModalView({ discipline: selected, showInactive });
    await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
  } catch (error) {
    logger?.error?.("Error updating discipline modal:", error);
  }
});

/**
 * admin_disciplines_toggle_inactive: show/hide inactive users section
 */
slackApp.action('admin_disciplines_toggle_inactive', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const meta = JSON.parse(body.view.private_metadata || '{}');
    const discipline = meta.discipline || 'account';
    const showInactive = !meta.showInactive;

    const view = await buildAdminDisciplinesModalView({ discipline, showInactive });
    await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
  } catch (error) {
    logger?.error?.("Error toggling inactive section:", error);
  }
});

/**
 * admin_disciplines_deactivate: Remove from rotations (global deactivate)
 */
slackApp.action('admin_disciplines_deactivate', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const payload = JSON.parse(action.value || '{}');
    const slackId = payload.slackId;
    const discipline = payload.discipline || (JSON.parse(body.view.private_metadata || '{}').discipline || 'account');
    if (!slackId) return;

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    if (useDatabase) {
      await UsersRepository.deactivateUser(slackId, body.user?.id || 'system');
      await cache.del('disciplines:all');
    } else {
      const sourceFile = getDisciplinesSourceFile();
      const disciplinesObj = loadJSON(sourceFile) || {};
      for (const [disc, members] of Object.entries(disciplinesObj || {})) {
        if (!Array.isArray(members)) continue;
        disciplinesObj[disc] = members.map(m => (m?.slackId === slackId ? { ...m, active: false } : m));
      }
      saveJSON(sourceFile, disciplinesObj);
    }

    const meta = JSON.parse(body.view.private_metadata || '{}');
    const view = await buildAdminDisciplinesModalView({ discipline, showInactive: !!meta.showInactive });
    await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
  } catch (error) {
    logger?.error?.("Error deactivating user:", error);
  }
});

/**
 * admin_disciplines_reactivate: Reactivate globally
 */
slackApp.action('admin_disciplines_reactivate', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const payload = JSON.parse(action.value || '{}');
    const slackId = payload.slackId;
    const discipline = payload.discipline || (JSON.parse(body.view.private_metadata || '{}').discipline || 'account');
    if (!slackId) return;

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    if (useDatabase) {
      await UsersRepository.reactivateUser(slackId, body.user?.id || 'system');
      await cache.del('disciplines:all');
    } else {
      const sourceFile = getDisciplinesSourceFile();
      const disciplinesObj = loadJSON(sourceFile) || {};
      for (const [disc, members] of Object.entries(disciplinesObj || {})) {
        if (!Array.isArray(members)) continue;
        disciplinesObj[disc] = members.map(m => (m?.slackId === slackId ? { ...m, active: true } : m));
      }
      saveJSON(sourceFile, disciplinesObj);
    }
  } catch (error) {
    logger?.error?.("Error reactivating user:", error);
  }
});

/**
 * admin_disciplines_add_member: push add-member form
 */
slackApp.action('admin_disciplines_add_member', async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const triggerId = body?.trigger_id;
    if (!triggerId) return;
    const payload = JSON.parse(action.value || '{}');
    const discipline = payload.discipline || (JSON.parse(body.view.private_metadata || '{}').discipline || 'account');
    const parentMeta = JSON.parse(body.view.private_metadata || '{}');
    const showInactive = !!parentMeta.showInactive;

    const addView = {
      type: 'modal',
      callback_id: 'admin_disciplines_add_member_modal',
      title: { type: 'plain_text', text: 'Add member' },
      submit: { type: 'plain_text', text: 'Add' },
      close: { type: 'plain_text', text: 'Cancel' },
      private_metadata: JSON.stringify({ parentViewId: body.view.id, discipline, showInactive }),
      blocks: [
        {
          type: 'input',
          block_id: 'member_name',
          label: { type: 'plain_text', text: 'Name' },
          element: { type: 'plain_text_input', action_id: 'member_name_input' }
        },
        {
          type: 'input',
          block_id: 'member_slack_id',
          label: { type: 'plain_text', text: 'Slack user' },
          element: { type: 'users_select', action_id: 'member_slack_id_input' }
        }
      ]
    };

    await client.views.push({ trigger_id: triggerId, view: addView });
  } catch (error) {
    logger?.error?.('Error pushing add member modal:', error);
  }
});

slackApp.view('admin_disciplines_add_member_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  try {
    const meta = JSON.parse(view.private_metadata || '{}');
    const discipline = meta.discipline || 'account';
    const parentViewId = meta.parentViewId;
    const showInactive = !!meta.showInactive;

    const name = view.state.values.member_name.member_name_input.value;
    const slackId = view.state.values.member_slack_id.member_slack_id_input.selected_user;
    if (!name || !slackId) throw new Error('Name and Slack user are required.');

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    if (useDatabase) {
      await UsersRepository.addUser(slackId, name, discipline, body.user?.id || 'system');
      await cache.del('disciplines:all');
    } else {
      const sourceFile = getDisciplinesSourceFile();
      const disciplinesObj = loadJSON(sourceFile) || {};
      if (!disciplinesObj[discipline]) disciplinesObj[discipline] = [];
      const idx = disciplinesObj[discipline].findIndex(m => m?.slackId === slackId);
      if (idx >= 0) {
        disciplinesObj[discipline][idx] = { ...disciplinesObj[discipline][idx], name, active: true };
      } else {
        disciplinesObj[discipline].push({ name, slackId, active: true });
      }
      saveJSON(sourceFile, disciplinesObj);
    }

    // Refresh parent view (Slack will pop back to it after submit).
    if (parentViewId) {
      const updated = await buildAdminDisciplinesModalView({ discipline, showInactive });
      await client.views.update({ view_id: parentViewId, view: updated });
    }
  } catch (error) {
    logger?.error?.('Error adding member:', error);
  }
});

/**
 * /admin-users
 * User-centric admin view (active/inactive, edit, deactivate/reactivate).
 */
slackApp.command(getEnvironmentCommand('admin-users'), async ({ command, ack, client, logger }) => {
  await ack();
  try {
    const isAdmin = command.channel_id === process.env.ADMIN_CHANNEL_ID;
    if (!isAdmin) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: "This command can only be used in the admin channel."
      });
      return;
    }

    const probeView = {
      type: "modal",
      title: { type: "plain_text", text: "Admin Users" },
      close: { type: "plain_text", text: "Close" },
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "Loading users…" } }]
    };

    const opened = await client.views.open({ trigger_id: command.trigger_id, view: probeView });

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    let users = [];
    if (useDatabase) {
      users = await UsersRepository.getAllUsers();
    } else {
      // JSON fallback: flatten disciplines.json into a user list.
      const disciplines = await readDisciplines();
      const seen = new Map(); // slackId -> {name, discipline, active}
      for (const [role, members] of Object.entries(disciplines || {})) {
        if (!Array.isArray(members)) continue;
        for (const m of members) {
          if (!m?.slackId) continue;
          if (!seen.has(m.slackId)) {
            seen.set(m.slackId, {
              slackId: m.slackId,
              name: m.name || m.slackId,
              discipline: role,
              active: m.active !== false
            });
          }
        }
      }
      users = Array.from(seen.values());
    }

    const activeUsers = users.filter(u => u.active);
    const inactiveUsers = users.filter(u => !u.active);

    const blocks = [
      { type: "header", text: { type: "plain_text", text: "Admin: Users" } },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Manage users without deleting them. Deactivated users are removed from all rotations." }
      },
      { type: "divider" },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Add User" }, style: "primary", action_id: "admin_users_add" },
        ]
      },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: `*Active* (${activeUsers.length})` } }
    ];

    const renderUserRow = (u) => {
      const statusLabel = u.active ? "Active" : "Inactive";
      const buttonText = u.active ? "Deactivate" : "Reactivate";
      const buttonStyle = u.active ? "danger" : "primary";
      const actionId = u.active ? "admin_users_deactivate" : "admin_users_reactivate";

      return {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${u.name}* (<@${u.slackId}>)\nDiscipline: \`${u.discipline}\` • Status: *${statusLabel}*`
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: buttonText },
          style: buttonStyle,
          action_id: actionId,
          value: JSON.stringify({ slackId: u.slackId })
        }
      };
    };

    // Keep modal under Slack 100-block limit. Each user row is 1 block.
    activeUsers.slice(0, 35).forEach(u => blocks.push(renderUserRow(u)));

    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Inactive* (${inactiveUsers.length})` } });
    inactiveUsers.slice(0, 35).forEach(u => blocks.push(renderUserRow(u)));

    if (blocks.length > 100) blocks.splice(100);

    await client.views.update({
      view_id: opened.view.id,
      hash: opened.view.hash,
      view: {
        type: "modal",
        callback_id: "admin_users_modal",
        title: { type: "plain_text", text: "Admin Users" },
        close: { type: "plain_text", text: "Close" },
        private_metadata: JSON.stringify({ useDatabase }),
        blocks
      }
    });
  } catch (error) {
    logger.error("Error handling admin-users command:", error);
    try {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `Error: ${error.message}`
      });
    } catch {}
  }
});

// Admin Users: Add User flow
slackApp.action('admin_users_add', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const triggerId = body?.trigger_id || null;

    const blocks = [
      {
        type: "input",
        block_id: "discipline",
        label: { type: "plain_text", text: "Discipline" },
        element: {
          type: "static_select",
          action_id: "discipline_select",
          placeholder: { type: "plain_text", text: "Select a discipline" },
          options: [
            { text: { type: "plain_text", text: "Account" }, value: "account" },
            { text: { type: "plain_text", text: "Producer" }, value: "producer" },
            { text: { type: "plain_text", text: "PO" }, value: "po" },
            { text: { type: "plain_text", text: "UI Engineer" }, value: "uiEng" },
            { text: { type: "plain_text", text: "BE Engineer" }, value: "beEng" },
          ]
        }
      },
      {
        type: "input",
        block_id: "slack_user",
        label: { type: "plain_text", text: "Slack user" },
        element: {
          type: "users_select",
          action_id: "slack_user_select",
          placeholder: { type: "plain_text", text: "Select a user" }
        }
      },
      {
        type: "input",
        block_id: "display_name",
        optional: true,
        label: { type: "plain_text", text: "Display name (optional)" },
        element: {
          type: "plain_text_input",
          action_id: "display_name_input",
          placeholder: { type: "plain_text", text: "If omitted, we’ll use the name you enter here." }
        }
      }
    ];

    const addUserView = {
      type: "modal",
      callback_id: "admin_users_add_modal",
      title: { type: "plain_text", text: "Add User" },
      submit: { type: "plain_text", text: "Add" },
      close: { type: "plain_text", text: "Cancel" },
      private_metadata: JSON.stringify({ parentViewId: body.view?.id || null }),
      blocks
    };

    if (!triggerId) {
      // If trigger_id is missing, we can't open/push a modal. Update current view with an error instead.
      await client.views.update({
        view_id: body.view.id,
        hash: body.view.hash,
        view: {
          type: "modal",
          callback_id: "admin_users_modal",
          title: { type: "plain_text", text: "Admin Users" },
          close: { type: "plain_text", text: "Close" },
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: "*Unable to open Add User*\nSlack did not provide a valid `trigger_id` for this action. Please close and reopen `/admin-users` and try again." }
            }
          ]
        }
      });
      return;
    }

    // From inside a modal, prefer views.push (stacks another modal).
    try {
      await client.views.push({ trigger_id: triggerId, view: addUserView });
      return;
    } catch (pushErr) {
      logger?.warn?.('[admin_users_add] views.push failed, falling back to views.open', {
        error: pushErr?.data?.error || pushErr?.message
      });
    }

    // Fallback: some contexts may still allow views.open
    await client.views.open({ trigger_id: triggerId, view: addUserView });
  } catch (error) {
    logger?.error?.('[admin_users_add] failed to open modal', {
      error: error?.data?.error || error?.message,
      details: error?.data || null
    });
    try {
      // Always show feedback in the existing modal (no DM permissions needed)
      await client.views.update({
        view_id: body.view.id,
        hash: body.view.hash,
        view: {
          type: "modal",
          callback_id: "admin_users_modal",
          title: { type: "plain_text", text: "Admin Users" },
          close: { type: "plain_text", text: "Close" },
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Unable to open Add User*\n\`${error?.data?.error || 'unknown_error'}\`\nTry again in a moment (Slack trigger IDs can expire quickly).` }
            }
          ]
        }
      });
    } catch {}
  }
});

slackApp.view('admin_users_add_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  try {
    const discipline = view.state.values.discipline.discipline_select.selected_option?.value || null;
    const slackId = view.state.values.slack_user.slack_user_select.selected_user || null;
    const displayName = view.state.values.display_name?.display_name_input?.value || null;

    if (!discipline || !slackId) {
      throw new Error('Discipline and Slack user are required.');
    }

    const name = displayName && String(displayName).trim() ? String(displayName).trim() : slackId;

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    if (useDatabase) {
      await UsersRepository.addUser(slackId, name, discipline, body.user?.id || 'system');
      await cache.del('disciplines:all');
    } else {
      // JSON fallback: edit raw file (not readDisciplines() which filters inactive)
      const disciplines = loadJSON(DISCIPLINES_FILE) || {};
      if (!disciplines[discipline]) disciplines[discipline] = [];
      const existingIdx = disciplines[discipline].findIndex(m => m?.slackId === slackId);
      if (existingIdx >= 0) {
        disciplines[discipline][existingIdx] = { ...disciplines[discipline][existingIdx], name, active: true };
      } else {
        disciplines[discipline].push({ name, slackId, active: true });
      }
      saveJSON(DISCIPLINES_FILE, disciplines);
    }

    // Try to refresh the admin-users modal if it’s still open
    try {
      const meta = JSON.parse(view.private_metadata || '{}');
      if (meta.parentViewId) {
        await rebuildAdminUsersModal({
          client,
          viewId: meta.parentViewId,
          viewHash: null,
          logger
        });
      }
    } catch {}

    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Added/updated user *${name}* (<@${slackId}>) in \`${discipline}\`.`
    });
  } catch (error) {
    logger?.error?.('[admin_users_add_modal] failed', error);
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Error adding user: ${error.message}`
    });
  }
});

async function rebuildAdminUsersModal({ client, viewId, viewHash, logger }) {
  const useDatabase =
    process.env.USE_DATABASE !== 'false' &&
    !!process.env.DATABASE_URL;

  let users = [];
  if (useDatabase) {
    users = await UsersRepository.getAllUsers();
  } else {
    const disciplines = await readDisciplines();
    const seen = new Map();
    for (const [role, members] of Object.entries(disciplines || {})) {
      if (!Array.isArray(members)) continue;
      for (const m of members) {
        if (!m?.slackId) continue;
        if (!seen.has(m.slackId)) {
          seen.set(m.slackId, {
            slackId: m.slackId,
            name: m.name || m.slackId,
            discipline: role,
            active: m.active !== false
          });
        }
      }
    }
    users = Array.from(seen.values());
  }

  const activeUsers = users.filter(u => u.active);
  const inactiveUsers = users.filter(u => !u.active);

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "Admin: Users" } },
    { type: "section", text: { type: "mrkdwn", text: "Manage users without deleting them. Deactivated users are removed from all rotations." } },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Add User" }, style: "primary", action_id: "admin_users_add" },
      ]
    },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*Active* (${activeUsers.length})` } }
  ];

  const renderUserRow = (u) => {
    const statusLabel = u.active ? "Active" : "Inactive";
    const buttonText = u.active ? "Deactivate" : "Reactivate";
    const buttonStyle = u.active ? "danger" : "primary";
    const actionId = u.active ? "admin_users_deactivate" : "admin_users_reactivate";

    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${u.name}* (<@${u.slackId}>)\nDiscipline: \`${u.discipline}\` • Status: *${statusLabel}*`
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: buttonText },
        style: buttonStyle,
        action_id: actionId,
        value: JSON.stringify({ slackId: u.slackId })
      }
    };
  };

  activeUsers.slice(0, 35).forEach(u => blocks.push(renderUserRow(u)));
  blocks.push({ type: "divider" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Inactive* (${inactiveUsers.length})` } });
  inactiveUsers.slice(0, 35).forEach(u => blocks.push(renderUserRow(u)));

  if (blocks.length > 100) blocks.splice(100);

  const updateArgs = {
    view_id: viewId,
    view: {
      type: "modal",
      callback_id: "admin_users_modal",
      title: { type: "plain_text", text: "Admin Users" },
      close: { type: "plain_text", text: "Close" },
      private_metadata: JSON.stringify({ useDatabase }),
      blocks
    }
  };
  if (viewHash) updateArgs.hash = viewHash;

  await client.views.update(updateArgs);
}

slackApp.action('admin_users_deactivate', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const { slackId } = JSON.parse(body.actions?.[0]?.value || '{}');
    if (!slackId) return;

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    if (useDatabase) {
      await UsersRepository.deactivateUser(slackId, body.user?.id || 'system');
      await cache.del('disciplines:all');
    } else {
      const disciplines = await readDisciplines();
      for (const [disc, members] of Object.entries(disciplines || {})) {
        if (!Array.isArray(members)) continue;
        disciplines[disc] = members.map(m => (m?.slackId === slackId ? { ...m, active: false } : m));
      }
      saveJSON(DISCIPLINES_FILE, disciplines);
    }

    await rebuildAdminUsersModal({ client, viewId: body.view.id, viewHash: body.view.hash, logger });
  } catch (error) {
    logger?.error?.("Error deactivating user:", error);
  }
});

slackApp.action('admin_users_reactivate', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    const { slackId } = JSON.parse(body.actions?.[0]?.value || '{}');
    if (!slackId) return;

    const useDatabase =
      process.env.USE_DATABASE !== 'false' &&
      !!process.env.DATABASE_URL;

    if (useDatabase) {
      await UsersRepository.reactivateUser(slackId, body.user?.id || 'system');
      await cache.del('disciplines:all');
    } else {
      const disciplines = await readDisciplines();
      for (const [disc, members] of Object.entries(disciplines || {})) {
        if (!Array.isArray(members)) continue;
        disciplines[disc] = members.map(m => (m?.slackId === slackId ? { ...m, active: true } : m));
      }
      saveJSON(DISCIPLINES_FILE, disciplines);
    }

    await rebuildAdminUsersModal({ client, viewId: body.view.id, viewHash: body.view.hash, logger });
  } catch (error) {
    logger?.error?.("Error reactivating user:", error);
  }
});

module.exports = {};
module.exports = {};