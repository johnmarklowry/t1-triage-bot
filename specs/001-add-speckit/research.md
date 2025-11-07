# Phase 0: Research & Technology Decisions

## Research Tasks

### 1. Planning Workflow Integration

**Decision**: Use bash scripts for workflow orchestration with Node.js for any complex processing.

**Rationale**: 
- Bash scripts provide native file system operations and command execution
- Existing project already uses bash for setup scripts
- Simple template processing can be done with bash/sed, complex logic can use Node.js
- No new runtime dependencies required

**Alternatives considered**:
- Pure Node.js workflow: More complex for simple file operations, requires additional dependencies
- Python workflow: Not aligned with existing project stack (Node.js-based)
- Makefile-based: Less flexible for dynamic template processing

### 2. Template Processing Approach

**Decision**: Use template files with placeholder tokens that are replaced during plan generation.

**Rationale**:
- Templates already exist in `.specify/templates/` directory
- Placeholder replacement is straightforward with bash/sed or Node.js
- Maintains separation between templates and generated content
- Easy to update templates without affecting existing plans

**Alternatives considered**:
- Code generation from AST: Overly complex for Markdown templates
- External templating engine (Handlebars, Mustache): Adds dependency, templates are simple enough for basic replacement

### 3. Constitution Compliance Checking

**Decision**: Implement compliance checks as structured questions in the plan template, validated during plan generation.

**Rationale**:
- Constitution is already defined in `.specify/memory/constitution.md`
- Compliance can be checked by reviewing plan content against constitution principles
- Manual review process ensures thorough validation
- Automated checks can be added later if needed

**Alternatives considered**:
- Automated linting rules: Would require additional tooling and maintenance
- Pre-commit hooks: Too early in workflow, compliance should be checked during planning

### 4. Agent Context Updates

**Decision**: Use bash script to detect agent type and update appropriate context file (e.g., `CLAUDE.md`, `AGENTS.md`).

**Rationale**:
- Scripts already exist in `.specify/scripts/bash/update-agent-context.sh`
- Agent detection can be done via environment variables or file presence
- Context files follow a standard format with manual addition markers
- Preserves manual additions while updating technology lists

**Alternatives considered**:
- Single unified context file: Different agents may need different formats
- Manual updates only: Too error-prone, easy to forget

### 5. Feature Branch Naming Convention

**Decision**: Enforce numeric prefix format (`001-feature-name`) for feature branches.

**Rationale**:
- Provides clear ordering and organization
- Makes it easy to find corresponding spec directories
- Supports multiple branches per feature (e.g., `001-fix-bug`, `001-add-feature`)
- Scripts can extract prefix to find spec directory

**Alternatives considered**:
- Semantic naming only: Harder to match branches to specs programmatically
- UUID-based: Not human-readable, difficult to remember

### 6. File Generation Strategy

**Decision**: Generate all Phase 0 and Phase 1 artifacts in a single workflow execution.

**Rationale**:
- Research informs design, so Phase 0 must complete before Phase 1
- All artifacts are needed for a complete plan
- Single execution reduces complexity and ensures consistency
- Can be broken into separate commands if needed later

**Alternatives considered**:
- Separate commands per phase: More complex user experience, harder to maintain state
- Incremental generation: Risk of inconsistent state between phases

## Technology Stack Confirmation

- **Bash**: For script orchestration and file operations (already available)
- **Node.js**: For any complex processing if needed (already in project)
- **Markdown**: For all documentation artifacts (standard format)
- **Git**: For branch detection and feature directory resolution (already in use)

## Integration Points

- **OpenSpec Workflow**: Speckit complements OpenSpec by providing structured planning before implementation
- **Constitution**: All plans must comply with constitution principles
- **Existing Scripts**: Reuses and extends existing bash scripts in `.specify/scripts/bash/`
- **Templates**: Uses existing templates in `.specify/templates/`

## Unresolved Questions

None - all technical decisions have been made based on existing project structure and requirements.


