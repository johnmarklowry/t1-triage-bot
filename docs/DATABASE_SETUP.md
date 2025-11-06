# PostgreSQL Database Integration

This document describes the PostgreSQL database integration for the triage rotation bot, including setup instructions, schema documentation, and migration procedures.

## Overview

The triage bot has been enhanced with PostgreSQL database support to provide:
- ACID transactions for data consistency
- Comprehensive audit trails
- Historical data tracking
- Better concurrency handling
- Enhanced query capabilities

The system maintains backward compatibility with JSON files during the transition period.

## Database Schema

### Tables

#### `users`
Stores user information and discipline assignments.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  slack_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  discipline VARCHAR(20) NOT NULL CHECK (discipline IN ('account', 'producer', 'po', 'uiEng', 'beEng')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `sprints`
Stores sprint schedule information.

```sql
CREATE TABLE sprints (
  id SERIAL PRIMARY KEY,
  sprint_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sprint_index INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `current_state`
Tracks the current active sprint and role assignments.

```sql
CREATE TABLE current_state (
  id SERIAL PRIMARY KEY,
  sprint_index INTEGER REFERENCES sprints(sprint_index),
  account_slack_id VARCHAR(50),
  producer_slack_id VARCHAR(50),
  po_slack_id VARCHAR(50),
  ui_eng_slack_id VARCHAR(50),
  be_eng_slack_id VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_current_state CHECK (id = 1)
);
```

#### `overrides`
Stores coverage override requests and approvals.

```sql
CREATE TABLE overrides (
  id SERIAL PRIMARY KEY,
  sprint_index INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('account', 'producer', 'po', 'uiEng', 'beEng')),
  original_slack_id VARCHAR(50),
  replacement_slack_id VARCHAR(50) NOT NULL,
  replacement_name VARCHAR(100),
  requested_by VARCHAR(50) NOT NULL,
  approved BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(50),
  approval_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `audit_logs`
Tracks all changes for compliance and debugging.

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id INTEGER,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(50),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT
);
```

### Indexes

The schema includes optimized indexes for common queries:
- `idx_users_discipline` - Fast discipline-based user lookups
- `idx_users_slack_id` - Fast user lookups by Slack ID
- `idx_sprints_dates` - Date range queries for sprints
- `idx_overrides_sprint_role` - Override lookups by sprint and role
- `idx_audit_logs_table_record` - Audit log queries by table and record

## Setup Instructions

### 1. Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

### 2. Create Database

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database and user
CREATE DATABASE triage_bot;
CREATE USER triage_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE triage_bot TO triage_user;

# Exit psql
\q
```

### 3. Configure Environment

**For Railway Deployment:**
Railway automatically provides the `DATABASE_URL` environment variable. No additional database configuration is needed.

**For Local Development:**
Copy `env.example` to `.env` and update the database configuration:

```bash
cp env.example .env
```

Update the database section in `.env`:
```env
# For local development (comment out DATABASE_URL)
# DATABASE_URL=postgresql://username:password@hostname:port/database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=triage_bot
DB_USER=triage_user
DB_PASSWORD=your_password
DB_MAX_CONNECTIONS=20
DB_MIN_CONNECTIONS=2
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Migrations

**Railway Deployment:**
Migrations run automatically during application startup. The server will attempt database setup and fall back to JSON files if the database is not available.

**Local Development:**
The application will automatically run migrations on startup, or you can run them manually:

```bash
# Run migrations manually
npm run migrate

# Or run the full setup script
node setup-database.js
```

### 6. Migrate Existing Data

**Railway Deployment:**
JSON data migration happens automatically during application startup if JSON files are present in the repository and the database is available.

**Local Development:**
If you have existing JSON data, migrate it to the database:

```bash
# Run the JSON data migration
npm run migrate-data

