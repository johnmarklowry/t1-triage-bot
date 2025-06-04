/********************************
 * server.js
 ********************************/
const express = require('express');
require('dotenv').config();
const { scheduleDailyJobs } = require('./triageScheduler');
const testRoutes = require('./testRoutes');
require('./adminCommands');

// require override Handler file
require('./overrideHandler');

// require Bot Mention Handler for SLA assessment
require('./botMentionHandler');

// Import our Slack Bolt app and its receiver (which is an Express app)
const { slackApp, receiver } = require('./appHome');

const app = express();

// Mount test routes on the same Express app that the Slack receiver uses
app.use('/test', testRoutes);

// Health check route
app.get('/', (req, res) => {
  res.send('Triage Rotation App is running. Everything looks good!');
});

// IMPORTANT: Mount the Slack receiver's Express instance
app.use(receiver.app);

// Start the combined server on process.env.PORT (Glitch uses this port)
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Combined server is running on port ${port}`);
  scheduleDailyJobs();
});