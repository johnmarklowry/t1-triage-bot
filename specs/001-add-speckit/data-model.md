# Data Model

## Overview

This feature is a development tooling system that works with file-based artifacts. There are no traditional database entities, but the system manages structured file entities and their relationships.

## File Entities

### Feature Specification (`spec.md`)

**Purpose**: Input document that defines what feature is being planned.

**Structure**:
- User stories with priorities
- Functional requirements
- Success criteria
- Edge cases

**Relationships**:
- One spec.md per feature branch
- Referenced by plan.md

### Implementation Plan (`plan.md`)

**Purpose**: Generated document containing technical context, constitution check, and project structure.

**Structure**:
- Technical context (language, dependencies, platform)
- Constitution compliance check
- Project structure definition
- Complexity tracking (if needed)

**Relationships**:
- Generated from spec.md
- References constitution.md
- Used to generate research.md, data-model.md, contracts/, quickstart.md

### Research Document (`research.md`)

**Purpose**: Phase 0 output containing technology decisions and rationale.

**Structure**:
- Research tasks
- Decisions with rationale
- Alternatives considered
- Technology stack confirmation
- Integration points

**Relationships**:
- Generated during Phase 0
- Informs Phase 1 design decisions
- Referenced by plan.md

### Data Model Document (`data-model.md`)

**Purpose**: Phase 1 output defining entities, relationships, and validation rules.

**Structure**:
- Entity definitions
- Field descriptions
- Relationships
- Validation rules
- State transitions (if applicable)

**Relationships**:
- Generated during Phase 1
- Used for implementation planning
- May reference contracts/

### API Contracts (`contracts/`)

**Purpose**: Phase 1 output containing API endpoint specifications.

**Structure**:
- Endpoint definitions
- Request/response schemas
- Authentication requirements
- Error responses

**Relationships**:
- Generated during Phase 1 (if feature has APIs)
- Referenced by data-model.md
- Used for implementation

**Note**: For this tooling feature, no API contracts are needed as it's a command-line workflow.

### Quickstart Guide (`quickstart.md`)

**Purpose**: Phase 1 output providing usage instructions.

**Structure**:
- Prerequisites
- Setup steps
- Usage examples
- Common workflows

**Relationships**:
- Generated during Phase 1
- Provides user-facing documentation
- References other generated artifacts

## Directory Structure Entity

### Feature Directory (`specs/[###-feature-name]/`)

**Purpose**: Container for all feature planning artifacts.

**Structure**:
- Numeric prefix (e.g., `001-`) for ordering
- Kebab-case feature name
- Contains all planning artifacts

**Validation Rules**:
- Must match feature branch name pattern
- Must start with 3-digit numeric prefix
- Must be unique within specs/ directory

**Relationships**:
- One directory per feature branch
- Contains spec.md, plan.md, and generated artifacts
- Referenced by setup-plan.sh script

## State Transitions

### Planning Workflow States

1. **Initial**: Feature branch created, spec.md exists
2. **Phase 0 Complete**: research.md generated, all technical unknowns resolved
3. **Phase 1 Complete**: data-model.md, contracts/, quickstart.md generated
4. **Phase 2 Ready**: plan.md complete, ready for task generation

## Validation Rules

- Feature branch name must match pattern: `^[0-9]{3}-[a-z0-9-]+$`
- spec.md must exist before plan generation
- All "NEEDS CLARIFICATION" items must be resolved in research.md
- Constitution compliance must be verified before Phase 1
- Generated artifacts must follow template structure



