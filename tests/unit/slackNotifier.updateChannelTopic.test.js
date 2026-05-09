const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const { resetModuleCache, restoreAllMocks } = require('../helpers/mockIsolation');

restoreAllMocks();

const conversationsInfoMock = mock();
const conversationsSetTopicMock = mock();
const chatPostMessageMock = mock();

mock.module('@slack/web-api', () => ({
  WebClient: class WebClient {
    constructor() {
      this.conversations = {
        info: (...args) => conversationsInfoMock(...args),
        setTopic: (...args) => conversationsSetTopicMock(...args),
      };
      this.chat = {
        postMessage: (...args) => chatPostMessageMock(...args),
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
  const origAdminChannel = process.env.ADMIN_CHANNEL_ID;

  beforeEach(() => {
    mock.clearAllMocks();
    resetModuleCache([slackNotifierPath]);
    process.env.BUG_TRIAGE_CHANNEL_ID = 'C_BUG_TRIAGE';
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.ADMIN_CHANNEL_ID = 'C_ADMIN';
    ({ updateChannelTopic } = require(slackNotifierPath));
  });

  afterEach(() => {
    if (origChannel === undefined) delete process.env.BUG_TRIAGE_CHANNEL_ID;
    else process.env.BUG_TRIAGE_CHANNEL_ID = origChannel;
    if (origToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = origToken;
    if (origAdminChannel === undefined) delete process.env.ADMIN_CHANNEL_ID;
    else process.env.ADMIN_CHANNEL_ID = origAdminChannel;
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

  it('skips setTopic and notifies admins once when conversations.info has missing_scope', async () => {
    const missingScopeError = new Error('missing_scope');
    missingScopeError.data = { error: 'missing_scope' };
    conversationsInfoMock.mockRejectedValue(missingScopeError);
    conversationsSetTopicMock.mockResolvedValue({ ok: true });
    chatPostMessageMock.mockResolvedValue({ ok: true });

    await updateChannelTopic(['U1']);
    await updateChannelTopic(['U1']);

    expect(conversationsInfoMock).toHaveBeenCalledTimes(2);
    expect(conversationsSetTopicMock).not.toHaveBeenCalled();
    expect(chatPostMessageMock).toHaveBeenCalledTimes(1);
    expect(chatPostMessageMock.mock.calls[0][0]).toEqual({
      channel: 'C_ADMIN',
      text: expect.stringContaining('missing_scope'),
    });
  });

  it('skips repeated same-topic setTopic attempts inside the in-process TTL when conversations.info fails', async () => {
    const userIds = ['U_REPEAT'];
    const expectedTopic = topicForUserIds(userIds);
    conversationsInfoMock.mockRejectedValue(new Error('network'));
    conversationsSetTopicMock.mockResolvedValue({ ok: true });

    await updateChannelTopic(userIds);
    await updateChannelTopic(userIds);

    expect(conversationsInfoMock).toHaveBeenCalledTimes(2);
    expect(conversationsSetTopicMock).toHaveBeenCalledTimes(1);
    expect(conversationsSetTopicMock.mock.calls[0][0]).toEqual({
      channel: 'C_BUG_TRIAGE',
      topic: expectedTopic,
    });
  });

  it('retries admin notification on next call when chatPostMessage fails', async () => {
    const missingScopeError = new Error('missing_scope');
    missingScopeError.data = { error: 'missing_scope' };
    conversationsInfoMock.mockRejectedValue(missingScopeError);
    conversationsSetTopicMock.mockResolvedValue({ ok: true });
    chatPostMessageMock.mockRejectedValue(new Error('post_failed'));

    await updateChannelTopic(['U1']);
    await updateChannelTopic(['U1']);

    expect(conversationsInfoMock).toHaveBeenCalledTimes(2);
    expect(conversationsSetTopicMock).not.toHaveBeenCalled();
    expect(chatPostMessageMock).toHaveBeenCalledTimes(2);
  });

  it('retries admin notification on next call when ADMIN_CHANNEL_ID is unset', async () => {
    delete process.env.ADMIN_CHANNEL_ID;
    resetModuleCache([slackNotifierPath]);
    ({ updateChannelTopic } = require(slackNotifierPath));

    const missingScopeError = new Error('missing_scope');
    missingScopeError.data = { error: 'missing_scope' };
    conversationsInfoMock.mockRejectedValue(missingScopeError);
    conversationsSetTopicMock.mockResolvedValue({ ok: true });

    await updateChannelTopic(['U1']);
    await updateChannelTopic(['U1']);

    expect(conversationsInfoMock).toHaveBeenCalledTimes(2);
    expect(conversationsSetTopicMock).not.toHaveBeenCalled();
    expect(chatPostMessageMock).not.toHaveBeenCalled();
  });

  it('does not call Slack when BUG_TRIAGE_CHANNEL_ID is missing', async () => {
    delete process.env.BUG_TRIAGE_CHANNEL_ID;
    resetModuleCache([slackNotifierPath]);
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
