const { describe, it, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');

function readRailwayConfig() {
  const railwayPath = path.resolve(__dirname, '../../railway.json');
  const raw = fs.readFileSync(railwayPath, 'utf8');
  return JSON.parse(raw);
}

describe('railway.json cron contract', () => {
  it('keeps Railway cron target aligned with the webhook route', () => {
    const config = readRailwayConfig();
    const target = config?.environments?.production?.variables?.RAILWAY_CRON_TARGET;
    expect(target).toBe('/jobs/railway/notify-rotation');
  });

  it('keeps Railway cron schedule aligned with current operations policy', () => {
    const config = readRailwayConfig();
    const schedule = config?.environments?.production?.variables?.RAILWAY_CRON_SCHEDULE;
    expect(schedule).toBe('0 16 * * *');
  });
});
