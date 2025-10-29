---
description: Comprehensive code review focusing on architecture, design patterns, hardcoding, and scalability
---

# Self Review Command

Perform a comprehensive code review of the current codebase state using git status.

## Review Focus Areas

1. **System Architecture Compliance**
   - Layered architecture adherence (Domain → Interface → Repository → Service → Controller)
   - Dependency direction (top-down, no circular dependencies)
   - Layer boundary enforcement
   - Separation of concerns

2. **Design Pattern Implementation**
   - Repository Pattern usage
   - Factory Pattern implementation
   - Singleton Pattern where appropriate
   - Strategy Pattern for extensibility
   - Template Method Pattern
   - Facade Pattern in service layer
   - Dependency Injection

3. **Hardcoding Detection**
   - Configuration values (table names, limits, URLs)
   - Magic numbers and strings
   - Environment-specific values
   - Hardcoded field lists
   - Fixed timeout values
   - Centralized configuration usage

4. **General Scalability & Extensibility**
   - YAML-driven configuration support
   - Interface-based design
   - Easy addition of new implementations
   - Configuration over code changes
   - Testability through dependency injection

## Execution Process

### Step 1: Analyze Git Status

```bash
git status
git diff --stat
git diff --name-only
```

### Step 2: Review Changed/New Files

- Read all new and modified files
- Check for SOLID principle violations
- Identify hardcoded values
- Verify design pattern usage

### Step 3: Architecture Validation

- Verify layered architecture compliance
- Check dependency flow direction
- Ensure no circular dependencies
- Validate interface boundaries

### Step 4: Code Quality Assessment

- TypeScript type safety (no `any` types)
- Error handling completeness
- Logging implementation
- Code organization and structure

### Step 5: Scalability Evaluation

- Configuration-driven design
- Extension points identified
- Interface-based abstractions
- Environment variable support

### Step 6: Generate Report

Provide a comprehensive review report with:

- Overall score (out of 100)
- Category scores (Architecture, Patterns, SOLID, Quality, Scalability)
- Strengths (what's well done)
- Issues found (Critical 🔴, Major 🟡, Minor 🟢)
- Recommended actions
- Production readiness assessment

## Output Format

```
# 📋 Code Review Summary

**Overall Score**: X/100

| Category            | Score | Status |
|---------------------|-------|--------|
| System Architecture | XX/20 | ✅/⚠️/❌ |
| Design Patterns     | XX/20 | ✅/⚠️/❌ |
| SOLID Principles    | XX/20 | ✅/⚠️/❌ |
| Code Quality        | XX/20 | ✅/⚠️/❌ |
| Scalability         | XX/20 | ✅/⚠️/❌ |

---

## ✅ Strengths

### 1. [Category Name]
**Location**: [file:line]
- Description of what's well implemented
- Why it's a strength
- Impact on codebase quality

---

## ⚠️ Issues Found

### 🔴 Critical: [Issue Name]
**Location**: [file:line]
**Impact**: [description]
**Recommendation**: [action needed]

### 🟡 Major: [Issue Name]
**Location**: [file:line]
**Impact**: [description]
**Recommendation**: [action needed]

### 🟢 Minor: [Issue Name]
**Location**: [file:line]
**Impact**: [description]
**Recommendation**: [action needed]

---

## 🔧 Recommended Actions

**Priority 1 (Critical):**
1. [Action item]
2. [Action item]

**Priority 2 (Major):**
1. [Action item]
2. [Action item]

**Priority 3 (Minor):**
1. [Action item]
2. [Action item]

---

## 📊 Detailed Analysis

### Architecture Compliance
[Detailed architecture assessment]

### Design Pattern Usage
[Pattern-by-pattern evaluation]

### Hardcoding Detection
[List all hardcoded values found]

### Scalability Assessment
[Extension points and configuration evaluation]

---

## 🏆 Final Assessment

**Production Readiness**: ✅ Ready / ⚠️ Needs Work / ❌ Not Ready

[Summary paragraph with overall assessment and key recommendations]

---

**Review Date**: [date]
**Reviewer**: Claude Code (SuperClaude Framework)
**Grade**: [Excellent/Good/Fair/Poor]
```

## Evaluation Criteria

### System Architecture (20 points)

- ✅ Layered architecture adherence (5 pts)
- ✅ Clear dependency direction (5 pts)
- ✅ No circular dependencies (5 pts)
- ✅ Layer boundary enforcement (5 pts)

**Deductions:**

- -5 pts: Circular dependencies exist
- -3 pts: Layer boundaries violated
- -2 pts: Dependencies flow upward

### Design Patterns (20 points)

- ✅ Repository Pattern (4 pts)
- ✅ Factory Pattern (3 pts)
- ✅ Singleton Pattern (3 pts)
- ✅ Strategy Pattern (3 pts)
- ✅ Facade Pattern (3 pts)
- ✅ Dependency Injection (4 pts)

**Deductions:**

- -4 pts: Pattern misused or missing
- -2 pts: Pattern implemented incorrectly
- -1 pt: Pattern could be applied but isn't

### SOLID Principles (20 points)

- ✅ Single Responsibility (4 pts)
- ✅ Open/Closed (4 pts)
- ✅ Liskov Substitution (4 pts)
- ✅ Interface Segregation (4 pts)
- ✅ Dependency Inversion (4 pts)

**Deductions:**

- -4 pts: Principle violated
- -2 pts: Principle partially followed
- -1 pt: Minor deviation

### Code Quality (20 points)

- ✅ Type safety (5 pts)
- ✅ Error handling (5 pts)
- ✅ Logging (3 pts)
- ✅ Code organization (4 pts)
- ✅ Documentation (3 pts)

**Deductions:**

- -5 pts: `any` types used
- -3 pts: Missing error handling
- -2 pts: Poor organization
- -1 pt: Missing documentation

### Scalability (20 points)

- ✅ No hardcoded values (8 pts)
- ✅ Configuration-driven (5 pts)
- ✅ Interface-based design (4 pts)
- ✅ Environment variable support (3 pts)

**Deductions:**

- -2 pts per hardcoded value
- -4 pts: No configuration support
- -3 pts: Concrete class dependencies
- -2 pts: No environment variables

## Must-Pass Criteria

Before approving for production:

- [ ] TypeScript type check passes (`npx tsc --noEmit`)
- [ ] No circular dependencies
- [ ] All SOLID principles followed
- [ ] No hardcoded configuration values
- [ ] Proper error handling in all layers
- [ ] Interface-based design with DI support
- [ ] Environment variables for all config
- [ ] Logging implemented
- [ ] Layer boundaries respected

## Usage Examples

```bash
# Run the self review command
/self_review

# The command will automatically:
# 1. Check git status for changes
# 2. Analyze all modified/new files
# 3. Evaluate architecture and patterns
# 4. Generate comprehensive report
# 5. Provide actionable recommendations
```

## Notes

- This review focuses on **architecture**, **design patterns**, **hardcoding**, and **scalability**
- TypeScript type safety is mandatory (strict mode required)
- All configuration should be centralized and environment-based
- Dependencies must flow downward (Controller → Service → Repository → Domain)
- Interface-based design enables testability and extensibility
