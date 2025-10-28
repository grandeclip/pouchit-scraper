---
description: Prepare and create a commit with documentation
---

# Commit Workflow

Complete pre-commit checks and create a commit.

## Pre-Commit Checklist

**MUST ALL PASS before committing:**

**참고**: docker build 대신 docker-compose를 사용합니다.

### product_search 모듈

```bash
cd product_search

# 1. Docker Compose Build & Up
docker-compose up --build -d

# 2. Container Status Check
docker ps | grep product_search
# STATUS 확인 (healthy)

# 3. Health Check
curl http://localhost:3000/health

# 4. Basic API Test (선택적)
curl -X POST http://localhost:3000/search-products/oliveyoung \
  -H "Content-Type: application/json" \
  -d '{"brand":"라운드랩","productName":"선크림"}'

# 5. Cleanup
docker-compose down
```

### product_scanner 모듈

```bash
cd product_scanner

# 1. Docker Compose Build & Up
docker-compose up --build -d

# 2. Container Status Check
docker ps | grep product_scanner
# STATUS가 "healthy"인지 확인

# 3. Health Check
curl http://localhost:3989/health

# 4. Supabase Connection Test
docker cp test-supabase.ts product_scanner:/app/
docker exec product_scanner npx tsx test-supabase.ts
# "✅ 연결 성공!" 메시지 확인
# product_sets 테이블 레코드 수 확인

# 5. Cleanup
docker-compose down
```

## Steps

1. **Run pre-commit checks** (see above)

1. **Review changes**:

```bash
git status
git diff --staged
```

1. **Commit with conventional format (한글 작성)**:

```bash
git commit -m "type(scope): 한글로 작성된 설명

- 상세 변경사항 1
- 상세 변경사항 2
"
```

**중요**: 커밋 메시지는 **반드시 한글**로 작성합니다.

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `test`: Add/update tests
- `docs`: Documentation only
- `style`: Formatting, no code change
- `perf`: Performance improvement
- `chore`: Build/tooling changes

### Scope Guidelines

프로젝트 구조에 맞는 스코프:

- `scraper`: 스크래퍼 모듈 (product_search 등)
- `config`: YAML 설정 파일
- `core`: 도메인 모델, 인터페이스
- `services`: 비즈니스 로직 서비스
- `extractors`: 데이터 추출 로직
- `navigators`: 페이지 네비게이션
- `docker`: Docker/배포 설정
- `docs`: 문서화

### Examples (한글 작성)

```bash
# Feature
git commit -m "feat(scraper): 기획 세트 등록 스크래퍼 추가"

# Bug fix
git commit -m "fix(extractor): 상품 가격 추출 로직 수정"

# Refactor
git commit -m "refactor(config): YAML 스키마 v2로 마이그레이션"

# Docker
git commit -m "chore(docker): Playwright 베이스 이미지 v1.56.1로 업데이트"

# Documentation
git commit -m "docs: Claude Code 설정 및 워크플로우 명령어 추가"
```

## Verification

Before pushing:

- [ ] Docker Compose build succeeds
- [ ] Container starts and health check passes
- [ ] API responds correctly (basic test)
- [ ] No console errors in container logs
- [ ] Commit message follows convention