# Or run the full setup script (includes data migration)
node setup-database.js
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_DATABASE` | `true` | Enable database operations |
| `DUAL_WRITE_MODE` | `true` | Write to both database and JSON files |
| `DATABASE_URL` | - | **Railway**: Complete database connection string (postgresql://user:pass@host:port/db) |
| `DB_HOST` | `localhost` | Database host (fallback if DATABASE_URL not set) |
| `DB_PORT` | `5432` | Database port (fallback if DATABASE_URL not set) |
| `DB_NAME` | `triage_bot` | Database name (fallback if DATABASE_URL not set) |
| `DB_USER` | `postgres` | Database user (fallback if DATABASE_URL not set) |
| `DB_PASSWORD` | `` | Database password (fallback if DATABASE_URL not set) |
| `DB_MAX_CONNECTIONS` | `20` | Maximum connection pool size |
| `DB_MIN_CONNECTIONS` | `2` | Minimum connection pool size |
| `DB_IDLE_TIMEOUT` | `30000` | Idle connection timeout (ms) |
| `DB_CONNECTION_TIMEOUT` | `2000` | Connection timeout (ms) |

**Railway Configuration:**
- Railway automatically provides `DATABASE_URL` environment variable
- The application will use `DATABASE_URL` if available, falling back to individual variables for local development
- No additional configuration needed when deploying to Railway

### Migration Modes

1. **Database Only** (`USE_DATABASE=true`, `DUAL_WRITE_MODE=false`)
   - All operations use PostgreSQL
   - JSON files are ignored
   - Recommended for production

2. **Dual Write** (`USE_DATABASE=true`, `DUAL_WRITE_MODE=true`)
   - Operations write to both database and JSON
   - Used during migration validation
   - Provides safety net during transition

3. **JSON Fallback** (`USE_DATABASE=false`)
   - Falls back to original JSON file behavior
   - Used if database is unavailable
   - Maintains backward compatibility

## Migration Procedures

### Initial Setup

1. **Backup existing data:**
   ```bash
   cp currentState.json currentState.json.backup
   cp sprints.json sprints.json.backup
   cp disciplines.json disciplines.json.backup
   cp overrides.json overrides.json.backup
   ```

2. **Set up database and run migrations:**
   ```bash
   # Database setup (see Setup Instructions above)
   # Run migrations
   node -e "require('./db/migrate').runMigrations().then(() => process.exit(0))"
   ```

3. **Migrate JSON data:**
   ```bash
   node db/migrate-json-data.js
   ```

4. **Validate migration:**
   ```bash
   # Check that data was migrated correctly
   node -e "require('./db/migrate-json-data').validateMigration().then(() => process.exit(0))"
   ```

### Production Deployment

1. **Deploy with dual-write mode:**
   ```env
   USE_DATABASE=true
   DUAL_WRITE_MODE=true
   ```

2. **Monitor logs for consistency:**
   - Check that database operations succeed
   - Verify JSON files match database state
   - Monitor audit logs for data changes

3. **Switch to database-only mode:**
   ```env
   USE_DATABASE=true
   DUAL_WRITE_MODE=false
   ```

4. **Keep JSON backups for rollback:**
   - Don't delete JSON files immediately
   - Archive them after successful validation period

### Rollback Procedure

If issues arise, you can rollback to JSON files:

1. **Stop the application**

2. **Restore JSON files:**
   ```bash
   cp currentState.json.backup currentState.json
   cp sprints.json.backup sprints.json
   cp disciplines.json.backup disciplines.json
   cp overrides.json.backup overrides.json
   ```

3. **Disable database:**
   ```env
   USE_DATABASE=false
   ```

4. **Restart application**

## Monitoring and Maintenance

### Health Checks

The application provides health check endpoints:

- `GET /` - Returns application and database health status
- Database health includes connection counts and status

### Audit Logs

All data changes are logged in the `audit_logs` table:

```sql
-- View recent audit logs
SELECT * FROM audit_logs 
ORDER BY changed_at DESC 
LIMIT 100;

-- View audit logs for specific table
SELECT * FROM audit_logs 
WHERE table_name = 'current_state' 
ORDER BY changed_at DESC;
```

### Performance Monitoring

Monitor database performance:

```sql
-- Check active connections
SELECT count(*) as active_connections 
FROM pg_stat_activity 
WHERE state = 'active';

-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

### Backup Procedures

**Database Backup:**
```bash
# Create database backup
pg_dump -h localhost -U triage_user triage_bot > triage_bot_backup.sql

# Restore from backup
psql -h localhost -U triage_user triage_bot < triage_bot_backup.sql
```

**Automated Backups:**
Set up cron job for regular backups:
```bash
# Add to crontab (daily at 2 AM)
0 2 * * * pg_dump -h localhost -U triage_user triage_bot > /backups/triage_bot_$(date +\%Y\%m\%d).sql
```

## Troubleshooting

### Common Issues

**Connection Errors:**
- Verify database credentials in `.env`
- Check PostgreSQL service is running
- Ensure database exists and user has permissions

**Migration Failures:**
- Check database logs for detailed error messages
- Verify migration files are valid SQL
- Ensure database user has CREATE/ALTER permissions

**Data Inconsistency:**
- Check audit logs for failed operations
- Compare database state with JSON files
- Use dual-write mode for validation

**Performance Issues:**
- Monitor connection pool usage
- Check for slow queries in `pg_stat_statements`
- Consider adding indexes for frequently queried columns

### Debug Mode

Enable detailed logging:

```env
NODE_ENV=development
DEBUG=db:*
```

This will show detailed database operation logs.

## API Changes

The database integration maintains full backward compatibility with existing APIs. All functions in `dataUtils.js` work exactly as before, but now use PostgreSQL internally.

### New Functions

- `db/connection.js` - Database connection management
- `db/repository.js` - Data access layer
- `db/migrate.js` - Migration system
- `db/migrate-json-data.js` - JSON data migration

### Modified Functions

All functions in `dataUtils.js` now support both database and JSON operations with automatic fallback.

## Security Considerations

- Use strong database passwords
- Limit database user permissions to minimum required
- Enable SSL connections for production
- Regularly update PostgreSQL and dependencies
- Monitor audit logs for suspicious activity
- Use connection pooling to prevent connection exhaustion

## Future Enhancements

Potential improvements for future versions:

1. **Read Replicas** - Add read-only replicas for better performance
2. **Connection Encryption** - Enable SSL/TLS for database connections
3. **Advanced Monitoring** - Add Prometheus metrics and Grafana dashboards
4. **Automated Backups** - Implement automated backup and restore procedures
5. **Data Archiving** - Archive old audit logs and sprint data
6. **Performance Optimization** - Add query optimization and caching layers
