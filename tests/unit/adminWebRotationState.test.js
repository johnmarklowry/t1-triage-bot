const { describe, it, expect } = require('bun:test');
const { buildParticipantListsFromUsers } = require('../../services/adminWebRotationState');

describe('adminWebRotationState helpers', () => {
  it('buildParticipantListsFromUsers groups active members by discipline', () => {
    const lists = buildParticipantListsFromUsers([
      { slackId: 'U2', name: 'Zed', discipline: 'po', active: true },
      { slackId: 'U1', name: 'Amy', discipline: 'po', active: true },
      { slackId: 'U3', name: 'Inactive', discipline: 'account', active: false },
    ]);

    expect(Object.keys(lists)).toEqual(['po', 'account']);
    expect(lists.po.map((u) => u.name)).toEqual(['Amy', 'Zed']);
    expect(lists.account[0].active).toBe(false);
  });
});
