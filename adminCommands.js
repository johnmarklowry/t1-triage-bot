/**
 * adminCommands.js
 * Handles admin slash commands for managing sprints and disciplines
 */
// const fs = require('fs'); // Unused - keeping for potential future use
// const path = require('path'); // Unused - keeping for potential future use
const { slackApp } = require('./appHome');
const { getEnvironmentCommand } = require('./commandUtils');
const { 
  SPRINTS_FILE, 
  DISCIPLINES_FILE,
  readSprints,
  readDisciplines,
  saveJSON
} = require('./dataUtils');


/**
 * /admin-sprints
 * Lists all sprints and provides options to add new ones
 */
slackApp.command(getEnvironmentCommand('admin-sprints'), async ({ command, ack, client, logger }) => {
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
    
    // Get all sprints
    const sprints = readSprints();
    
    // Build blocks for the modal
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "Manage Sprints" }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Below are all configured sprints. You can add new sprints at the end of the list." }
      },
      { type: "divider" }
    ];
    
    // Add all sprints to the view
    sprints.forEach((sprint, index) => {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${index}: ${sprint.sprintName}*\nDates: ${sprint.startDate} to ${sprint.endDate}`
        }
      });
      
      if (index < sprints.length - 1) {
        blocks.push({ type: "divider" });
      }
    });
    
    // Add a button to add a new sprint
    blocks.push({ type: "divider" });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Add New Sprint" },
          style: "primary",
          action_id: "add_sprint"
        }
      ]
    });
    
    // Open the modal
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Sprint Management" },
        close: { type: "plain_text", text: "Close" },
        blocks
      }
    });
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
 * Handle add_sprint button click
 */
slackApp.action('add_sprint', async ({ ack, body, client, logger }) => {
  await ack();
  console.log("Add sprint button clicked");
  try {
    // Open a modal to add a new sprint
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "add_sprint_modal",
        title: { type: "plain_text", text: "Add New Sprint" },
        submit: { type: "plain_text", text: "Add" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "sprint_name",
            element: {
              type: "plain_text_input",
              action_id: "sprint_name_input",
              placeholder: { type: "plain_text", text: "e.g., FY27 Sp1" }
            },
            label: { type: "plain_text", text: "Sprint Name" }
          },
          {
            type: "input",
            block_id: "start_date",
            element: {
              type: "datepicker",
              action_id: "start_date_input",
              placeholder: { type: "plain_text", text: "Select start date" }
            },
            label: { type: "plain_text", text: "Start Date" }
          },
          {
            type: "input",
            block_id: "end_date",
            element: {
              type: "datepicker",
              action_id: "end_date_input",
              placeholder: { type: "plain_text", text: "Select end date" }
            },
            label: { type: "plain_text", text: "End Date" }
          }
        ]
      }
    });
  } catch (error) {
    logger.error("Error opening add sprint modal:", error);
  }
});

/**
 * Handle add_sprint_modal submission
 */
slackApp.view('add_sprint_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  try {
    // Extract the form values
    const sprintName = view.state.values.sprint_name.sprint_name_input.value;
    const startDate = view.state.values.start_date.start_date_input.selected_date;
    const endDate = view.state.values.end_date.end_date_input.selected_date;
    
    // Validate input
    if (!sprintName || !startDate || !endDate) {
      throw new Error("All fields are required");
    }
    
    // Validate end date is after start date
    if (new Date(endDate) <= new Date(startDate)) {
      throw new Error("End date must be after start date");
    }
    
    // Get current sprints
    const sprints = readSprints();
    
    // Add new sprint
    sprints.push({
      sprintName,
      startDate,
      endDate
    });
    
    // Save updated sprints
    saveJSON(SPRINTS_FILE, sprints);
    
    // Notify user
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Sprint "${sprintName}" (${startDate} to ${endDate}) has been added successfully.`
    });
    
    // Refresh the App Home view for all users
    // This would be implemented in your appHome.js file
    // refreshAppHomeForAllUsers();
  } catch (error) {
    logger.error("Error saving new sprint:", error);
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Error adding sprint: ${error.message}`
    });
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
    
    // Get all disciplines
    const disciplines = readDisciplines();
    
    // Build blocks for the modal
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "Manage Disciplines" }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Select a discipline to manage its members:" }
      }
    ];
    
    // Add buttons for each discipline
    const disciplineButtons = Object.keys(disciplines).map(role => ({
      type: "button",
      text: { type: "plain_text", text: role.charAt(0).toUpperCase() + role.slice(1) },
      action_id: `manage_discipline_${role}`,
      value: role
    }));
    
    blocks.push({
      type: "actions",
      elements: disciplineButtons
    });
    
    // Open the modal
    await client.views.open({
      trigger_id: command.trigger_id,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Discipline Management" },
        close: { type: "plain_text", text: "Close" },
        blocks
      }
    });
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
 * Handle discipline management button clicks
 */
slackApp.action(/manage_discipline_(.*)/, async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const role = action.value;
    const disciplines = readDisciplines();
    const members = disciplines[role] || [];
    
    // Build blocks for the discipline management modal
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `Manage ${role.charAt(0).toUpperCase() + role.slice(1)} Members` }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `Current members in the ${role} discipline:` }
      }
    ];
    
    // Add each member with a remove button
    members.forEach(member => {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${member.name}* (<@${member.slackId}>)`
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Remove" },
          style: "danger",
          action_id: `remove_member_${role}`,
          value: member.slackId
        }
      });
    });
    
    // Add button to add a new member
    blocks.push({ type: "divider" });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Add Member" },
          style: "primary",
          action_id: `add_member_${role}`,
          value: role
        }
      ]
    });
    
    // Open the modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "discipline_management_modal",
        title: { type: "plain_text", text: `${role.charAt(0).toUpperCase() + role.slice(1)} Management` },
        close: { type: "plain_text", text: "Close" },
        blocks,
        private_metadata: JSON.stringify({ role })
      }
    });
  } catch (error) {
    logger.error("Error opening discipline management modal:", error);
  }
});

