# API Contract: Slack Home Tab

## Overview

This contract defines the interface between the Triage Rotation Bot and Slack's App Home API for rendering the home tab.

## Endpoints

### Publish Home Tab View

**Endpoint**: `views.publish` (Slack Web API)  
**Method**: POST  
**Authentication**: Bot Token (OAuth)  
**Rate Limit**: Tier 3 (50+ requests per minute per workspace)

#### Request

```typescript
{
  user_id: string;  // Slack user ID of the user viewing the home tab
  view: {
    type: 'home';
    callback_id?: string;  // Optional: 'triage_app_home'
    blocks: BlockKitBlock[];  // Array of Block Kit blocks (max 50)
    private_metadata?: string;  // Optional: JSON string for state
  }
}
```

#### Response

```typescript
{
  ok: boolean;
  view?: {
    id: string;
    type: 'home';
    blocks: BlockKitBlock[];
    private_metadata?: string;
    callback_id?: string;
    // ... other Slack view properties
  };
  error?: string;  // Error code if ok === false
  warning?: string;  // Warning message
}
```

#### Error Codes

- `invalid_auth`: Bot token is invalid or expired
- `not_authed`: No authentication provided
- `account_inactive`: Bot account is inactive
- `token_revoked`: Bot token has been revoked
- `no_permission`: Bot doesn't have required scopes
- `missing_scope`: Missing `app_manage` scope
- `invalid_arguments`: Invalid request parameters
- `invalid_arg_name`: Invalid parameter name
- `invalid_array_arg`: Invalid array argument
- `invalid_charset`: Invalid charset
- `invalid_form_data`: Invalid form data
- `invalid_post_type`: Invalid POST type
- `missing_post_type`: Missing POST type
- `team_added_to_org`: Team added to organization
- `invalid_json`: Invalid JSON in request
- `json_not_object`: JSON is not an object
- `request_timeout`: Request timeout
- `fatal_error`: Fatal error

#### Success Criteria

- `ok === true`
- `view.id` is present
- View is published and visible to user in Slack

## Event: app_home_opened

**Event Type**: `app_home_opened`  
**Event Subtype**: None  
**Event Source**: Slack Events API

### Event Payload

```typescript
{
  type: 'app_home_opened';
  user: string;  // Slack user ID
  channel: string;  // Always empty for app_home_opened
  event_ts: string;  // Event timestamp
  tab: 'home' | 'messages';  // Tab that was opened
}
```

### Handler Contract

**Function Signature**:
```typescript
async ({ event, client, logger }) => Promise<void>
```

**Parameters**:
- `event`: AppHomeOpenedEvent - The event payload
- `client`: WebClient - Slack Web API client
- `logger`: Logger - Logger instance

**Response Time**: Must complete within 3 seconds

**Behavior**:
1. Load data asynchronously (current rotation, next rotation, disciplines)
2. Transform data into Block Kit blocks
3. Publish view using `client.views.publish()`
4. Handle errors gracefully with logging and fallback views

**Error Handling**:
- Log all errors with context
- Publish fallback view if data loading fails
- Don't throw unhandled errors (Slack will retry)

## Block Kit Blocks

### Header Block

```typescript
{
  type: 'header';
  text: {
    type: 'plain_text';
    text: string;  // Section title
    emoji?: boolean;
  };
  block_id?: string;
}
```

### Section Block

```typescript
{
  type: 'section';
  text?: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
    verbatim?: boolean;  // For mrkdwn
  };
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
    verbatim?: boolean;
  }>;  // Max 10 fields
  accessory?: ButtonElement | SelectElement | OverflowElement | DatePickerElement;
  block_id?: string;
}
```

### Context Block

```typescript
{
  type: 'context';
  elements: Array<{
    type: 'mrkdwn' | 'plain_text' | 'image';
    text?: string;
    image_url?: string;
    alt_text?: string;
  }>;  // Max 10 elements
  block_id?: string;
}
```

### Divider Block

```typescript
{
  type: 'divider';
  block_id?: string;
}
```

### Actions Block

```typescript
{
  type: 'actions';
  elements: Array<ButtonElement | SelectElement | OverflowElement | DatePickerElement>;
  block_id?: string;
}
```

## Button Element

```typescript
{
  type: 'button';
  text: {
    type: 'plain_text';
    text: string;
    emoji?: boolean;
  };
  action_id: string;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
  confirm?: ConfirmationDialog;
}
```

## Overflow Element

```typescript
{
  type: 'overflow';
  action_id: string;
  options: Array<{
    text: {
      type: 'plain_text';
      text: string;
    };
    value: string;
    description?: {
      type: 'plain_text';
      text: string;
    };
    url?: string;
  }>;  // Max 5 options
  confirm?: ConfirmationDialog;
}
```

## Rate Limits

**Tier**: Tier 3  
**Limit**: 50+ requests per minute per workspace  
**Burst**: Allowed

**Handling**:
- Use exponential backoff for retries
- Implement rate limit detection from response headers
- Queue requests if necessary (unlikely for home tab)

## Security

### Authentication

- Use Bot Token from environment variable `SLACK_BOT_TOKEN`
- Token must have `app_manage` scope
- Token is passed in Authorization header by @slack/bolt library

### Authorization

- Only the bot can publish home tab views
- Views are user-specific (each user sees their own home tab)
- No user input validation needed (read-only display)

### Data Privacy

- No sensitive data exposed in blocks
- User IDs are Slack IDs (already known to Slack)
- No PII beyond what's already in Slack workspace

## Testing

### Manual Testing

1. Open Slack app in workspace
2. Navigate to "Home" tab
3. Verify view renders correctly
4. Verify all blocks display properly
5. Test interactive elements (buttons, modals)

### Automated Testing

- Test route: `/test/home-tab` (to be implemented)
- Mock Slack API responses
- Test error scenarios (missing data, API errors)
- Verify block structure validity

## Versioning

**Current Version**: 1.0.0  
**API Version**: Slack Web API v1 (current)  
**Block Kit Version**: Latest (supported by @slack/bolt)

## References

- [Slack App Home API](https://api.slack.com/methods/views.publish)
- [Slack Block Kit](https://api.slack.com/block-kit)
- [Slack Events API - app_home_opened](https://api.slack.com/events/app_home_opened)

