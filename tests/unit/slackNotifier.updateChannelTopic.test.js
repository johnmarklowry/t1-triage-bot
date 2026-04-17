const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const { resetModuleCache, restoreAllMocks } = require('../helpers/mockIsolation');

restoreAllMocks();

const conversationsInfoMock = mock();
const conversationsSetTopicMock = mock();

mock.module('@slack/web-api', () => ({
  WebClient: class WebClient {
    constructor() {
      this.conversations = {
        info: (...args) => conversationsInfoMock(...args),
        setTopic: (...args) => conversationsSetTopicMock(...args),
      };
    }
  },
}));

const slackNotifierPath = path.resolve(__dirname, '../../slackNotifier.js');

function topicForUserIds(userIds) {
  const mentionList = userIds.map((id) => `<@${id}>`).join(', ');
  return (
    `Bug Link Only - keep conversations in threads.\n` + `Triage Team: ${mentionList}`
  );
}

describe('slackNotifier updateChannelTopic', () => {
  let updateChannelTopic;
  const origChannel = process.env.BUG_TRIAGE_CHANNEL_ID;
  const origToken = process.env.SLACK_BOT_TOKEN;

  beforeEach(() => {
    mock.clearAllMocks();
    resetModuleCache([slackNotifierPath]);
    delete require.cache[require.resolve(slackNotifierPath)];
    process.env.BUG_TRIAGE_CHANNEL_ID = 'C_BUG_TRIAGE';
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    ({ updateChannelTopic } = require(slackNotifierPath));
  });

  afterEach(() => {
    if (origChannel === undefined) delete process.env.BUG_TRIAGE_CHANNEL_ID;
    else process.env.BUG_TRIAGE_CHANNEL_ID = origChannel;
    if (origToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = origToken;
  });

  it('skips setTopic when conversations.info topic matches the desired topic', async () => {
    const userIds = ['U1', 'U2'];
    const expectedTopic = topicForUserIds(userIds);
    conversationsInfoMock.mockResolvedValue({
      ok: true,
      channel: { topic: { value: expectedTopic } },
    });
    conversationsSetTopicMock.mockResolvedValue({ ok: true });

    await updateChannelTopic(userIds);

    expect(conversationsInfoMock).toHaveBeenCalledTimes(1);
    expect(conversationsInfoMock.mock.calls[0][0]).toEqual({ channel: 'C_BUG_TRIAGE' });
    expect(conversationsSetTopicMock).not.toHaveBeenCalled();
  });

  it('calls setTopic when the current topic differs', async () => {
    const userIds = ['UA', 'UB'];
    const expectedTopic = topicForUserIds(userIds);
    conversationsInfoMock.mockResolvedValue({
      ok: true,
      channel: { topic: { value: 'old topic' } },
    });
    conversationsSetTopicMock.mockResolvedValue({ ok: true });

    await updateChannelTopic(userIds);

    expect(conversationsSetTopicMock).toHaveBeenCalledTimes(1);
    expect(conversationsSetTopicMock.mock.calls[0][0]).toEqual({
      channel: 'C_BUG_TRIAGE',
      topic: expectedTopic,
    });
  });

  it('calls setTopic when conversations.info fails (fail-open)', async () => {
    const userIds = ['UX'];
    const expectedTopic = topicForUserIds(userIds);
    conversationsInfoMock.mockRejectedValue(new Error('network'));
    conversationsSetTopicMock.mockResolvedValue({ ok: true });

    await updateChannelTopic(userIds);

    expect(conversationsSetTopicMock).toHaveBeenCalledTimes(1);
    expect(conversationsSetTopicMock.mock.calls[0][0]).toEqual({
      channel: 'C_BUG_TRIAGE',
      topic: expectedTopic,
    });
  });

  it('does not call Slack when BUG_TRIAGE_CHANNEL_ID is missing', async () => {
    delete process.env.BUG_TRIAGE_CHANNEL_ID;
    resetModuleCache([slackNotifierPath]);
    delete require.cache[require.resolve(slackNotifierPath)];
    ({ updateChannelTopic } = require(slackNotifierPath));

    await updateChannelTopic(['U1']);

    expect(conversationsInfoMock).not.toHaveBeenCalled();
    expect(conversationsSetTopicMock).not.toHaveBeenCalled();
  });

  it('treats topic as string on channel when Slack returns a string', async () => {
    const userIds = ['U1'];
    const expectedTopic = topicForUserIds(userIds);
    conversationsInfoMock.mockResolvedValue({
      ok: true,
      channel: { topic: expectedTopic },
    });

    await updateChannelTopic(userIds);

    expect(conversationsSetTopicMock).not.toHaveBeenCalled();
  });
});
