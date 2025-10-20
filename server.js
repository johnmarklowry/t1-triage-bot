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

// Import database modules
const { testConnection, getHealthStatus } = require('./db/connection');
const { runMigrations } = require('./db/migrate');

const app = express();

// Mount test routes on the same Express app that the Slack receiver uses
app.use('/test', testRoutes);

// Health check route with database status
app.get('/', async (req, res) => {
  try {
    const dbHealth = await getHealthStatus();
    const status = {
      status: 'running',
      timestamp: new Date().toISOString(),
      database: dbHealth
    };
    
    if (dbHealth.status === 'healthy') {
      res.json(status);
    } else {
      res.status(503).json(status);
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// IMPORTANT: Mount the Slack receiver's Express instance
app.use(receiver.app);

// Initialize database and start server
async function initializeServer() {
  try {
    console.log('[SERVER] Initializing database...');
    
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.error('[SERVER] Database connection failed, but continuing with fallback to JSON files');
    }
    
    // Run migrations
    await runMigrations();
    console.log('[SERVER] Database migrations completed');
    
    // Start the combined server on process.env.PORT (Glitch uses this port)
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Combined server is running on port ${port}`);
      scheduleDailyJobs();
    });
    
  } catch (error) {
    console.error('[SERVER] Initialization failed:', error);
    console.log('[SERVER] Starting server with fallback to JSON files...');
    
    // Start server anyway with JSON fallback
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Combined server is running on port ${port} (JSON fallback mode)`);
      scheduleDailyJobs();
    });
  }
}

// Start the server
initializeServer();