# API Contracts

## Overview

This feature is a development tooling system that operates via command-line workflows. There are no REST APIs or external service contracts required.

## Command-Line Interface

### `/speckit.plan` Command

**Purpose**: Execute the planning workflow to generate implementation plans.

**Input**: Feature specification (`specs/[###-feature-name]/spec.md`)

**Output**: 
- `plan.md` - Implementation plan
- `research.md` - Phase 0 research
- `data-model.md` - Phase 1 data model
- `contracts/` - Phase 1 API contracts (if applicable)
- `quickstart.md` - Phase 1 quickstart guide

**Preconditions**:
- Feature branch exists with numeric prefix
- `spec.md` file exists in feature directory
- Constitution file exists at `.specify/memory/constitution.md`

**Postconditions**:
- All Phase 0 and Phase 1 artifacts generated
- Constitution compliance verified
- Agent context updated (if applicable)

**Error Conditions**:
- Missing spec.md → Error: "Feature specification not found"
- Invalid branch name → Error: "Not on a feature branch"
- Constitution violations → Warning: "Constitution compliance issues detected"

## File System Contracts

### Template Processing

**Input**: Template file with placeholders (e.g., `[FEATURE_NAME]`)

**Output**: Processed file with placeholders replaced

**Processing Rules**:
- Placeholders in square brackets are replaced with actual values
- Unknown placeholders are left as-is with warning
- Template structure is preserved

### Directory Creation

**Contract**: Feature directories are created automatically when needed.

**Structure**: `specs/[###-feature-name]/`

**Validation**: Directory name must match branch name pattern



