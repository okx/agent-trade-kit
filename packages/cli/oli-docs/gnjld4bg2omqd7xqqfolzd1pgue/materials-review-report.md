# Materials Review Report

**PRD URL**: https://okg-block.sg.larksuite.com/docx/GnJld4bG2oMQd7xqqfolzD1pgue
**docs-path**: packages/cli/oli-docs/gnjld4bg2omqd7xqqfolzd1pgue
**Date**: 2026-06-03

## Review Status

> Note: The `front-end-materials-review` skill was not installed in this stage. A manual assessment is provided below.

## Document Assessment

**Document type**: TECH_DESIGN (Bug-fix technical design)
**Title**: 技术设计方案：修复 `market filter` / `market indicator` CLI 空输出问题
**Status**: Draft

## Issues

✅ No blockers identified.

### Summary

The PRD is a well-structured technical design doc covering two CLI bugs:

1. **Bug 1** (`market filter` returns empty): Clear root cause (API `data` field is array, CLI parses as object), fix is straightforward (array unwrap, same as existing `cmdMarketOiHistory` pattern), unit test mock needs updating.

2. **Bug 2** (`market indicator` silent empty output): Dual root cause — server returns empty array for period-based indicators without `paramList`, CLI silently skips empty results. Fix involves adding user-visible error message (plan A, mandatory) and optionally adding client-side defaults (plan B).

### Open Questions from PRD

1. Where to place the default params table for Bug 2 plan B (core vs CLI)
2. Whether to implement plan B at all (plan A is mandatory, plan B is suggested)
3. Specific default param values for all period-based indicators
4. Which eval probes in `eval/probes/market/` need re-validation

These are design decisions, not blockers. Implementation can proceed with plan A; plan B is optional.

## Verdict

✅ No issues found that would block implementation. Proceed normally.
