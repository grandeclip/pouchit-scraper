---
description: Prepare and create a commit with documentation
---

# Commit Workflow

Complete pre-commit checks and create a commit.

## Pre-Commit Checklist

**MUST ALL PASS before committing:**

```bash
# 1. Docker Build (모듈별)
cd product_search  # 또는 작업 중인 모듈
docker build -t scraper-module:test .

# 2. Docker Compose Health Check
docker-compose up -d
docker ps  # STATUS 확인
curl http://localhost:3987/health  # 헬스체크 확인

# 3. Basic API Test (선택적)
# 예시: 상품 검색 테스트
curl -X POST http://localhost:3987/scrape \
  -H "Content-Type: application/json" \
  -d '{"targetId":"example","query":"테스트"}'

# 4. Cleanup
docker-compose down
```

## Steps

1. **Run pre-commit checks** (see above)

2. **Review changes**:

```bash
git status
git diff --staged
```

1. **Commit with conventional format**:

```bash
git commit -m "type(scope): description

- Detailed change 1
- Detailed change 2
"
```

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

### Examples

```bash
# Feature
git commit -m "feat(scraper): Add planning set registration scraper"

# Bug fix
git commit -m "fix(extractor): Correct product price extraction logic"

# Refactor
git commit -m "refactor(config): Migrate YAML schema to v2"

# Docker
git commit -m "chore(docker): Update Playwright base image to v1.56.1"
```

## Verification

Before pushing:

- [ ] Docker build succeeds
- [ ] Container starts and health check passes
- [ ] API responds correctly (basic test)
- [ ] No console errors in container logs
- [ ] Commit message follows convention
