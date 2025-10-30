---
description: Create a GitHub Pull Request with proper formatting
---

# Pull Request Creation

**CRITICAL**: Be extremely concise. Sacrifice grammar for concision. Output must be scannable, not verbose.

**OUTPUT LANGUAGE**: 한글 (Korean) - All results must be written in Korean.

Create a well-formatted GitHub PR for the current branch.

## Pre-PR Checklist

**참고**: docker-compose 사용

### product_search

```bash
cd product_search
docker-compose up --build -d
docker ps | grep product_search  # healthy 확인
curl http://localhost:3000/health
curl -X POST http://localhost:3000/search-products/oliveyoung \
  -H "Content-Type: application/json" \
  -d '{"brand":"라운드랩","productName":"선크림"}'
docker-compose down
```

### product_scanner

```bash
cd product_scanner
docker-compose up --build -d
docker ps | grep product_scanner  # healthy 확인
curl http://localhost:3989/health
docker cp test-supabase.ts product_scanner:/app/
docker exec product_scanner npx tsx test-supabase.ts  # "✅ 연결 성공!" 확인
docker-compose down
```

## Steps

1. Check branch: `git status && git log --oneline -10 && git diff main...HEAD`
2. Push: `git push -u origin <branch>`
3. Analyze commits → determine type/scope
4. Generate title: `<type>(<scope>): <description>`
5. Create description (Korean format below)
6. Run: `gh pr create --title "..." --body "..." --base main`

## PR Title Format

```text
<type>(<scope>): <description>

Examples:
feat(scraper): Add planning set registration scraper
fix(extractor): Correct product price extraction logic
refactor(config): Migrate YAML schema to v2
```

## PR Description Template (Korean)

```markdown
## 요약

- [변경사항1]
- [변경사항2]

## 변경내용

- 무엇을: [상세설명]
- 왜: [이유]

## 테스트

- [x] Docker Compose 빌드
- [x] 헬스체크
- [x] API 테스트
- [x] 로그 확인

## 추가사항

[특이사항/Breaking changes]
```

## Types & Scopes

**Types**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`

**Scopes**: `scraper`, `config`, `core`, `services`, `extractors`, `navigators`, `docker`, `docs`

## Example

```bash
git push -u origin feature/planning-set-scraper
gh pr create \
  --title "feat(scraper): Add planning set registration scraper" \
  --body "$(cat <<'EOF'
## 요약
- 스크래퍼 모듈 추가
- YAML 기반 구조
- Docker 컨테이너화

## 변경내용
- 무엇을: planning_set/ 모듈, YAML 설정, Docker Compose
- 왜: 기획세트 등록 자동화, 확장성

## 테스트
- [x] Docker Compose 빌드
- [x] 헬스체크
- [x] API 테스트
- [x] 스크래핑 동작

## 추가사항
PORT: 3988, Memory: 4GB
EOF
)"
```

## Verification

- [ ] PR link displayed
- [ ] Title follows format
- [ ] Base branch correct
