/**
 * scheduleCommandHandler.js
 * Handles the /triage-schedule slash command for querying who will be on call on specific dates
 */
const { slackApp } = require('./appHome');
const { getEnvironmentCommand } = require('./commandUtils');
const { 
  readSprints, 
  getSprintUsers,
  parsePTDate,
  formatPTDate,
  getTodayPT
} = require('./dataUtils');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(timezone);

/**
 * Find the sprint that contains a specific date
 */
async function findSprintForDate(targetDate) {
  const sprints = await readSprints();
  const datePT = dayjs.tz(targetDate, "America/Los_Angeles");
  
  for (let i = 0; i < sprints.length; i++) {
    const { sprintName, startDate, endDate } = sprints[i];
    const sprintStart = parsePTDate(startDate);
    const sprintEnd = parsePTDate(endDate);
    
    // Skip sprints with invalid dates
    if (!sprintStart || !sprintEnd) {
      continue;
    }
    
    if (
      (datePT.isAfter(sprintStart) || datePT.isSame(sprintStart, 'day')) &&
      (datePT.isBefore(sprintEnd) || datePT.isSame(sprintEnd, 'day'))
    ) {
      return { index: i, sprintName, startDate, endDate };
    }
  }
  return null;
}

/**
 * Get user names from Slack IDs
 */
async function getUserNames(client, userIds) {
  const names = {};
  for (const [role, userId] of Object.entries(userIds)) {
    if (userId) {
      try {
        const userInfo = await client.users.info({ user: userId });
        names[role] = {
          slackId: userId,
          name: userInfo.user.real_name || userInfo.user.display_name || userInfo.user.name,
          username: userInfo.user.name
        };
      } catch (error) {
        console.error(`Error getting user info for ${userId}:`, error);
        names[role] = {
          slackId: userId,
          name: 'Unknown User',
          username: 'unknown'
        };
      }
    }
  }
  return names;
}

/**
 * Build the schedule display modal
 */
function buildScheduleModal(date, sprint, userNames) {
  const formattedDate = formatPTDate(date, 'dddd, MMMM DD, YYYY');
  
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `Triage Schedule for ${formattedDate}` }
    },
    {
      type: "section",
      text: { 
        type: "mrkdwn", 
        text: `*Sprint:* ${sprint.sprintName}\n*Period:* ${formatPTDate(sprint.startDate, 'MM/DD/YYYY')} - ${formatPTDate(sprint.endDate, 'MM/DD/YYYY')}` 
      }
    },
    { type: "divider" }
  ];

  // Add each discipline with assigned user
  const disciplines = {
    account: "Account",
    producer: "Producer", 
    po: "Product Owner",
    uiEng: "UI Engineering",
    beEng: "Backend Engineering"
  };

  for (const [role, displayName] of Object.entries(disciplines)) {
    const user = userNames[role];
    if (user) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${displayName}:*\n<@${user.slackId}> (${user.name})`
        }
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${displayName}:*\nNo assignment`
        }
      });
    }
  }

  return {
    type: "modal",
    title: { type: "plain_text", text: "Triage Schedule" },
    close: { type: "plain_text", text: "Close" },
    blocks
  };
}

/**
 * /triage-schedule slash command handler (environment-specific)
 */
slackApp.command(getEnvironmentCommand('triage-schedule'), async ({ command, ack, client, logger }) => {
  await ack();
  
  try {
    // Open modal for date selection
    const dateModal = {
      type: "modal",
      callback_id: "schedule_date_modal",
      title: { type: "plain_text", text: "Select Date" },
      submit: { type: "plain_text", text: "View Schedule" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "input",
          block_id: "schedule_date",
          element: {
            type: "datepicker",
            action_id: "date_input",
            placeholder: { type: "plain_text", text: "Select a date" },
            initial_date: dayjs().add(1, 'day').format('YYYY-MM-DD') // Default to tomorrow
          },
          label: { type: "plain_text", text: "Date to check" },
          hint: { type: "plain_text", text: "Select a future date to see who will be on call" }
        }
      ]
    };

    await client.views.open({
      trigger_id: command.trigger_id,
      view: dateModal
    });
  } catch (error) {
    logger.error("Error opening schedule date modal:", error);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `Error: ${error.message}`
    });
  }
});

/**
 * Handle schedule date modal submission
 */
slackApp.view('schedule_date_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  
  try {
    const selectedDate = view.state.values.schedule_date.date_input.selected_date;
    
    // Validate date
    const today = getTodayPT();
    const targetDate = dayjs.tz(selectedDate, "America/Los_Angeles");
    
    if (targetDate.isBefore(today, 'day')) {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: "Please select today or a future date. Past dates are not allowed."
      });
      return;
    }

    // Immediately update the existing modal to a lightweight loading view.
    // This avoids relying on trigger_id (which can expire quickly) and improves perceived responsiveness.
    try {
      await client.views.update({
        view_id: body.view.id,
        hash: body.view.hash,
        view: {
          type: "modal",
          callback_id: "schedule_loading_modal",
          title: { type: "plain_text", text: "Triage Schedule" },
          close: { type: "plain_text", text: "Close" },
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: "*Loading schedule…*" } },
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: `Fetching assignments for *${formatPTDate(selectedDate, 'MM/DD/YYYY')}*…` }]
            }
          ]
        }
      });
    } catch (updateError) {
      logger.warn("Failed to update schedule modal to loading state:", updateError);
      // Continue anyway; we can still attempt to update later.
    }

    // Find sprint for the selected date
    const sprint = await findSprintForDate(selectedDate);
    
    if (!sprint) {
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: `No sprint found for the selected date (${formatPTDate(selectedDate, 'MM/DD/YYYY')}). The date may be outside the configured sprint schedule.`
      });
      return;
    }

    // Get assignments for the sprint
    const assignments = await getSprintUsers(sprint.index);
    
    // Get user names from Slack IDs
    const userNames = await getUserNames(client, assignments);
    
    // Build and display the schedule modal
    const scheduleModal = buildScheduleModal(selectedDate, sprint, userNames);
    
    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: scheduleModal
    });
    
  } catch (error) {
    logger.error("Error processing schedule date:", error);
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `Error retrieving schedule: ${error.message}`
    });
  }
});

module.exports = { findSprintForDate, buildScheduleModal };
