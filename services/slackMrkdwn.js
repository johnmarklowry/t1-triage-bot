/**
 * Slack mrkdwn guardrails
 *
 * This project standardizes on Slack mrkdwn in modal/message blocks.
 * Slack mrkdwn is *not* CommonMark/GitHub Markdown; e.g. `**bold**` will not render.
 *
 * These helpers are intentionally lightweight: they do not transform text, they only warn in dev.
 */
function warnIfNonSlackMarkdown(text, source = 'unknown') {
  const str = String(text ?? '');
  if (!str) return;

  // Slack mrkdwn does not support GitHub-style **bold**. Slack uses *bold*.
  const hasGithubBold = /\*\*[^*\n][\s\S]*?\*\*/.test(str);

  // Slack does not render Markdown headings; leading #'s are almost always accidental.
  const hasMarkdownHeading = /(^|\n)#{1,6}\s+\S/.test(str);

  if (!hasGithubBold && !hasMarkdownHeading) return;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) return;

  const issues = [
    ...(hasGithubBold ? ['contains **bold** (use *bold* for Slack mrkdwn)'] : []),
    ...(hasMarkdownHeading ? ['contains Markdown heading syntax (# ...)'] : []),
  ];

  // Avoid logging the full text; just enough to locate the source.
  // eslint-disable-next-line no-console
  console.warn(`[slackMrkdwn] Non-Slack markdown detected in ${source}: ${issues.join(', ')}`);
}

module.exports = {
  warnIfNonSlackMarkdown,
};

