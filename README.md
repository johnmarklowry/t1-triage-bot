# Triage Rotation Bot

A Slack-based triage rotation system for managing on-call rotations across different disciplines with sprint-based scheduling, coverage overrides, and SLA assessment.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp env.example .env
# Edit .env with your configuration

# Set up database
npm run migrate
npm run migrate-data

# Start the application
npm start
```

## 📁 Project Structure

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for detailed project organization.

### Key Directories

- **`/docs`** - All project documentation
- **`/scripts`** - Utility scripts for testing and administration
- **`/tests`** - Test files
- **`/data`** - JSON data files (legacy/backup)
- **`/db`** - Database layer and migrations
- **`/openspec`** - OpenSpec documentation and change proposals

## 🛠️ Available Scripts

### Application
```bash
npm start              # Start the application
```

### Database
```bash
npm run migrate              # Run database migrations
npm run migrate-data         # Migrate JSON data to database
npm run db-status            # Check migration status
npm run db:fix-constraints   # Apply database constraint fixes
npm run db:test-fixes        # Test database fixes
npm run db:seed-staging      # Seed staging database
npm run db:clean-staging     # Clean staging database
```

## 🔧 Configuration

### Environment Variables

See `env.example` for required environment variables:

- `SLACK_BOT_TOKEN` - Slack bot token
- `SLACK_SIGNING_SECRET` - Slack signing secret
- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_CHANNEL_ID` - Admin channel ID
- `ENVIRONMENT` - Environment (staging/production)

### Database Setup

1. Create PostgreSQL database
2. Set `DATABASE_URL` environment variable
3. Run migrations: `npm run migrate`
4. Migrate existing data: `npm run migrate-data`

## 📚 Documentation

- [Project Structure](docs/PROJECT_STRUCTURE.md) - Project organization
- [Database Setup](docs/DATABASE_SETUP.md) - Database configuration
- [Environment Commands](docs/ENVIRONMENT_COMMANDS.md) - Environment-specific commands
- [Database Fixes](docs/DATABASE_FIXES_IMPLEMENTATION.md) - Database duplicate key fixes

## 🎯 Features

- **Sprint-based Rotations**: Automated rotation assignments based on sprint schedules
- **Discipline Management**: Support for multiple disciplines (Account, Producer, PO, UI Eng, BE Eng)
- **Coverage Overrides**: Request and approve coverage overrides
- **SLA Assessment**: Automated bug severity assessment
- **Environment-specific Commands**: Staging and production command separation
- **Database Persistence**: PostgreSQL with JSON fallback

## 🧪 Testing

```bash
# Run database tests
npm run db:test-fixes

# Run test routes
node scripts/testRoutes.js
```

## 📝 Development

### Adding New Features

1. Create OpenSpec proposal in `openspec/changes/`
2. Implement changes following the proposal
3. Update documentation
4. Test thoroughly
5. Submit PR

### Database Changes

1. Create migration file in `db/migrations/`
2. Update repository layer if needed
3. Test migration with `npm run migrate`
4. Update documentation

## 🔒 Security

- Never commit `.env` files
- Keep database credentials secure
- Use environment variables for sensitive data
- Review Slack app permissions regularly

## 📄 License

MIT

## 🤝 Contributing

1. Follow OpenSpec methodology for changes
2. Update documentation
3. Write tests for new features
4. Submit PR with clear description

## 📞 Support

For issues or questions, please refer to the project documentation or create an issue.
