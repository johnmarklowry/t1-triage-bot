const fs = require('fs');
const path = require('path');

const { UsersRepository } = require('../db/repository');
const {
  DISCIPLINES_FILE,
  readSprints,
  findCurrentSprint,
  findNextSprint,
  loadJSON
} = require('../dataUtils');

const DISCIPLINE_OPTIONS = [
  { label: 'Account', value: 'account' },
  { label: 'Producer', value: 'producer' },
  { label: 'PO', value: 'po' },
  { label: 'UI Engineer', value: 'uiEng' },
  { label: 'BE Engineer', value: 'beEng' },
];

function getDisciplinesSourceFile() {
  const isStaging = process.env.TRIAGE_ENV === 'staging' || process.env.NODE_ENV === 'staging';
  const stagingPath = path.join(__dirname, '..', 'disciplines.staging.json');
  if (isStaging && fs.existsSync(stagingPath)) return stagingPath;
  return DISCIPLINES_FILE;
}

function buildConfirm({ title, bodyText, confirmText }) {
  return {
    title: { type: 'plain_text', text: title },
    text: { type: 'mrkdwn', text: bodyText },
    confirm: { type: 'plain_text', text: confirmText },
    deny: { type: 'plain_text', text: 'Cancel' }
  };
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

async function buildAdminUsersModalView() {
  const useDatabase =
    process.env.USE_DATABASE !== 'false' &&
    !!process.env.DATABASE_URL;

  let users = [];
  if (useDatabase) {
    users = await UsersRepository.getAllUsers();
  } else {
    // JSON fallback: flatten disciplines.json into a user list (include inactive).
    const sourceFile = getDisciplinesSourceFile();
    const disciplines = loadJSON(sourceFile) || {};
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

  const deactivateConfirm = buildConfirm({
    title: 'Deactivate user',
    bodyText: 'This will deactivate the user and remove them from *all* rotations.\n\n- They will not appear in rotation picks until reactivated.\n- This does *not* delete the user.',
    confirmText: 'Deactivate'
  });

  const reactivateConfirm = buildConfirm({
    title: 'Reactivate user',
    bodyText: 'This will reactivate the user and include them in rotations again.',
    confirmText: 'Reactivate'
  });

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "Admin: Users" } },
    { type: "section", text: { type: "mrkdwn", text: "Manage users without deleting them. Deactivated users are removed from all rotations." } },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Add a user*\nAdd a user to a discipline rotation." },
      accessory: { type: "button", text: { type: "plain_text", text: "Add User" }, style: "primary", action_id: "admin_users_add" }
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
        value: JSON.stringify({ slackId: u.slackId }),
        confirm: u.active ? deactivateConfirm : reactivateConfirm
      }
    };
  };

  // Keep modal under Slack 100-block limit. Each user row is 1 block.
  activeUsers.slice(0, 35).forEach(u => blocks.push(renderUserRow(u)));
  blocks.push({ type: "divider" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Inactive* (${inactiveUsers.length})` } });
  inactiveUsers.slice(0, 35).forEach(u => blocks.push(renderUserRow(u)));

  if (blocks.length > 100) blocks.splice(100);

  return {
    type: "modal",
    callback_id: "admin_users_modal",
    title: { type: "plain_text", text: "Admin Users" },
    close: { type: "plain_text", text: "Close" },
    private_metadata: JSON.stringify({ useDatabase }),
    blocks
  };
}

module.exports = {
  DISCIPLINE_OPTIONS,
  getDisciplinesSourceFile,
  buildConfirm,
  buildAdminDisciplinesModalView,
  buildAdminSprintsModalView,
  buildAdminUsersModalView
};

