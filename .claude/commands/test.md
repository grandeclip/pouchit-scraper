---
description: 모듈별 Docker Compose 테스트 실행
---

# Module Testing

각 스크래퍼 모듈을 Docker Compose로 빌드하고 테스트합니다.

## product_search 테스트

```bash
cd product_search

# 1. Build & Run
docker-compose up --build -d

# 2. Container Status
docker ps | grep product_search

# 3. Health Check
curl http://localhost:3000/health

# 4. API Test (선택적)
curl -X POST http://localhost:3000/search-products/oliveyoung \
  -H "Content-Type: application/json" \
  -d '{"brand":"라운드랩","productName":"선크림"}'

# 5. Logs Check
docker logs product_search --tail 50

# 6. Cleanup
docker-compose down
```

## product_scanner 테스트

### 배포 환경 테스트

```bash
cd product_scanner

# 1. Build & Run (배포 환경)
make prod
# 또는: docker-compose up --build -d

# 2. Container Status
docker ps | grep product_scanner

# 3. Health Check
curl http://localhost:3100/health

# 4. Custom Test Script (있는 경우)
# 예: Supabase 연결 테스트
docker cp test-supabase.ts product_scanner:/app/
docker exec product_scanner npx tsx test-supabase.ts

# 5. Logs Check
docker logs product_scanner --tail 50

# 6. Cleanup
make down
# 또는: docker-compose down
```

### 개발 환경 테스트

```bash
cd product_scanner

# 1. Build & Run (개발 환경)
make dev
# 또는: docker-compose -f docker-compose.dev.yml up --build

# 2. Container Status
docker ps | grep product_scanner_dev

# 3. Health Check
curl http://localhost:3100/health

# 4. TypeScript Type Check (컨테이너 내)
make type-check

# 5. Test Execution (컨테이너 내)
make test

# 6. Logs Check
make logs

# 7. Hot Reload 테스트
# 로컬에서 파일 수정 후 자동 재시작 확인
make logs-f

# 8. Cleanup
make dev-down
```

## 공통 테스트 절차

### 1. Build & Run

```bash
docker-compose up --build -d
```

### 2. Status Verification

```bash
docker ps
# STATUS가 "healthy" 또는 "Up"인지 확인
```

### 3. Health Check

```bash
curl http://localhost:<PORT>/health
# 응답: {"status":"ok"}
```

### 4. Logs Inspection

```bash
docker logs <container-name> --tail 50
# 에러 메시지 없는지 확인
```

### 5. Cleanup

```bash
docker-compose down
# 또는 전체 정리
docker-compose down -v  # volumes도 함께 삭제
```

## 문제 해결

### Container가 재시작을 반복하는 경우

```bash
docker logs <container-name>
# 로그를 확인하여 오류 원인 파악
```

### Health Check 실패

```bash
docker inspect <container-name> | grep -A 10 Health
# Health check 설정 및 상태 확인
```

### 환경 변수 문제

```bash
docker exec <container-name> env
# 컨테이너 내부 환경 변수 확인
```

### Port 충돌

```bash
lsof -i :<PORT>
# 포트 사용 중인 프로세스 확인
```

## 테스트 체크리스트

모듈 테스트 시 다음 항목들을 확인합니다:

- [ ] Docker Compose 빌드 성공
- [ ] 컨테이너가 "healthy" 상태로 실행
- [ ] Health check 엔드포인트 응답 정상
- [ ] 컨테이너 로그에 에러 없음
- [ ] API 엔드포인트 정상 작동 (해당하는 경우)
- [ ] Custom test script 실행 성공 (있는 경우)

## 환경 설정

각 모듈은 다음 환경 변수가 필요할 수 있습니다:

### product_search

- `PORT`: 서버 포트 (기본값: 3000)
- `NODE_ENV`: 환경 (production/development)

### product_scanner

- `PORT`: 서버 포트 (기본값: 3000, docker-compose: 3989)
- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 서비스 키
- `NODE_ENV`: 환경 (production/development)

환경 변수는 `.env.local` 파일에서 관리됩니다.
