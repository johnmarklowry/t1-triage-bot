/********************************
 * server.js
 ********************************/
const express = require('express');
require('./loadEnv').loadEnv();
const { scheduleDailyJobs } = require('./triageScheduler');
const testRoutes = require('./testRoutes');
require('./adminCommands');

// require override Handler file
require('./overrideHandler');

// require Bot Mention Handler for SLA assessment
require('./botMentionHandler');

// require Schedule Command Handler for date-based queries
require('./scheduleCommandHandler');

// Import our Slack Bolt app, its receiver, and receiver mode
const { slackApp, receiver, receiverMode } = require('./appHome');

// Import database modules
const { testConnection, getHealthStatus } = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const { setupDatabase } = require('./setup-database');
const railwayCronRouter = require('./routes/railwayCron');

const app = express();

// Lightweight access logging for Slack HTTP traffic (helps diagnose missing interactivity/options calls in HTTP mode).
// Avoid logging request bodies or secrets; log only path/method/status/timing.
app.use((req, res, next) => {
  if (req.path === '/slack/events') {
    const start = Date.now();
    const ua = req.get('user-agent') || '';
    const hasSig = !!req.get('x-slack-signature');
    const hasTs = !!req.get('x-slack-request-timestamp');
    const contentType = req.get('content-type') || '';
    const contentLength = req.get('content-length') || '';
    res.on('finish', () => {
      // eslint-disable-next-line no-console
      console.log('[slack-events]', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        hasSig,
        hasTs,
        contentType: contentType.slice(0, 80),
        contentLength,
        ua: ua.slice(0, 80)
      });
    });
  }
  next();
});

// Mount test routes on the same Express app that the Slack receiver uses
app.use('/test', testRoutes);
app.use('/jobs', railwayCronRouter);

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

// IMPORTANT: Mount the Slack receiver's Express instance only in HTTP mode.
// In Socket Mode, Slack events come over websockets; Express is still used for healthchecks/jobs.
if (receiverMode === 'http' && receiver && receiver.app) {
  app.use(receiver.app);
}

// Initialize database and start server
async function initializeServer() {
  try {
    console.log('[SERVER] Initializing database...');
    
    // Only run custom migrations if not using Prisma Migrate
    // Prisma Migrate is handled by Railway's startCommand: "npx prisma migrate deploy && npm start"
    const usePrismaMigrations = process.env.USE_PRISMA_MIGRATIONS !== 'false';
    
    if (!usePrismaMigrations) {
      console.log('[SERVER] Running custom migrations (Prisma Migrate disabled)...');
      // Run full database setup (migrations + data migration)
      await setupDatabase();
      console.log('[SERVER] Database setup completed');
    } else {
      console.log('[SERVER] Using Prisma Migrate (handled by Railway startCommand or manual migration)');
      // Still run data migration if needed (migrating JSON files to database)
      const { runMigration: migrateJsonData } = require('./db/migrate-json-data');
      const fs = require('fs');
      const path = require('path');
      const jsonFiles = ['sprints.json', 'disciplines.json', 'currentState.json', 'overrides.json'];
      const hasJsonFiles = jsonFiles.some(file => fs.existsSync(path.join(__dirname, file)));
      if (hasJsonFiles) {
        console.log('[SERVER] Migrating JSON data to database...');
        await migrateJsonData();
      }
    }
    
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.error('[SERVER] Database connection failed, but continuing with fallback to JSON files');
    }
    
    // Start Slack Socket Mode if enabled (Express still starts regardless for healthcheck/jobs).
    if (receiverMode === 'socket') {
      await slackApp.start();
      console.log('[SERVER] Slack app started in Socket Mode');
    } else if (receiverMode === 'disabled') {
      console.log('[SERVER] Slack app disabled; starting HTTP server for healthchecks/jobs only');
    }

    // Start the combined server on process.env.PORT
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      scheduleDailyJobs();
    });
    
  } catch (error) {
    console.error('[SERVER] Initialization failed:', error);
    console.log('[SERVER] Starting server with fallback to JSON files...');
    
    // Start Slack Socket Mode (best effort)
    if (receiverMode === 'socket') {
      try {
        await slackApp.start();
        console.log('[SERVER] Slack app started in Socket Mode (fallback)');
      } catch (socketErr) {
        console.error('[SERVER] Failed to start Slack app in Socket Mode:', socketErr);
      }
    } else if (receiverMode === 'disabled') {
      console.log('[SERVER] Slack app disabled (fallback); starting HTTP server for healthchecks/jobs only');
    }

    // Start server anyway with JSON fallback
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Server is running on port ${port} (JSON fallback mode)`);
      scheduleDailyJobs();
    });
  }
}

// Start the server
initializeServer();