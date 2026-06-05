const { describe, it, expect } = require('bun:test');
const { findUserRole, getUserOnCallStatus } = require('../../services/userRotationView');

describe('userRotationView', () => {
  it('findUserRole returns active discipline', () => {
    const role = findUserRole('U1', {
      po: [{ slackId: 'U1', name: 'Pat', active: true }],
      account: [{ slackId: 'U2', name: 'Sam', active: true }],
    });
    expect(role).toBe('po');
  });

  it('getUserOnCallStatus marks current rotation member', () => {
    const status = getUserOnCallStatus('U1', {
      sprintName: 'Sprint A',
      sprintIndex: 2,
      startDate: '2026-01-01',
      endDate: '2026-01-14',
      users: [{ role: 'po', name: 'Pat', slackId: 'U1' }],
    });
    expect(status?.isOnCall).toBe(true);
    expect(status?.role).toBe('po');
  });
});
