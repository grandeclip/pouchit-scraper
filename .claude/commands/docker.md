---
description: "Docker 관리 명령어 (개발/배포 환경 관리)"
---

# `/docker` - Docker 환경 관리

개발 환경과 배포 환경을 관리하는 통합 명령어 가이드입니다.

## 🚀 개발 환경 (Volume Mount + Hot Reload)

### 시작/종료

```bash
# 시작
make up

# 종료
make down

# 재시작
make restart
```

### 상태 확인

```bash
# 컨테이너 상태
make status
# 또는
docker-compose -f docker/docker-compose.yml ps

# 로그 확인
make logs        # 전체 로그
make logs-f      # 실시간 로그 (tail -f)
```

## 🔍 헬스 체크

```bash
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

### 개발 환경 정리

```bash
# 컨테이너 & 이미지 삭제
make clean

# 또는 수동
docker-compose -f docker/docker-compose.yml down -v --rmi all
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
docker-compose -f docker/docker-compose.yml exec product_scanner sh
```

### 특정 명령어 실행

```bash
# 타입 체크
docker-compose -f docker/docker-compose.yml exec product_scanner npm run type-check

# 테스트
docker-compose -f docker/docker-compose.yml exec product_scanner npm test
```

## 📊 환경 정보

| 항목             | 값                          |
| ---------------- | --------------------------- |
| **Dockerfile**   | `docker/Dockerfile.dev`     |
| **Compose 파일** | `docker/docker-compose.yml` |
| **Volume Mount** | ✅ Yes (`./:/app`)          |
| **Hot Reload**   | ✅ tsx watch                |
| **node_modules** | 컨테이너 격리               |
| **포트**         | 3989 (외부) / 3000 (내부)   |
| **시작 명령어**  | `make up`                   |

## 🐛 일반적인 문제 해결

### 1. 포트 이미 사용 중

```bash
# 포트 사용 프로세스 확인
lsof -i :3989

# 컨테이너 종료
make down
```

### 2. 이미지 빌드 실패

```bash
# 캐시 없이 재빌드
docker-compose -f docker/docker-compose.yml build --no-cache
```

### 3. 볼륨 권한 문제

```bash
# 볼륨 삭제 후 재생성
make clean
make up
```

### 4. 컨테이너가 계속 재시작됨

```bash
# 로그 확인
make logs

# 헬스 체크 확인
docker-compose -f docker/docker-compose.yml ps
```

## 📖 추가 참고 자료

- 상세 가이드: `docker/README.md`
- 개발 환경: `/dev` 명령어
- 테스트: `/test` 명령어
- 프로젝트 가이드: `.claude/CLAUDE.md`
