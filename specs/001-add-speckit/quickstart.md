# Quickstart Guide: Speckit Planning Workflow

## Prerequisites

- Git repository with feature branch support
- Bash shell (Linux/macOS)
- Node.js 18+ (for any Node.js-based processing)
- Feature branch with numeric prefix (e.g., `001-feature-name`)

## Setup

1. **Create or checkout feature branch**:
   ```bash
   git checkout -b 001-my-feature
   ```

2. **Create feature specification**:
   ```bash
   mkdir -p specs/001-my-feature
   # Create specs/001-my-feature/spec.md with your feature specification
   ```

3. **Ensure constitution exists**:
   ```bash
   # Constitution should be at .specify/memory/constitution.md
   # If missing, create it following the constitution template
   ```

## Usage

### Execute Planning Workflow

Run the `/speckit.plan` command (via Cursor/Claude AI assistant):

```
/speckit.plan
```

Or manually execute the workflow:

1. **Run setup script**:
   ```bash
   .specify/scripts/bash/setup-plan.sh --json
   ```

2. **Review generated plan.md**:
   - Check Technical Context section
   - Verify Constitution Check compliance
   - Review Project Structure

3. **Phase 0 - Research** (automated):
   - System generates `research.md`
   - Resolves all "NEEDS CLARIFICATION" items
   - Documents technology decisions

4. **Phase 1 - Design** (automated):
   - System generates `data-model.md`
   - System generates `contracts/` (if applicable)
   - System generates `quickstart.md`
   - Agent context updated (if applicable)

## Workflow Steps

### Step 1: Create Feature Specification

Create `specs/[###-feature-name]/spec.md` following the spec template:

```markdown
# Feature Specification: [Feature Name]

## User Scenarios & Testing
### User Story 1 - [Title] (Priority: P1)
...

## Requirements
### Functional Requirements
- FR-001: System MUST...
...

## Success Criteria
### Measurable Outcomes
- SC-001: ...
```

### Step 2: Execute Planning

Run `/speckit.plan` command. The system will:

1. Load feature specification
2. Load constitution
3. Generate plan.md with technical context
4. Execute Phase 0 research
5. Execute Phase 1 design
6. Update agent context

### Step 3: Review Generated Artifacts

- **plan.md**: Review technical context and constitution compliance
- **research.md**: Verify all technical decisions are documented
- **data-model.md**: Review entity definitions and relationships
- **contracts/**: Review API specifications (if applicable)
- **quickstart.md**: Verify usage instructions are accurate

### Step 4: Generate Tasks (Phase 2)

After planning is complete, use `/speckit.tasks` to generate implementation tasks:

```
/speckit.tasks
```

This generates `tasks.md` with implementation checklist.

## Common Workflows

### Planning a New Feature

```bash
# 1. Create feature branch
git checkout -b 001-new-feature

# 2. Create spec
mkdir -p specs/001-new-feature
# Edit specs/001-new-feature/spec.md

# 3. Execute planning
# Use /speckit.plan command in AI assistant

# 4. Review generated artifacts
# Check plan.md, research.md, data-model.md, etc.

# 5. Generate tasks
# Use /speckit.tasks command in AI assistant
```

### Updating an Existing Plan

```bash
# 1. Checkout feature branch
git checkout 001-existing-feature

# 2. Update spec.md if needed
# Edit specs/001-existing-feature/spec.md

# 3. Re-run planning
# Use /speckit.plan command

# 4. Review changes
# Compare generated artifacts with previous versions
```

## Troubleshooting

### Error: "Not on a feature branch"

**Solution**: Ensure branch name follows pattern `[0-9]{3}-[feature-name]`

```bash
# Rename branch if needed
git branch -m old-name 001-feature-name
```

### Error: "Feature specification not found"

**Solution**: Create `specs/[###-feature-name]/spec.md` file

```bash
mkdir -p specs/001-feature-name
# Create spec.md following template
```

### Warning: "Constitution compliance issues detected"

**Solution**: Review Constitution Check section in plan.md and address violations

1. Review each principle check
2. Update plan to address violations
3. Document justifications in Complexity Tracking if needed

### Missing Generated Artifacts

**Solution**: Re-run planning workflow

```bash
# Ensure you're on correct branch
git checkout 001-feature-name

# Re-run /speckit.plan command
```

## Next Steps

After completing the planning workflow:

1. **Review Plan**: Ensure all sections are complete and accurate
2. **Generate Tasks**: Use `/speckit.tasks` to create implementation checklist
3. **Begin Implementation**: Follow tasks.md sequentially
4. **Update Status**: Mark tasks complete as you progress

## Integration with OpenSpec

The speckit planning workflow complements OpenSpec:

- **Speckit**: Structured planning and design (specs/ directory)
- **OpenSpec**: Change proposals and implementation tracking (openspec/ directory)

Both workflows can be used together:
1. Use speckit for initial feature planning
2. Use OpenSpec for change proposals during implementation
3. Reference speckit plans in OpenSpec proposals

