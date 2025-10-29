---
description: "로컬 개발 환경 시작/중지 (Volume Mount + Hot Reload)"
---

# `/dev` - 개발 환경 관리

Docker Volume Mount + Hot Reload 방식으로 개발 환경을 관리합니다.

## 🚀 개발 환경 시작

```bash
# product_scanner 개발 환경 시작
cd product_scanner
make dev

# 또는 수동 실행
docker-compose -f docker-compose.dev.yml up --build
```

**특징:**

- ✅ 로컬 파일 수정 → 자동으로 컨테이너에 반영
- ✅ tsx watch로 hot reload (재빌드 불필요)
- ✅ node_modules 컨테이너 격리 (로컬 환경과 충돌 방지)
- ✅ 타입 체크 컨테이너 내 실행 (환경 100% 일치)

## 🔍 타입 체크 (컨테이너 내)

```bash
make type-check

# 또는
docker-compose -f docker-compose.dev.yml exec product_scanner_dev npm run type-check
```

## 🧪 테스트 실행

```bash
make test

# 또는
docker-compose -f docker-compose.dev.yml exec product_scanner_dev npm test
```

## 📊 로그 확인

```bash
# 전체 로그
make logs

# 실시간 로그 (tail -f)
make logs-f
```

## 🛑 개발 환경 종료

```bash
make dev-down

# 또는
docker-compose -f docker-compose.dev.yml down
```

## 🔄 재시작

```bash
make dev-restart
```

## 📋 개발 워크플로우

```bash
# 1. 개발 환경 시작 (최초 1회 빌드)
make dev

# 2. 로컬에서 코드 수정
#    → 자동으로 tsx watch가 감지하여 재시작

# 3. 타입 체크 (커밋 전 필수)
make type-check

# 4. 테스트 실행
make test

# 5. 작업 완료 후 종료
make dev-down
```

## ⚠️ 주의사항

- **node_modules 격리**: `docker-compose.dev.yml`에서 `/app/node_modules` 볼륨으로 격리됨
- **환경 변수**: `../.env.local` 파일 필요 (Supabase 설정)
- **포트**: 3989번 포트 사용 (http://localhost:3989)
- **Hot Reload**: TypeScript 파일 수정 시 자동 재시작 (1-2초 소요)

## 🐛 문제 해결

### 포트 충돌

```bash
# 사용 중인 포트 확인
lsof -i :3989

# 기존 컨테이너 종료
docker-compose -f docker-compose.dev.yml down
```

### 캐시 문제

```bash
# 캐시 무시하고 재빌드
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up
```

### node_modules 문제

```bash
# 컨테이너 및 볼륨 삭제 후 재시작
make clean
make dev
```
