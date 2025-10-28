# Scoob Scraper Project

Docker 기반 웹 스크래퍼 모듈 개발 프로젝트 - YAML 설정 기반으로 코드 수정 없이 새로운 스크래퍼를 추가할 수 있는 확장 가능한 시스템.

## 🎯 Project Overview

- **Type**: TypeScript + Docker + Playwright 기반 웹 스크래핑 서버
- **Architecture**: Multi-module monorepo (각 스크래퍼는 독립적인 Docker 서비스)
- **Reference**: `product_search/` - 상품 검색 스크래퍼 (완성)
- **Goal**: 새로운 스크래퍼 모듈을 추가 개발

## 📚 Technology Stack

### Core

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Executor**: tsx (TypeScript execution)
- **Browser**: Playwright (with playwright-extra, stealth plugin)
- **Web Framework**: Express.js
- **Configuration**: YAML (js-yaml)
- **Validation**: Zod

### Development

- **Type Checking**: TypeScript strict mode
- **Module System**: CommonJS
- **Target**: ES2020
- **Containerization**: Docker + docker-compose

## 🏗️ Architecture Philosophy

### Design Patterns (Mandatory)

모든 코드는 다음 디자인 패턴을 엄격히 준수해야 합니다:

- **Strategy Pattern**: 스크래퍼별 스크래핑 전략 (YAML 설정 기반)
- **Template Method Pattern**: 공통 스크래핑 흐름 정의
- **Factory Pattern**: 스크래퍼 인스턴스 생성
- **Registry Pattern**: 스크래퍼 캐싱 및 관리
- **Singleton Pattern**: 설정 로더 및 레지스트리
- **Command Pattern**: 브라우저 액션 실행
- **Facade Pattern**: 서비스 계층 단순화

### SOLID Principles (Non-Negotiable)

- **SRP**: 각 클래스는 단일 책임만 가짐
- **OCP**: 확장에 열려있고 수정에 닫혀있음 (YAML로 확장)
- **LSP**: 모든 하위 클래스는 상위 클래스로 대체 가능
- **ISP**: 클라이언트별 인터페이스 분리
- **DIP**: 추상화에 의존, 구체 클래스에 의존하지 않음

## 📁 Directory Structure (Standard)

각 스크래퍼 모듈은 다음 구조를 따라야 합니다:

```text
scraper_module/
├── server.ts                      # Entry point (~100줄 이하)
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── Dockerfile                     # Container definition
├── docker-compose.yml             # Service orchestration
├── config/
│   ├── targets/                   # YAML 설정 파일들
│   │   ├── target1.yaml
│   │   └── target2.yaml
│   └── ConfigLoader.ts            # YAML 로더 (Singleton)
├── core/
│   ├── domain/                    # Domain models
│   │   ├── Entity.ts
│   │   └── Config.ts
│   └── interfaces/                # Interface definitions
│       ├── IScraper.ts
│       └── IExtractor.ts
├── services/
│   ├── ScraperService.ts          # Business logic (Facade)
│   └── ScraperRegistry.ts         # Registry (Singleton)
├── scrapers/
│   ├── base/
│   │   ├── BaseScraper.ts         # Abstract base class
│   │   └── ScraperFactory.ts      # Factory
│   └── ConfigDrivenScraper.ts     # YAML-based scraper
├── navigators/
│   ├── PageNavigator.ts           # Navigation orchestrator
│   └── ActionExecutor.ts          # Action executor (Command)
├── extractors/
│   ├── EvaluateExtractor.ts       # page.evaluate extraction
│   └── SelectorExtractor.ts       # Playwright API extraction
├── controllers/
│   └── ScrapeController.ts        # HTTP controller
└── middleware/
    ├── errorHandler.ts            # Global error handler
    └── validation.ts              # Request validation
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

- **One Class Per File**: 각 파일은 하나의 클래스만 export
- **Interface Separation**: 인터페이스는 별도 파일로 분리
- **Barrel Exports**: index.ts로 모듈 exports 정리
- **Dependency Injection**: 생성자에서 의존성 주입

## 🔧 Development Workflow

### Common Commands

```bash
# Development (with auto-reload)
npm run dev
# or
tsx watch server.ts

# Production
npm start
# or
tsx server.ts

# Type checking (MANDATORY before commit)
npx tsc --noEmit

# Lint (if configured)
npm run lint

# Docker build
docker build -t scraper-name .

# Docker compose
docker-compose up -d
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

- **Zero Code Changes**: 새로운 타겟 추가 시 YAML 파일만 추가
- **Declarative**: 무엇을 할지만 정의 (how는 프레임워크가 처리)
- **Validated**: Zod로 스키마 검증
- **Template Variables**: `${variable}` 지원

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

- **Never Suppress Errors**: 모든 에러는 로깅하고 상위로 전파
- **Context Preservation**: 에러 발생 시 컨텍스트 정보 포함
- **Graceful Degradation**: 부분 실패 시에도 가능한 결과 반환
- **HTTP Error Codes**: 적절한 상태 코드 사용 (400, 404, 500 등)

### Error Middleware

```typescript
// middleware/errorHandler.ts 패턴 따르기
app.use(errorHandler);
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

1. **Always check `product_search/` for reference patterns**
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

- `product_search/README.md` - Architecture documentation
- `product_search/config/malls/*.yaml` - YAML examples
- `product_search/core/` - Domain model reference
- `product_search/scrapers/base/` - Base class patterns

### Pattern Examples

- Strategy Pattern → `ConfigDrivenScraper.ts`
- Factory Pattern → `ScraperFactory.ts`
- Registry Pattern → `ScraperRegistry.ts`
- Command Pattern → `ActionExecutor.ts`
- Template Method → `BaseScraper.ts`

---

**Last Updated**: 2025-10-28

**Status**: Active Development
