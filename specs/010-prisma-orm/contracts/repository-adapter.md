# Repository Adapter Contract

## Goal
Gradually replace raw `pg` access with Prisma Client in repository modules, without changing external module APIs.

## Pattern

- Import Prisma Client in repositories: `const prisma = require('../prismaClient');`
- Replace read/write queries with Prisma methods
- Preserve function signatures; convert inputs/outputs to match current shapes
- Centralize error mapping to consistent error types

## Example (conceptual)

- Before: `await query('SELECT * FROM users WHERE slack_id=$1', [id])`
- After: `await prisma.user.findUnique({ where: { slackId: id } })`

## Error Handling

- Catch PrismaKnownRequestError and log code/meta
- Return domain-friendly errors from repositories

## Testing

- Integration tests continue via existing test harness
- No external API changes required
