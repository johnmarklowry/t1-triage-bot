const prisma = require('../lib/prisma-client');
const config = require('../config');

async function getDisciplinesForCurrentEnv() {
  return prisma.discipline.findMany({ where: { env: config.env }, orderBy: { name: 'asc' } });
}

module.exports = {
  getDisciplinesForCurrentEnv,
};
