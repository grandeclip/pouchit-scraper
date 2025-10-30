# Scoob Scraper Project

Docker-based web scraper module development project - An extensible system that allows adding new scrapers without code modification through YAML configuration.

## 📢 Output Guidelines

**CRITICAL OUTPUT RULES** (Apply to ALL interactions):

1. **Language**: 한글 (Korean) - All outputs, explanations, and responses must be in Korean
2. **Conciseness**: Be extremely concise. Sacrifice grammar for brevity. Output must be scannable, not verbose
3. **Format**: Use symbols, abbreviations, bullet points. Avoid full sentences when possible
4. **Examples**:
   - ❌ BAD: "TypeScript 타입 체크를 실행한 결과 3개의 에러가 발견되었습니다. 각 에러에 대한 상세한 분석은 다음과 같습니다..."
   - ✅ GOOD: "tsc 결과: 3 errors\n- file.ts:42 - Type 'string' → 'number'\n- ..."

**Apply to**: Code reviews, commit messages, PR descriptions, error analysis, all responses

## 🎯 Project Overview

- **Type**: TypeScript + Docker + Playwright-based web scraping server
- **Architecture**: Multi-module monorepo (each scraper is an independent Docker service)
- **Reference**: `product_scanner/` - Product scanner module (completed)
- **Goal**: Add new scraper modules

## 📚 Technology Stack

### Core

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Executor**: tsx (TypeScript execution)
- **Browser**: Playwright (with playwright-extra, stealth plugin)
- **Web Framework**: Express.js
- **Configuration**: YAML (js-yaml)
- **Validation**: Zod
- **Logging**: Pino (structured JSON logging with rotation)

### Development

- **Type Checking**: TypeScript strict mode
- **Module System**: CommonJS
- **Target**: ES2020
- **Containerization**: Docker + docker-compose

## 🏗️ Architecture Philosophy

### Design Patterns (Mandatory)

All code must strictly adhere to the following design patterns:

- **Strategy Pattern**: Scraping strategy per scraper (YAML configuration-based)
- **Template Method Pattern**: Define common scraping flow
- **Factory Pattern**: Scraper instance creation
- **Registry Pattern**: Scraper caching and management
- **Repository Pattern**: Data access logic encapsulation (Supabase integration)
- **Singleton Pattern**: Configuration loader, registry, Supabase client
- **Command Pattern**: Browser action execution
- **Facade Pattern**: Service layer simplification

### SOLID Principles (Non-Negotiable)

- **SRP**: Each class has a single responsibility
- **OCP**: Open for extension, closed for modification (extend via YAML)
- **LSP**: All subclasses must be substitutable for their base classes
- **ISP**: Client-specific interface segregation
- **DIP**: Depend on abstractions, not concrete classes

## 🔄 Workflow System (product_scanner)

The product_scanner module includes a **DAG-based workflow system** for automating bulk product validation.

### Key Features

- **DAG Structure**: Supports Fork, Join, and conditional branching with `next_nodes: string[]`
- **JSON Configuration**: Define workflows in JSON without code changes
- **Auto-Validation**: Workflow structure validation (node references, cycles, unreachable nodes)
- **Redis Job Queue**: Asynchronous processing with background workers
- **Multi-Platform Support**: Platform-specific parallel processing (8 shopping malls + default)
- **Job Metadata**: Auto-recording of start/completion timestamps and result file storage

### Workflow Node Structure

```json
{
  "type": "node_type",
  "name": "Node Name",
  "config": {},
  "next_nodes": ["node_id_1", "node_id_2"], // Array for DAG support
  "retry": { "max_attempts": 3, "backoff_ms": 1000 },
  "timeout_ms": 30000
}
```

### Important

- **`next_nodes`** is an **array** (not single string) - supports multiple branches
- Empty array `[]` means workflow termination
- See `product_scanner/docs/WORKFLOW_DAG.md` for detailed DAG patterns

## 📁 Directory Structure (Standard)

Each scraper module must follow this structure:

```text
scraper_module/
├── src/                           # Source code (NEW)
│   ├── server.ts                  # Entry point (under 100 lines)
│   ├── config/
│   │   ├── constants.ts           # Application constants
│   │   ├── logger.ts              # Pino Logger (Singleton)
│   │   ├── targets/               # YAML configuration files
│   │   │   ├── target1.yaml
│   │   │   └── target2.yaml
│   │   └── ConfigLoader.ts        # YAML 로더 (Singleton)
│   ├── core/
│   │   ├── domain/                # Domain models
│   │   │   ├── Entity.ts
│   │   │   └── Config.ts
│   │   └── interfaces/            # Interface definitions
│   │       ├── IScraper.ts
│   │       ├── IExtractor.ts
│   │       └── IRepository.ts     # Repository interface
│   ├── services/
│   │   ├── ScraperService.ts      # Business logic (Facade)
│   │   └── ScraperRegistry.ts     # Registry (Singleton)
│   ├── repositories/              # Data access layer (NEW)
│   │   └── SupabaseRepository.ts  # Supabase implementation
│   ├── scrapers/
│   │   ├── base/
│   │   │   ├── BaseScraper.ts     # Abstract base class
│   │   │   └── ScraperFactory.ts  # Factory
│   │   └── ConfigDrivenScraper.ts # YAML-based scraper
│   ├── navigators/
│   │   ├── PageNavigator.ts       # Navigation orchestrator
│   │   └── ActionExecutor.ts      # Action executor (Command)
│   ├── extractors/
│   │   ├── EvaluateExtractor.ts   # page.evaluate extraction
│   │   └── SelectorExtractor.ts   # Playwright API extraction
│   ├── controllers/
│   │   └── ScrapeController.ts    # HTTP controller
│   ├── middleware/
│   │   ├── errorHandler.ts        # Global error handler
│   │   ├── requestLogger.ts       # HTTP request logger
│   │   └── validation.ts          # Request validation
│   └── utils/                     # Utility functions
│       ├── logger-context.ts      # Logger context helper
│       └── timestamp.ts           # Timestamp utility
├── tests/                         # Test files (NEW)
│   └── *.test.ts
├── scripts/                       # Standalone scripts (NEW)
│   └── *.ts
├── workflows/                     # Workflow definitions (JSON) - product_scanner only
│   ├── bulk-validation-v1.json    # Example: Linear chain
│   └── dag-example-v1.json        # Example: DAG structure
├── docs/                          # Documentation (NEW)
│   ├── *.md
│   ├── WORKFLOW.md                # Workflow system guide - product_scanner
│   └── WORKFLOW_DAG.md            # DAG structure guide - product_scanner
├── docker/                        # Docker configuration (NEW)
│   ├── README.md
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
├── package.json                   # Dependencies
└── tsconfig.json                  # TypeScript config
```

## 💻 Code Style Guidelines

### TypeScript Standards

- **Strict Mode**: 항상 활성화 (`"strict": true`)
- **Type Safety**: `any` 사용 금지, 모든 타입 명시
- **Null Safety**: null/undefined 명시적 처리
- **Module Resolution**: Node style (`"moduleResolution": "node"`)
- **Import Style**: ES module syntax 사용 (CommonJS 빌드)

### Naming Conventions

