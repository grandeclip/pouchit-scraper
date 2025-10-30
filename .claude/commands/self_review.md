---
description: Code review - Architecture, Patterns, SOLID, Quality
---

# Self Review

**CRITICAL**: Be extremely concise. Sacrifice grammar for concision. Output must be scannable, not verbose.

**OUTPUT LANGUAGE**: 한글 (Korean) - All results must be written in Korean.

Review git changes focusing on architecture, patterns, hardcoding, scalability.

## Focus (20pts each)

1. **Arch**: Layered (Domain→Interface→Repository→Service→Controller), top-down deps, no circular
2. **Patterns**: Repository, Factory, Singleton, Strategy, Template, Facade, DI
3. **Hardcoding**: Config values, magic numbers, URLs, table names, timeouts → use env vars
4. **Scale**: Interface-based, DI, easy to extend, YAML-driven

## Process

1. `git status && git diff --stat && git diff --name-only`
2. Read changed files
3. Check: Arch, patterns, SOLID, hardcoding, quality, scale
4. Run: `npx tsc --noEmit`
5. Output: Score, issues (🔴🟡🟢), actions

## Output (Concise!)

**Score**: X/100 | **Status**: ✅ Ready / ⚠️ Needs work / ❌ Not ready

| Area     | Score | Status   |
| -------- | ----- | -------- |
| Arch     | XX/20 | ✅/⚠️/❌ |
| Patterns | XX/20 | ✅/⚠️/❌ |
| SOLID    | XX/20 | ✅/⚠️/❌ |
| Quality  | XX/20 | ✅/⚠️/❌ |
| Scale    | XX/20 | ✅/⚠️/❌ |

### ✅ Good

- [item] @ file:line

### 🔴 Critical (fix now)

- [issue] @ file:line → Fix: [action]

### 🟡 Major (should fix)

- [issue] @ file:line → Fix: [action]

### 🟢 Minor

- [suggestion] @ file:line

### Files

```text
file.ts
├─ Layer: [layer]
├─ Patterns: [list]
├─ SOLID: SRP✅ OCP✅ LSP✅ ISP✅ DIP⚠️
├─ Issues: L[line]: [desc]
└─ Fix: [action]
```

## Deductions

**Arch**: Circular dep -5, Layer violation -3, Wrong flow -2
**Patterns**: Misuse/missing -4, Incorrect -2, Could apply -1
**SOLID**: Violation -4, Partial -2, Minor -1
**Quality**: `any` -5, No error handling -3, Poor org -2, No docs -1
**Scale**: Hardcode -2 (each), No config -4, Concrete deps -3, No env -2

**Grades**: 95-100 Excellent | 90-94 Very Good | 85-89 Good | 80-84 OK | 75-79 Fair | 70-74 Poor | <70 Critical

## Blockers

- [ ] `tsc --noEmit` passes (0 errors) - using docker compose
- [ ] No circular deps
- [ ] SOLID followed
- [ ] No hardcoded config
- [ ] Error handling present
- [ ] Interface-based + DI
- [ ] Env vars used
- [ ] Logging present
- [ ] Layer boundaries OK
