const { describe, it, expect, mock } = require('bun:test');

// Provide controlled sprints/disciplines so overrideModal's getAllSprints/getDisciplines return test data
const MINIMAL_SPRINTS = [
  { sprintIndex: 0, startDate: '2026-01-01', endDate: '2026-01-14', sprintName: 'S1' },
];
const fs = require('fs');
const realReadFileSync = fs.readFileSync.bind(fs);
mock.module('fs', () => ({
  ...fs,
  readFileSync(p, enc) {
    const pathStr = String(p);
    if (pathStr.includes('sprints.json')) {
      return JSON.stringify(MINIMAL_SPRINTS);
    }
    if (pathStr.includes('disciplines.json')) {
      return '{}';
    }
    return realReadFileSync(p, enc);
  },
}));

const {
  buildOverrideStep1Modal,
  buildOverrideRequestModal,
  buildOverrideRequestModalForSprint,
} = require('../../overrideModal');

describe('overrideModal override/coverage', () => {
  describe('buildOverrideStep1Modal with context', () => {
    it('includes role from context in private_metadata', () => {
      const modal = buildOverrideStep1Modal('U_ANY', {
        role: 'uiEng',
        disciplines: { uiEng: [{ slackId: 'U_ANY', name: 'Alice' }] },
      });
      const meta = JSON.parse(modal.private_metadata || '{}');
      expect(meta.role).toBe('uiEng');
    });
  });

  describe('buildOverrideRequestModal with context', () => {
    it('uses context.role for private_metadata', () => {
      const modal = buildOverrideRequestModal('U_ANY', {
        role: 'po',
        disciplines: { po: [{ slackId: 'U_ANY', name: 'Bob' }] },
      });
      const meta = JSON.parse(modal.private_metadata || '{}');
      expect(meta.role).toBe('po');
    });
  });

  describe('buildUserSprintOptions via Step1 modal with context', () => {
    it('includes sprint option when context has one role member and one sprint', () => {
      const context = {
        role: 'po',
        disciplines: { po: [{ slackId: 'U1', name: 'Alice' }] },
      };
      const modal = buildOverrideStep1Modal('U1', context);
      const sprintBlock = modal.blocks?.find(
        (b) => b.element?.action_id === 'sprint_select'
      );
      expect(sprintBlock).toBeDefined();
      const options = sprintBlock?.element?.options || [];
      expect(options.length).toBeGreaterThanOrEqual(1);
      const sprintOption = options.find((o) => o.value === '0');
      expect(sprintOption).toBeDefined();
    });

    it('shows fallback when context has empty role list', () => {
      const context = { role: 'po', disciplines: { po: [] } };
      const modal = buildOverrideStep1Modal('U_ANY', context);
      const sprintBlock = modal.blocks?.find(
        (b) => b.element?.action_id === 'sprint_select'
      );
      const options = sprintBlock?.element?.options || [];
      expect(options.some((o) => o.value === 'none' || o.text?.plain_text?.includes('No scheduled'))).toBe(true);
    });
  });
});
