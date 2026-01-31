const { describe, it, expect, mock, beforeEach, afterEach } = require('bun:test');

const origEnv = process.env.NODE_ENV;
const origWarn = console.warn;

describe('slackMrkdwn', () => {
  let warnCalls;

  beforeEach(() => {
    warnCalls = [];
    console.warn = (...args) => { warnCalls.push(args); };
  });

  afterEach(() => {
    console.warn = origWarn;
    process.env.NODE_ENV = origEnv;
  });

  const slackMrkdwn = require('../../services/slackMrkdwn');

  describe('warnIfNonSlackMarkdown', () => {
    it('does not throw', () => {
      expect(() => slackMrkdwn.warnIfNonSlackMarkdown('hello')).not.toThrow();
      expect(() => slackMrkdwn.warnIfNonSlackMarkdown('**bold**')).not.toThrow();
      expect(() => slackMrkdwn.warnIfNonSlackMarkdown('# heading')).not.toThrow();
    });

    it('does nothing for empty or plain text', () => {
      process.env.NODE_ENV = 'development';
      slackMrkdwn.warnIfNonSlackMarkdown('');
      slackMrkdwn.warnIfNonSlackMarkdown('plain text');
      expect(warnCalls.length).toBe(0);
    });

    it('warns in non-production when text has **bold**', () => {
      process.env.NODE_ENV = 'development';
      slackMrkdwn.warnIfNonSlackMarkdown('Hello **world**', 'test');
      expect(warnCalls.length).toBe(1);
      expect(warnCalls[0][0]).toContain('slackMrkdwn');
      expect(warnCalls[0][0]).toContain('**bold**');
    });

    it('warns in non-production when text has Markdown heading', () => {
      process.env.NODE_ENV = 'development';
      slackMrkdwn.warnIfNonSlackMarkdown('# Title', 'test');
      expect(warnCalls.length).toBe(1);
      expect(warnCalls[0][0]).toContain('heading');
    });

    it('does not warn in production', () => {
      process.env.NODE_ENV = 'production';
      slackMrkdwn.warnIfNonSlackMarkdown('**bold**', 'test');
      expect(warnCalls.length).toBe(0);
    });
  });
});
