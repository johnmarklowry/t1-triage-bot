# Data Model: Improve Slack Home Tab

## Overview

The home tab displays triage rotation information retrieved from the database (or JSON fallback). The data model represents the structure of information displayed on the home tab and how it's transformed into Block Kit blocks.

## Entities

### HomeTabView

Represents the complete home tab view structure that will be rendered using Slack Block Kit.

**Attributes**:
- `currentRotation`: CurrentOnCall | null - Current sprint rotation information
- `nextRotation`: NextOnCall | null - Next sprint rotation information  
- `disciplines`: Disciplines - Dictionary of discipline roles to user lists
- `metadata`: HomeTabMetadata - Additional metadata for the view

**Relationships**:
- Contains 0-1 CurrentOnCall
- Contains 0-1 NextOnCall
- Contains 1 Disciplines

**Validation**:
- Total blocks must not exceed 50 (Slack API limit)
- At least one section must be displayed (current rotation, next rotation, or disciplines)

### CurrentOnCall

Represents the current active sprint rotation.

**Attributes**:
- `sprintName`: string - Name of the current sprint (e.g., "FY26 Sp1")
- `startDate`: string - Start date in YYYY-MM-DD format
- `endDate`: string - End date in YYYY-MM-DD format
- `users`: Array<UserRole> - Array of users assigned to each role

**Relationships**:
- Contains multiple UserRole objects (one per role: account, producer, po, uiEng, beEng)

**Validation**:
- `startDate` and `endDate` must be valid YYYY-MM-DD format
- `users` array must contain 0-5 UserRole objects (one per role)
- Date validation handled by `parsePTDate()` in dataUtils.js

### NextOnCall

Represents the next upcoming sprint rotation. Same structure as CurrentOnCall.

**Attributes**:
- `sprintName`: string
- `startDate`: string (YYYY-MM-DD)
- `endDate`: string (YYYY-MM-DD)
- `users`: Array<UserRole>

**Validation**: Same as CurrentOnCall

### UserRole

Represents a user assigned to a specific role in a sprint rotation.

**Attributes**:
- `role`: string - Role identifier (one of: 'account', 'producer', 'po', 'uiEng', 'beEng')
- `name`: string - User's display name
- `slackId`: string - Slack user ID (format: U[alphanumeric])

**Relationships**:
- Belongs to CurrentOnCall or NextOnCall
- References a User in the Disciplines entity

**Validation**:
- `role` must be one of the predefined roles
- `slackId` must be a valid Slack user ID format
- `name` must be non-empty string

### Disciplines

Dictionary/object mapping role names to arrays of users.

**Structure**:
```typescript
{
  account: Array<User>,
  producer: Array<User>,
  po: Array<User>,
  uiEng: Array<User>,
  beEng: Array<User>
}
```

**Attributes**:
- `[role]`: Array<User> - Array of users in that discipline

**Relationships**:
- Contains multiple User objects across different roles
- Users may appear in multiple disciplines (after database schema fix)

**Validation**:
- Each role key must be one of: account, producer, po, uiEng, beEng
- User arrays may be empty
- No duplicate users within the same discipline (enforced by database)

### User

Represents a user in a discipline.

**Attributes**:
- `slackId`: string - Slack user ID
- `name`: string - User's display name

**Relationships**:
- Belongs to one or more Disciplines
- Referenced by UserRole objects

**Validation**:
- `slackId` must be valid Slack user ID
- `name` must be non-empty string

### HomeTabMetadata

Additional metadata for the home tab view.

**Attributes**:
- `lastUpdated`: Date - When the data was last refreshed
- `dataSource`: string - 'database' | 'json' - Source of the data
- `hasError`: boolean - Whether there was an error loading data

**Use Cases**:
- Display last updated timestamp in context block
- Show data source indicator (for debugging)
- Handle error states gracefully

### BlockKitBlock

Individual Block Kit block structure (follows Slack API specification).

**Types Used**:
- `header`: Section titles
- `section`: Primary content with text, fields, and optional accessory
- `context`: Metadata and secondary information
- `divider`: Visual separation
- `actions`: Button groups

**Structure**: Follows Slack Block Kit API specification
- Each block has a `type` field
- Blocks are arranged in an array (max 50 blocks)
- Order determines visual hierarchy

**Validation**:
- Must conform to Slack Block Kit schema
- Total blocks must not exceed 50
- Block IDs must be unique if used

## State Transitions

**None** - The home tab is a read-only display. Data is retrieved from the database/JSON and transformed into Block Kit blocks. No state changes occur within the home tab itself.

**Data Flow**:
1. User opens home tab → `app_home_opened` event fired
2. Event handler loads data asynchronously (current rotation, next rotation, disciplines)
3. Data transformed into Block Kit blocks via `buildHomeView()`
4. View published to Slack via `views.publish()`
5. Slack renders the home tab to user

## Data Access Patterns

### Current Implementation
- `getCurrentOnCall()`: Synchronous, reads from JSON/database
- `getNextOnCall()`: Synchronous, reads from JSON/database
- `readDisciplines()`: Synchronous, reads from JSON/database

### Required Changes
All data access functions are now async in `dataUtils.js`:
- `readCurrentState()`: async
- `readSprints()`: async
- `readDisciplines()`: async
- `getSprintUsers()`: async

**Migration Path**:
- Update `getCurrentOnCall()` and `getNextOnCall()` to be async
- Use `await` in `app_home_opened` event handler
- Handle Promise.all() for parallel data loading

## Error States

### Missing Data
- **Current rotation is null**: Display message "No active sprint found"
- **Next rotation is null**: Display message "No upcoming sprint scheduled"
- **Disciplines empty**: Display message "Discipline data unavailable"

### Data Loading Errors
- **Database unavailable**: Fallback to JSON (handled by dataUtils.js)
- **All data unavailable**: Display error message with refresh option
- **Partial data unavailable**: Display available data, show warning for missing sections

### Validation Errors
- **Invalid date format**: Log error, display fallback message
- **Invalid user ID**: Log warning, display user ID as-is
- **Missing required fields**: Use defaults or skip section

## Data Transformation

### Current Rotation → Blocks
1. Header block: "Current On-Call Rotation"
2. Section block with fields:
   - Sprint name (text)
   - Start date (field)
   - End date (field)
3. Context block: Date range
4. Section blocks (one per user role):
   - Role name + user mention
5. Divider block

### Next Rotation → Blocks
Same structure as Current Rotation, with "Next On-Call Rotation" header

### Disciplines → Blocks
1. Header block: "Discipline Rotation Lists"
2. Section blocks (one per discipline):
   - Discipline name
   - Fields: User list (formatted as mentions)
3. Optional: Move to modal if too many disciplines

## Performance Considerations

- **Data Loading**: Use Promise.all() to load data in parallel
- **Block Generation**: Cache block structures if data hasn't changed
- **Response Time**: Must complete within 3 seconds (Slack API requirement)
- **Block Count**: Current implementation uses ~10 blocks, well under 50 block limit

