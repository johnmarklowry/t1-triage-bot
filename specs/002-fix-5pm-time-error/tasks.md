# Tasks: Fix 5PM Check Time Error

**Input**: Design documents from `/specs/002-fix-5pm-time-error/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Manual validation via test routes; no automated test tasks included as per specification.

**Organization**: Tasks are split across multiple agents for parallel execution. See agent-specific task files:
- `tasks-agent1.md` - Core fix implementation (critical path)
- `tasks-agent2.md` - Testing & validation
- `tasks-agent3.md` - Code review & other callers

## Agent Coordination

### Agent 1: Core Fix (Critical Path)
- **File**: `tasks-agent1.md`
- **Focus**: Enhance `parsePTDate()` and update `run5pmCheck()`
- **Blocks**: Agent 2 testing (after T013 and T016)
- **Status**: Ready to start

### Agent 2: Testing & Validation
- **File**: `tasks-agent2.md`
- **Focus**: Comprehensive testing of the fix
- **Dependencies**: Wait for Agent 1 checkpoints
- **Status**: Can start setup, wait for Agent 1 T013/T016

### Agent 3: Code Review & Other Callers
- **File**: `tasks-agent3.md`
- **Focus**: Review other callers and formatPTDate()
- **Dependencies**: None (can start after setup)
- **Status**: Ready to start after Phase 1 & 2

## Execution Order

1. **All Agents**: Complete Phase 1 & 2 setup tasks (T001-T008)
2. **Agent 1**: Implement core fix (T009-T016, T022-T024)
3. **Agent 2**: Test parsePTDate() after Agent 1 T013, test run5pmCheck() after Agent 1 T016
4. **Agent 3**: Review other callers (can start immediately after setup)

## Quick Reference

- **Total Tasks**: 29 tasks across all agents
- **User Story**: 1 (P1) - Fix Invalid Time Value Error
- **MVP Scope**: Agent 1 tasks (T001-T016, T022-T024) = 20 tasks
- **Testing Scope**: Agent 2 tasks (T017-T021, T025-T026, T029) = 7 tasks
- **Review Scope**: Agent 3 tasks (T027-T028) = 2 tasks

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Include exact file paths in descriptions

For detailed task lists, see the agent-specific files above.
