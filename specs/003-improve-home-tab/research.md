# Research: Improve Slack Home Tab with Block Kit Best Practices

## Research Tasks & Findings

### 1. Slack Block Kit Best Practices for Home Tab

**Decision**: Use a combination of header blocks, section blocks with fields, context blocks, and divider blocks for better visual hierarchy and information organization.

**Rationale**: 
- **Header blocks** provide clear section titles and improve scannability
- **Section blocks with fields** allow displaying multiple pieces of related information side-by-side (up to 10 fields per section)
- **Context blocks** are ideal for metadata like dates and secondary information
- **Divider blocks** separate distinct sections clearly
- Current implementation uses only section blocks with long markdown text, making it harder to scan

**Alternatives Considered**:
- Single section blocks with markdown: Current approach, but lacks visual hierarchy
- Multiple section blocks without fields: More verbose and takes up more vertical space
- Rich text blocks: Not available in Block Kit (only mrkdwn and plain_text)

**Source**: Slack Block Kit documentation, Slack App Guidelines

### 2. Block Kit Layout Patterns for Information Display

**Decision**: Use section blocks with `fields` array for displaying sprint information, with context blocks for date metadata and accessory elements for quick actions.

**Rationale**:
- **Fields in section blocks** allow displaying label-value pairs in a compact format (2 columns on desktop)
- **Context blocks** are perfect for timestamp/date information that doesn't need prominence
- **Accessory elements** (buttons, selects) can be added to section blocks for quick actions without requiring separate action blocks
- This approach provides better information density while maintaining readability

**Alternatives Considered**:
- Long markdown text in single section: Current approach, hard to scan
- Multiple section blocks (one per field): Too verbose, wastes vertical space
- Table blocks: Not available in Block Kit

**Implementation Pattern**:
```javascript
{
  type: 'section',
  text: { type: 'mrkdwn', text: '*Sprint Name*' },
  fields: [
    { type: 'mrkdwn', text: '*Start:*\nDate' },
    { type: 'mrkdwn', text: '*End:*\nDate' }
  ],
  accessory: { type: 'button', text: { type: 'plain_text', text: 'View Details' }, action_id: '...' }
}
```

### 3. Interactive Elements Best Practices

**Decision**: Limit interactive elements to essential actions. Use primary buttons for main actions, overflow menus for secondary actions, and avoid overwhelming users with too many CTAs.

**Rationale**:
- Slack guidelines recommend limiting CTAs to avoid overwhelming users
- Primary button for "View All Upcoming Sprints" is appropriate and already implemented
- Consider adding overflow menu for secondary actions (settings, refresh, help)
- Avoid adding buttons to every section - focus on most important actions

**Alternatives Considered**:
- Button for each sprint: Too many buttons, clutters interface
- Dropdown selects for filtering: Adds complexity without clear value
- Date pickers: Not necessary for current use case

**Recommended Pattern**:
- One primary action button (already exists: "View All Upcoming Sprints")
- Optional overflow menu in header for settings/refresh/help
- Interactive elements only where they provide clear value

### 4. Slack Home Tab Design Patterns

**Decision**: Implement clear information hierarchy: Current rotation (most important) → Next rotation (important) → Discipline lists (reference information). Use visual separation and progressive disclosure.

**Rationale**:
- **Current rotation** is the most frequently needed information - should be at top
- **Next rotation** helps with planning - second priority
- **Discipline lists** are reference material - lower priority, can be collapsed or shown in modal
- Visual hierarchy achieved through header blocks, spacing, and formatting
- Progressive disclosure: Move discipline lists to a modal or collapsible section to reduce clutter

**Alternatives Considered**:
- Equal prominence for all sections: Doesn't guide user attention effectively
- Tab-based navigation: Too complex for home tab, better suited for modals
- Accordion/collapsible sections: Not natively supported in Block Kit (would require custom solution)

**Implementation Approach**:
1. Header: "Triage Rotation" or app name
2. Current Rotation section (header block + section blocks)
3. Next Rotation section (header block + section blocks)
4. Quick Actions (button to view upcoming sprints, optional overflow menu)
5. Discipline lists moved to modal or shown in compact format

### 5. Async Data Loading Patterns for Home Tab

**Decision**: Pre-load data asynchronously in the event handler, use try-catch for error handling, and provide fallback views when data is unavailable.

**Rationale**:
- `app_home_opened` event handler must respond within 3 seconds
- Current implementation uses synchronous data access which won't work with async database operations
- Need to use `await` for all data operations (`readCurrentState()`, `readSprints()`, `readDisciplines()`)
- Provide graceful fallback when data is unavailable (show message, allow refresh)

**Alternatives Considered**:
- Caching data in memory: Adds complexity, potential staleness issues
- Background refresh: Not supported by Slack API (home tab only updates on event)
- Lazy loading: Not applicable (entire view must be published at once)

**Implementation Pattern**:
```javascript
slackApp.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    const [current, next, disciplines] = await Promise.all([
      getCurrentOnCall(),
      getNextOnCall(),
      readDisciplines()
    ]);
    const homeView = buildHomeView(current, next, disciplines);
    await client.views.publish({ user_id: event.user, view: homeView });
  } catch (error) {
    logger.error('Error loading home tab:', error);
    // Publish fallback view with error message
  }
});
```

### 6. Block Kit Rich Formatting Options

**Decision**: Use mrkdwn formatting strategically: bold for labels, code formatting for dates, emoji for visual indicators, and mentions for user references.

**Rationale**:
- Bold text (`*text*`) draws attention to important information
- Code formatting (`` `text` ``) makes dates/times stand out
- Emoji can provide visual context (🔄 for rotation, 📅 for dates, 👥 for teams)
- User mentions (`<@user_id>`) provide clickable user links and notifications
- Current implementation uses some formatting but could be more strategic

**Best Practices**:
- Don't overuse formatting - use sparingly for emphasis
- Maintain consistency in formatting patterns
- Ensure accessibility (don't rely solely on visual formatting)

## Key Design Decisions Summary

1. **Visual Hierarchy**: Use header blocks for sections, context blocks for metadata
2. **Information Density**: Use section blocks with fields for compact, scannable displays
3. **Interactive Elements**: Limit to essential actions, use overflow menu for secondary actions
4. **Content Organization**: Current → Next → Reference, with progressive disclosure
5. **Data Loading**: Async/await pattern with error handling and fallbacks
6. **Formatting**: Strategic use of mrkdwn formatting for emphasis and readability

## Block Kit Blocks to Use

- **Header blocks**: Section titles
- **Section blocks**: Primary content with fields array for label-value pairs
- **Context blocks**: Dates, metadata, secondary information
- **Divider blocks**: Visual separation between sections
- **Actions blocks**: Button groups (primary actions)
- **Input blocks**: Not needed for home tab (read-only display)

## Performance Considerations

- Maximum 50 blocks per view (current implementation uses ~10 blocks, well within limit)
- Response time must be <3 seconds (async data loading should complete quickly)
- Cache user data if possible (but refresh on each home tab open for accuracy)
- Optimize database queries (use repository layer which already handles this)

## Accessibility Considerations

- Use descriptive text in blocks (not just emoji)
- Ensure sufficient contrast (Slack handles this)
- Provide alternative text for visual elements
- Test with screen readers (Slack's Block Kit is accessible by default)

## Next Steps

1. Implement async data loading in `app_home_opened` handler
2. Refactor `buildHomeView()` to use Block Kit best practices
3. Create helper functions for building individual block types
4. Add error handling and fallback views
5. Test with various data states (empty, missing, large datasets)