- **Classes**: PascalCase (`BaseScraper`, `ConfigLoader`)
- **Interfaces**: `I` prefix + PascalCase (`IScraper`, `IExtractor`)
- **Files**: PascalCase for classes (`BaseScraper.ts`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`)
- **Functions/Variables**: camelCase (`extractProducts`, `searchQuery`)

### Code Organization

- **One Class Per File**: Each file exports only one class
- **Interface Separation**: Interfaces separated into dedicated files
- **Barrel Exports**: Organize module exports via index.ts
- **Dependency Injection**: Inject dependencies via constructor

### Import Path Rules (MANDATORY)

**Absolute Path Usage Principle**:

```typescript
// ✅ GOOD - Absolute path (using @/ alias)
import { ConfigLoader } from "@/config/ConfigLoader";
import { HwahaeProduct } from "@/core/domain/HwahaeProduct";
import { HwahaeApiFetcher } from "@/fetchers/HwahaeApiFetcher";

// ✅ GOOD - External libraries
import express from "express";
import { createClient } from "@supabase/supabase-js";

// ✅ ACCEPTABLE - Same directory
import { SupabaseService } from "./SupabaseService";

// ❌ BAD - Relative path (different directory)
import { ConfigLoader } from "../config/ConfigLoader";
import { HwahaeProduct } from "../../core/domain/HwahaeProduct";
```

**Import Order**:

1. External libraries (Node.js built-in, npm packages)
2. Absolute path imports (`@/` alias)
3. Relative path imports (same directory)

**tsconfig.json Configuration** (already applied):

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## 🐳 Docker Development Workflow (2025 Best Practice)

### Development Environment Strategy

**Approach**: Volume Mount + Hot Reload (Hybrid Method)

- **Tools**: docker-compose.dev.yml + tsx watch
- **Benefits**: Development speed + environment consistency + type safety

### Quick Start

```bash
# Start development environment
cd product_scanner
make dev

# Type check (inside container)
make type-check

# Run tests
make test

# View logs
make logs

# Stop
make dev-down
```

### Development vs Production

| Item           | Development Environment | Production Environment   |
| -------------- | ----------------------- | ------------------------ |
| **Dockerfile** | Dockerfile.dev          | Dockerfile (Multi-stage) |
| **Compose**    | docker-compose.dev.yml  | docker-compose.yml       |
| **Volume**     | ✅ Yes (./:/app)        | ❌ No                    |
| **Hot Reload** | ✅ tsx watch            | ❌ tsx                   |
| **Purpose**    | Local development       | Deployment, production   |

### Available Commands

- `/dev` - Development environment management (start, stop, logs)
- `/docker` - Overall Docker management (dev/prod environments)
- `/test` - Module-specific testing (dev/prod environments)

## 🔧 Development Workflow

### Common Commands

```bash
# Development (with auto-reload)
npm run dev
# or
tsx watch src/server.ts

# Production
npm start
# or
tsx src/server.ts

# Test execution
npm test
# or
tsx tests/*.test.ts

# Standalone scripts
npm run script:name
# or
tsx scripts/script-name.ts

# Type checking (MANDATORY before commit)
npx tsc --noEmit

# Lint (if configured)
npm run lint

# Docker build
docker build -t scraper-name -f docker/Dockerfile .

# Docker compose
docker-compose -f docker/docker-compose.yml up -d
```

### Pre-Commit Checklist

1. ✅ Type check: `npx tsc --noEmit` (0 errors)
2. ✅ Code follows design patterns
3. ✅ SOLID principles maintained
4. ✅ No `any` types
5. ✅ All interfaces defined
6. ✅ Error handling implemented

## 🎨 Configuration-Driven Development

### YAML Configuration Philosophy

- **Zero Code Changes**: Add new targets by only adding YAML files
- **Declarative**: Define what to do (framework handles how)
- **Validated**: Schema validation with Zod
- **Template Variables**: Support for `${variable}` syntax

### Template Variables (Standard)

```yaml
${baseUrl}         # Base URL
${searchUrl}       # Search URL
${query}           # Search query (raw)
${encodedQuery}    # URL-encoded query
# Add custom variables as needed
```

## 🛡️ Error Handling Standards

### Error Handling Requirements

- **Never Suppress Errors**: Log all errors and propagate to upper layers
- **Context Preservation**: Include context information when errors occur
- **Graceful Degradation**: Return possible results even on partial failure
- **HTTP Error Codes**: Use appropriate status codes (400, 404, 500, etc.)

### Error Middleware

```typescript
// Follow middleware/errorHandler.ts pattern
app.use(errorHandler);
```

## 📊 Logging Standards

### Pino-Based Structured Logging

**Core Requirements**:

- **Structured JSON**: All logs in machine-readable JSON format
- **Service Separation**: Separate log files per service (server, worker)
- **Daily Rotation**: Automatic rotation with YYYYMMDD format
- **Context Tracking**: Request ID, Job ID, Workflow ID tracking
- **Timezone Support**: ISO 8601 format with timezone info

### Logging Strategy

**Console Output**:

- WARNING/ERROR always visible
- INFO only with `important: true` flag
- Health checks console-only (skip file logging)

**File Output**:

- Service-specific files: `server-YYYYMMDD.log`, `worker-YYYYMMDD.log`
- Error aggregation: `error-YYYYMMDD.log`
- 30-day retention, 100MB rotation, gzip after 1 day

### Context Helpers

```typescript
// Request context
import { createRequestLogger } from "@/utils/logger-context";
const logger = createRequestLogger(requestId, method, path);

// Job context (Workflow)
import { createJobLogger } from "@/utils/logger-context";
const logger = createJobLogger(jobId, workflowId);

// Important logs (console output)
import { logImportant } from "@/utils/logger-context";
logImportant(logger, "중요 메시지", { data });
```

### Environment Variables

```bash
LOG_LEVEL=info        # debug, info, warn, error
LOG_DIR=./logs        # Log file directory
LOG_PRETTY=true       # Pretty console output (dev only)
TZ=Asia/Seoul         # Timezone
```

## 🧪 Quality Standards

### Code Quality Metrics

- **Type Coverage**: 100% (no `any`)
- **SOLID Compliance**: All principles followed
- **Pattern Usage**: Appropriate design patterns applied
- **File Size**: Entry point < 150 lines
- **Function Complexity**: Keep cyclomatic complexity < 10

### Performance Requirements

- **Response Time**: < 30s per scrape operation
- **Memory**: Efficient Playwright instance management
- **Concurrency**: Support parallel requests
- **Resource Cleanup**: Always close browser instances

## 🐳 Docker Standards

### Dockerfile Requirements

- **Base Image**: `node:20-alpine` (lightweight)
- **Multi-stage**: Optional for production optimization
- **Playwright**: Install with `--with-deps chromium`
- **Security**: Run as non-root user (when possible)
- **Port**: Expose service port (typically 3000-3100)

### Environment Variables

```bash
PORT=3000              # Server port
NODE_ENV=production    # Environment
LOG_LEVEL=info         # Logging level
```

## 📝 Documentation Requirements

### Code Documentation

- **Complex Logic**: JSDoc comments explaining why, not what
- **Public APIs**: Document parameters and return types
- **Configuration**: YAML schema documented in README
- **Architecture**: Update README when patterns change

### README Structure

Each module must have:

1. Purpose and overview
2. Architecture and design patterns
3. Directory structure
4. Usage examples (API + CLI)
5. YAML configuration guide
6. Docker deployment
7. Debugging tips

## 🚨 Important Notes

### When Writing Code

1. **Always check `product_scanner/` for reference patterns**
2. **Type safety is non-negotiable** - no `any`, explicit types everywhere
3. **Follow existing architecture** - don't reinvent patterns
4. **YAML-first approach** - maximize configurability
5. **Run `npx tsc --noEmit`** before marking any task complete

### When Reviewing Code

1. ✅ Design patterns correctly applied?
2. ✅ SOLID principles maintained?
3. ✅ Type safety enforced?
4. ✅ Error handling comprehensive?
5. ✅ Configuration-driven architecture preserved?

## 🎓 Learning Resources

### Internal Reference

- `product_scanner/README.md` - Architecture documentation
- `product_scanner/config/platforms/*.yaml` - YAML examples
- `product_scanner/core/` - Domain model reference
- `product_scanner/scrapers/base/` - Base class patterns

### Pattern Examples

- Strategy Pattern → `ConfigDrivenScraper.ts`
- Factory Pattern → `ScraperFactory.ts`
- Registry Pattern → `ScraperRegistry.ts`
- Repository Pattern → `SupabaseProductRepository.ts`
- Command Pattern → `ActionExecutor.ts`
- Template Method → `BaseScraper.ts`
- Facade Pattern → `ProductSearchService.ts`
