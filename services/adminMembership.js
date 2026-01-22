const { AdminMembershipRepository } = require('../db/repository');

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function isFresh(checkedAt, ttlMs) {
  if (!checkedAt) return false;
  const ts = checkedAt instanceof Date ? checkedAt.getTime() : new Date(checkedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < ttlMs;
}

/**
 * Return cached membership, if present.
 */
async function getCachedAdminMembership(userId) {
  return await AdminMembershipRepository.get(userId);
}

/**
 * Slack API membership check, cached in DB.
 *
 * Plan default: use users.conversations() and check for the admin channel ID.
 * If Slack API fails (missing scopes / rate limits / etc.), fall back to cached value or false.
 */
async function isUserInAdminChannel({
  client,
  userId,
  adminChannelId,
  ttlMs = DEFAULT_TTL_MS,
  logger = console
}) {
  if (!userId || !adminChannelId) return { isMember: false, source: 'invalid_args' };

  const cached = await getCachedAdminMembership(userId);
  if (cached && isFresh(cached.checkedAt, ttlMs)) {
    return { isMember: cached.isMember === true, source: 'cache' };
  }

  try {
    // Paginate users.conversations for best-effort membership inference.
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      const resp = await client.users.conversations({
        user: userId,
        types: 'public_channel,private_channel',
        limit: 200,
        cursor
      });

      const channels = resp?.channels || [];
      if (channels.some((c) => c?.id === adminChannelId)) {
        await AdminMembershipRepository.upsert(userId, true, new Date());
        return { isMember: true, source: 'slack_api' };
      }

      cursor = resp?.response_metadata?.next_cursor;
      if (!cursor) break;
    }

    await AdminMembershipRepository.upsert(userId, false, new Date());
    return { isMember: false, source: 'slack_api' };
  } catch (error) {
    const code = error?.data?.error || error?.code || error?.message;
    logger?.warn?.('[adminMembership] Slack membership check failed; falling back to cache', {
      code,
      userId,
      adminChannelId
    });

    if (cached) {
      return { isMember: cached.isMember === true, source: 'cache_stale' };
    }
    return { isMember: false, source: 'error_default_false' };
  }
}

module.exports = {
  DEFAULT_TTL_MS,
  isFresh,
  getCachedAdminMembership,
  isUserInAdminChannel
};