/**
 * Handle remove_member button clicks
 */
slackApp.action(/remove_member_(.*)/,/add_member_(.*)/, async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const role = action.action_id.replace('remove_member_', '');
    const slackId = action.value;
    
    // Get current disciplines
    const disciplines = readDisciplines();
    
    // Remove the member
    if (disciplines[role]) {
      disciplines[role] = disciplines[role].filter(member => member.slackId !== slackId);
      
      // Save updated disciplines
      saveJSON(DISCIPLINES_FILE, disciplines);
      
      // Update the modal to reflect changes
      const metadata = JSON.parse(body.view.private_metadata);
      const members = disciplines[metadata.role] || [];
      
      // Rebuild blocks
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: `Manage ${metadata.role.charAt(0).toUpperCase() + metadata.role.slice(1)} Members` }
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `Current members in the ${metadata.role} discipline:` }
        }
      ];
      
      // Add each member with a remove button
      members.forEach(member => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${member.name}* (<@${member.slackId}>)`
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Remove" },
            style: "danger",
            action_id: `remove_member_${metadata.role}`,
            value: member.slackId
          }
        });
      });
      
      // Add button to add a new member
      blocks.push({ type: "divider" });
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Add Member" },
            style: "primary",
            action_id: `add_member_${metadata.role}`,
            value: metadata.role
          }
        ]
      });
      
      // Update the modal
      await client.views.update({
        view_id: body.view.id,
        view: {
          type: "modal",
          callback_id: "discipline_management_modal",
          title: { type: "plain_text", text: `${metadata.role.charAt(0).toUpperCase() + metadata.role.slice(1)} Management` },
          close: { type: "plain_text", text: "Close" },
          blocks,
          private_metadata: body.view.private_metadata
        }
      });
      
      // Notify that App Home views need to be refreshed
      await client.chat.postMessage({
        channel: process.env.ADMIN_CHANNEL_ID,
        text: `Member removed from ${role} discipline. App Home views will update on next access.`
      });
    }
  } catch (error) {
    logger.error("Error removing member:", error);
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: `Error removing member: ${error.message}`
    });
  }
});

/**
 * Handle add_member button clicks
 */
slackApp.action(/add_member_(.*)/, async ({ ack, body, client, logger, action }) => {
  await ack();
  try {
    const role = action.value;
    
    // Open a modal to add a new member
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "add_member_modal",
        title: { type: "plain_text", text: `Add ${role.charAt(0).toUpperCase() + role.slice(1)} Member` },
        submit: { type: "plain_text", text: "Add" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "member_name",
            element: {
              type: "plain_text_input",
              action_id: "member_name_input",
              placeholder: { type: "plain_text", text: "Full Name" }
            },
            label: { type: "plain_text", text: "Member Name" }
          },
          {
            type: "input",
            block_id: "member_slack_id",
            element: {
              type: "users_select",
              action_id: "member_slack_id_input",
              placeholder: { type: "plain_text", text: "Select user" }
            },
            label: { type: "plain_text", text: "Slack User" }
          }
        ],
        private_metadata: JSON.stringify({ role, originalViewId: body.view.id })
      }
    });
  } catch (error) {
    logger.error("Error opening add member modal:", error);
  }
});

/**
 * Handle add_member_modal submission
 */
slackApp.view('add_member_modal', async ({ ack, body, view, client, logger }) => {
  await ack();
  try {
    // Extract the form values
    const memberName = view.state.values.member_name.member_name_input.value;
    const slackId = view.state.values.member_slack_id.member_slack_id_input.selected_user;
    
    // Get metadata
    const metadata = JSON.parse(view.private_metadata);
    const role = metadata.role;
    
    // Validate input
    if (!memberName || !slackId) {
      throw new Error("Both name and Slack user are required");
    }
    
    // Get current disciplines
    const disciplines = readDisciplines();
    
    // Initialize role array if it doesn't exist
    if (!disciplines[role]) {
      disciplines[role] = [];
    }
    
    // Check if user already exists in this role
    const exists = disciplines[role].some(member => member.slackId === slackId);
    if (exists) {
      throw new Error(`User is already in the ${role} discipline`);
    }
    
    // Add new member
    disciplines[role].push({
      name: memberName,
      slackId
    });
    
    // Save updated disciplines
    saveJSON(DISCIPLINES_FILE, disciplines);
    
    // Notify user
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Member "${memberName}" (<@${slackId}>) has been added to the ${role} discipline.`
    });
    
    // If we have the original view ID, refresh that view
    if (metadata.originalViewId) {
      // Rebuild the discipline management modal
      const members = disciplines[role] || [];
      
      // Rebuild blocks
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: `Manage ${role.charAt(0).toUpperCase() + role.slice(1)} Members` }
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `Current members in the ${role} discipline:` }
        }
      ];
      
      // Add each member with a remove button
      members.forEach(member => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${member.name}* (<@${member.slackId}>)`
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Remove" },
            style: "danger",
            action_id: `remove_member_${role}`,
            value: member.slackId
          }
        });
      });
      
      // Add button to add a new member
      blocks.push({ type: "divider" });
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Add Member" },
            style: "primary",
            action_id: `add_member_${role}`,
            value: role
          }
        ]
      });
      
      // Try to update the original modal, may fail if it's already closed
      try {
        await client.views.update({
          view_id: metadata.originalViewId,
          view: {
            type: "modal",
            callback_id: "discipline_management_modal",
            title: { type: "plain_text", text: `${role.charAt(0).toUpperCase() + role.slice(1)} Management` },
            close: { type: "plain_text", text: "Close" },
            blocks,
            private_metadata: JSON.stringify({ role })
          }
        });
      } catch (updateError) {
        logger.warn("Could not update original view, it may be closed:", updateError);
      }
    }
  } catch (error) {
    logger.error("Error adding member:", error);
    await client.chat.postMessage({
      channel: process.env.ADMIN_CHANNEL_ID,
      text: `Error adding member: ${error.message}`
    });
  }
});

module.exports = {};