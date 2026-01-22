/**
 * lib/prisma-client.js
 * Singleton PrismaClient instance with proper connection management
 * 
 * Best practice: Use a single PrismaClient instance across the application
 * to avoid connection pool exhaustion and connection reset issues.
 * 
 * Prisma automatically manages connection pooling. The "Connection reset by peer"
 * warnings in PostgreSQL logs are normal when clients disconnect and don't indicate
 * an error - they're just informational messages.
 */

const { PrismaClient } = require('@prisma/client');

// Create a singleton instance
let prisma = null;

function getPrismaClient() {
  if (!prisma) {
    // Configure connection pooling via DATABASE_URL query parameters if needed
    // Prisma uses connection pooling automatically, but you can tune it:
    // ?connection_limit=10&pool_timeout=20
    const databaseUrl = process.env.DATABASE_URL;
    
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      errorFormat: 'pretty',
    });

    // Handle graceful shutdown to prevent connection reset warnings
    const gracefulShutdown = async (signal) => {
      console.log(`[Prisma] Received ${signal}, disconnecting...`);
      try {
        await prisma.$disconnect();
        console.log('[Prisma] Disconnected successfully');
      } catch (error) {
        console.error('[Prisma] Error during disconnect:', error);
      }
    };

    // Only register handlers once
    if (!process.listeners('beforeExit').some(l => l.name === 'prismaShutdown')) {
      process.on('beforeExit', async () => {
        await gracefulShutdown('beforeExit');
      });
    }

    if (!process.listeners('SIGINT').some(l => l.name === 'prismaShutdown')) {
      process.on('SIGINT', async () => {
        await gracefulShutdown('SIGINT');
        process.exit(0);
      });
    }

    if (!process.listeners('SIGTERM').some(l => l.name === 'prismaShutdown')) {
      process.on('SIGTERM', async () => {
        await gracefulShutdown('SIGTERM');
        process.exit(0);
      });
    }
  }

  return prisma;
}

module.exports = getPrismaClient();

