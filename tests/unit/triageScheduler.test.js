const { describe, it, expect, mock, beforeEach, afterEach, afterAll } = require('bun:test');

const cronScheduleMock = mock(() => ({ stop: mock(() => {}) }));
const run5pmCheckMock = mock(async () => {});
const run8amCheckMock = mock(async () => {});

mock.module('node-cron', () => ({
  schedule: cronScheduleMock,
}));

mock.module('../../triageLogic', () => ({
  run5pmCheck: run5pmCheckMock,
  run8amCheck: run8amCheckMock,
}));

function loadScheduler() {
  const modulePath = require.resolve('../../triageScheduler');
  delete require.cache[modulePath];
  return require('../../triageScheduler');
}

describe('triageScheduler.scheduleDailyJobs', () => {
  const originalEnableInAppCron = process.env.ENABLE_IN_APP_CRON;

  beforeEach(() => {
    mock.clearAllMocks();
    delete process.env.ENABLE_IN_APP_CRON;
  });

  afterEach(() => {
    if (originalEnableInAppCron === undefined) {
      delete process.env.ENABLE_IN_APP_CRON;
    } else {
      process.env.ENABLE_IN_APP_CRON = originalEnableInAppCron;
    }
  });

  it('does not register cron jobs when ENABLE_IN_APP_CRON is not true', () => {
    process.env.ENABLE_IN_APP_CRON = 'false';
    const { scheduleDailyJobs } = loadScheduler();

    scheduleDailyJobs();

    expect(cronScheduleMock).not.toHaveBeenCalled();
  });

  it('registers 5PM and 8AM PT cron jobs when ENABLE_IN_APP_CRON is true', () => {
    process.env.ENABLE_IN_APP_CRON = 'true';
    const { scheduleDailyJobs } = loadScheduler();

    scheduleDailyJobs();

    expect(cronScheduleMock).toHaveBeenCalledTimes(2);

    const firstCall = cronScheduleMock.mock.calls[0];
    expect(firstCall[0]).toBe('0 17 * * *');
    expect(typeof firstCall[1]).toBe('function');
    expect(firstCall[2]).toEqual({ timezone: 'America/Los_Angeles' });

    const secondCall = cronScheduleMock.mock.calls[1];
    expect(secondCall[0]).toBe('0 8 * * *');
    expect(typeof secondCall[1]).toBe('function');
    expect(secondCall[2]).toEqual({ timezone: 'America/Los_Angeles' });
  });

  it('executes the scheduled callbacks and calls run5pmCheck/run8amCheck', async () => {
    process.env.ENABLE_IN_APP_CRON = 'true';
    const { scheduleDailyJobs } = loadScheduler();

    scheduleDailyJobs();

    const fivePmCallback = cronScheduleMock.mock.calls[0][1];
    const eightAmCallback = cronScheduleMock.mock.calls[1][1];

    await fivePmCallback();
    await eightAmCallback();

    expect(run5pmCheckMock).toHaveBeenCalledTimes(1);
    expect(run8amCheckMock).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => {
  mock.restore();
});
