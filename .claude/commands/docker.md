---
description: "Docker 관리 명령어 (개발/배포 환경 관리)"
---

# `/docker` - Docker 환경 관리

개발 환경과 배포 환경을 관리하는 통합 명령어 가이드입니다.

## 🚀 개발 환경 (Volume Mount + Hot Reload)

### 시작/종료

```bash
cd product_scanner

# 시작
make dev

# 종료
make dev-down

# 재시작
make dev-restart
```

### 상태 확인

```bash
# 컨테이너 상태
make status
# 또는
docker-compose -f docker-compose.dev.yml ps

# 로그 확인
make logs        # 전체 로그
make logs-f      # 실시간 로그 (tail -f)
```

## 📦 배포 환경 (Multi-stage Build)

### 시작/종료

```bash
cd product_scanner

# 시작 (백그라운드)
make prod

# 종료
make down

# 재시작
make restart
```

### 상태 확인

```bash
# 컨테이너 상태
docker-compose ps

# 로그 확인
docker-compose logs product_scanner

# 실시간 로그
docker-compose logs -f product_scanner
```

## 🔍 헬스 체크

```bash
# 개발 환경
curl http://localhost:3989/health

# 배포 환경
curl http://localhost:3989/health
```

**응답 예시:**

```json
{
  "status": "ok",
  "timestamp": "2025-10-29T..."
}
```

## 🧹 정리

### 개발/배포 환경 정리

```bash
# 컨테이너 & 이미지 삭제
make clean

# 또는 수동
docker-compose -f docker-compose.dev.yml down -v --rmi all
docker-compose down -v --rmi all
```

### Docker 시스템 전체 정리 (⚠️ 주의)

```bash
# 사용하지 않는 모든 리소스 삭제
make prune

# 또는
docker system prune -af --volumes
```

## 🔧 유틸리티

### 컨테이너 내부 접속

```bash
# 개발 환경
docker-compose -f docker-compose.dev.yml exec product_scanner_dev sh

# 배포 환경
docker-compose exec product_scanner sh
```

### 특정 명령어 실행

```bash
# 개발 환경에서 타입 체크
docker-compose -f docker-compose.dev.yml exec product_scanner_dev npm run type-check

# 배포 환경에서 테스트
docker-compose exec product_scanner npm test
```

## 📊 환경 비교

| 항목             | 개발 환경                    | 배포 환경                   |
| ---------------- | ---------------------------- | --------------------------- |
| **Dockerfile**   | `Dockerfile.dev`             | `Dockerfile` (Multi-stage)  |
| **Compose 파일** | `docker-compose.dev.yml`     | `docker-compose.yml`        |
| **Volume Mount** | ✅ Yes (`./:/app`)           | ❌ No                       |
| **Hot Reload**   | ✅ tsx watch                 | ❌ tsx (일반)               |
| **node_modules** | 컨테이너 격리                | 이미지 내장                 |
| **포트**         | 3989 (외부) / 3000 (내부)    | 3989 (외부) / 3000 (내부)   |
| **Image Size**   | ~800MB                       | ~600MB (최적화)             |
| **시작 명령어**  | `make dev`                   | `make prod`                 |
| **빌드 시간**    | 최초 1회 (이후 volume mount) | 매번 빌드 (production only) |
| **용도**         | 로컬 개발, 디버깅            | 배포, 운영 환경             |

## 🐛 일반적인 문제 해결

### 1. 포트 이미 사용 중

```bash
# 포트 사용 프로세스 확인
lsof -i :3989

# 컨테이너 종료
make dev-down
make down
```

### 2. 이미지 빌드 실패

```bash
# 캐시 없이 재빌드
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose build --no-cache
```

### 3. 볼륨 권한 문제

```bash
# 볼륨 삭제 후 재생성
make clean
make dev
```

### 4. 컨테이너가 계속 재시작됨

```bash
# 로그 확인
make logs

# 헬스 체크 확인
docker-compose ps
```

## 📖 추가 참고 자료

- 상세 가이드: `product_scanner/docker/README.md`
- 개발 환경: `/dev` 명령어
- 테스트: `/test` 명령어
- 프로젝트 가이드: `.claude/CLAUDE.md`
