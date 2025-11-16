const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function resolveAppEnv() {
  const env = process.env.APP_ENV || process.env.ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'production' : 'staging');
  return env.toLowerCase();
}

async function getDisciplinesForCurrentEnv() {
  const env = resolveAppEnv();
  return prisma.discipline.findMany({ where: { env }, orderBy: { name: 'asc' } });
}

module.exports = {
  getDisciplinesForCurrentEnv,
};
