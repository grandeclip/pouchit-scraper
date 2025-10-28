---
description: Create a GitHub Pull Request with proper formatting
---

# Pull Request Creation

Create a well-formatted GitHub PR for the current branch.

## Pre-PR Checklist

**MUST ALL PASS before creating PR:**

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

# 4. Basic API Test
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
# "✅ 연결 성공!" 확인
# product_sets 테이블 조회 성공 확인

# 5. Cleanup
docker-compose down
```

## Steps

1. **Verify branch status**:

```bash
git status
git log --oneline -10
git diff main...HEAD  # or develop...HEAD
```

2. **Ensure branch is pushed**:

```bash
git push -u origin <branch-name>
```

3. **Analyze commits** from current branch:
   - Read commit messages
   - Identify main feature/fix/refactor
   - Determine conventional commit type

4. **Generate PR title** (conventional format):

```
<type>(<scope>): <description>

Examples:
- feat(scraper): Add planning set registration scraper
- fix(extractor): Correct product price extraction logic
- refactor(config): Migrate YAML schema to v2
```

5. **Create PR description (Korean)**:

```markdown
## 요약

- [변경 사항 요약 첫번째]
- [변경 사항 요약 두번째]

## 변경 내용

### 무엇을 변경했나요?

- 상세한 변경 내용 설명
- 수정된 파일/컴포넌트

### 왜 변경했나요?

- 변경 이유
- 해결하려는 문제

## 테스트 체크리스트

- [x] Docker Compose 빌드 성공
- [x] 컨테이너 헬스체크 통과
- [x] API 기본 테스트 통과
- [x] 컨테이너 로그 에러 없음
- [x] 스크래핑 동작 확인 (스크래퍼 변경 시)

## 추가 사항

[특이사항, Breaking changes, 후속 작업 등]
```

6. **Create PR using GitHub CLI**:

```bash
gh pr create \
  --title "<conventional-title>" \
  --body "<description-from-above>" \
  --base main  # or develop
```

## Commit Types Reference

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvement
- `test`: Add/update tests
- `docs`: Documentation only
- `style`: Formatting, no code change
- `chore`: Build/tooling changes

## Scope Guidelines

프로젝트 구조에 맞는 스코프:

- `scraper`: 스크래퍼 모듈 (product_search 등)
- `config`: YAML 설정 파일
- `core`: 도메인 모델, 인터페이스
- `services`: 비즈니스 로직 서비스
- `extractors`: 데이터 추출 로직
- `navigators`: 페이지 네비게이션
- `docker`: Docker/배포 설정
- `docs`: 문서화

## Example PR Creation

```bash
# 1. Check status
git status
git log --oneline -5

# 2. Push branch
git push -u origin feature/planning-set-scraper

# 3. Create PR
gh pr create \
  --title "feat(scraper): Add planning set registration scraper module" \
  --body "$(cat <<'EOF'
## 요약
- 기획 세트 등록용 새로운 스크래퍼 모듈 추가
- YAML 기반 설정으로 확장 가능한 구조 구현
- Docker 컨테이너화 완료

## 변경 내용

### 무엇을 변경했나요?
- planning_set/ 모듈 신규 추가
- ConfigDrivenScraper 패턴 적용
- 쇼핑몰별 YAML 설정 파일 구성
- Docker Compose 서비스 정의
- 헬스체크 및 API 엔드포인트 구현

### 왜 변경했나요?
- 기획 세트 등록 페이지의 상품 검색 자동화 필요
- product_search 모듈과 동일한 아키텍처로 확장성 확보
- 코드 수정 없이 YAML 설정만으로 새 타겟 추가 가능

## 테스트 체크리스트

- [x] Docker Compose 빌드 성공
- [x] 컨테이너 헬스체크 통과
- [x] API 기본 테스트 통과 (POST /scrape)
- [x] 컨테이너 로그 에러 없음
- [x] 실제 쇼핑몰에서 스크래핑 동작 확인
- [x] YAML 설정 검증 (Zod schema)

## 추가 사항
- PORT: 3988 사용 (product_search는 3987)
- 메모리 제한: 4GB (product_search와 동일)
EOF
)"
```

## Verification

After PR creation:

- [ ] PR link is displayed
- [ ] PR appears on GitHub
- [ ] Title follows conventional format
- [ ] Description is complete and clear
- [ ] Base branch is correct (main/develop)

## Integration with Existing Commands

Before creating PR, consider running:

- `/commit` - Complete pre-commit checks and create final commits
- Docker Compose build and health check validation
- Basic API testing with curl
