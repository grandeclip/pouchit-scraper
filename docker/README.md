# Docker 개발 환경 상세 가이드

Product Scanner 모듈의 Docker 기반 개발/배포 환경 설정 및 사용법 가이드입니다.

## 📋 목차

- [개요](#개요)
- [아키텍처](#아키텍처)
- [개발 환경](#개발-환경)
- [배포 환경](#배포-환경)
- [문제 해결](#문제-해결)
- [FAQ](#faq)

---

## 개요

### 설계 철학

**Volume Mount + Hot Reload (Hybrid Method)**

2025년 업계 표준 Docker 개발 워크플로우를 적용했습니다:

- **개발 속도**: 로컬 IDE에서 편집 → 즉시 컨테이너 반영 → hot reload
- **환경 일치**: 모든 실행이 Docker 컨테이너 내 → 배포 환경과 100% 동일
- **타입 안전**: TypeScript strict mode가 컨테이너 내에서 검증
- **팀 협업**: docker-compose.yml 하나로 모든 팀원 동일 환경

### 핵심 개념

#### node_modules 격리

```yaml
volumes:
  - ./:/app # 소스 코드 마운트
  - /app/node_modules # 컨테이너의 node_modules 격리 (중요!)
```

**왜 필요한가?**

- 로컬 macOS/Windows의 node_modules와 컨테이너 Linux의 node_modules는 다름
- Volume mount 시 로컬 디렉토리가 컨테이너 디렉토리를 덮어씀
- `/app/node_modules`를 별도 볼륨으로 선언하여 격리

---

## 아키텍처

### 파일 구조

```text
product_scanner/
├── docker/                       # Docker 설정 파일 디렉토리
│   ├── Dockerfile                # 배포용 (Multi-stage build)
│   ├── Dockerfile.dev            # 개발용 (Volume mount)
│   └── docker-compose.yml        # 개발 환경 설정
├── .dockerignore                 # 불필요한 파일 제외
├── Makefile                      # Docker 명령어 단축키
└── package.json                  # npm 스크립트
```

### 환경 비교

| 항목             | 개발 환경                       | 배포 환경                   |
| ---------------- | ------------------------------- | --------------------------- |
| **Dockerfile**   | Dockerfile.dev                  | Dockerfile (Multi-stage)    |
| **Compose 파일** | docker-compose.yml              | docker-compose.yml          |
| **Volume Mount** | ✅ Yes (`./:/app`)              | ❌ No                       |
| **Hot Reload**   | ✅ tsx watch                    | ❌ tsx (일반)               |
| **node_modules** | 컨테이너 격리                   | 이미지 내장                 |
| **Dependencies** | dev + production                | production only             |
| **Image Size**   | ~800MB                          | ~600MB (최적화)             |
| **빌드 시간**    | 최초 1회 (이후 volume mount)    | 매번 빌드 (production only) |
| **시작 명령어**  | `npm run dev` (tsx watch)       | `npm start` (tsx)           |
| **포트**         | 3989 (외부) / 3000 (내부)       | 3989 (외부) / 3000 (내부)   |
| **환경 변수**    | `NODE_ENV=development`          | `NODE_ENV=production`       |
| **용도**         | 로컬 개발, 디버깅, 실험         | 배포, 운영 환경, CI/CD      |
| **타입 체크**    | 컨테이너 내 (`make type-check`) | 이미지 빌드 전              |

---

## 개발 환경

### 시작하기

#### 1. 환경 변수 설정

```bash
# 프로젝트 루트에 .env.local 파일 생성
cd /Users/gzu/project/cosmetic/scoob-scraper
cat > .env.local <<EOF
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
SLACK_WEBHOOK_URL=your-slack-webhook
EOF
```

#### 2. 개발 환경 시작

```bash
cd product_scanner

# Makefile 사용 (권장)
make up

# 또는 수동 실행
docker compose -f docker/docker-compose.yml up --build
```

#### 3. 컨테이너 상태 확인

```bash
# 상태 확인
docker ps | grep product_scanner

# 헬스 체크
curl http://localhost:3989/health
```

### 개발 워크플로우

#### 일상적인 개발

```bash
# 1. 개발 환경 시작 (최초 1회만 빌드)
make up

# 2. 로컬에서 코드 수정
#    → 자동으로 tsx watch가 감지하여 재시작 (1-2초 소요)

# 3. 로그 확인 (별도 터미널에서)
make logs-f

# 4. 작업 완료 후 종료
make down
```

#### 타입 체크 (커밋 전 필수)

```bash
# 컨테이너 내에서 타입 체크
make type-check

# 또는 수동
docker compose -f docker/docker-compose.yml exec product_scanner npm run type-check
```

**왜 컨테이너 내에서?**

- 로컬 환경과 컨테이너 환경의 TypeScript 버전이 다를 수 있음
- 컨테이너 = 배포 환경과 100% 동일
- "내 컴퓨터에선 됨" 문제 방지

#### 테스트 실행

```bash
# 컨테이너 내에서 테스트
make test

# 또는 수동
docker compose -f docker/docker-compose.yml exec product_scanner npm test
```

### 디버깅

#### 로그 확인

```bash
# 전체 로그
make logs

# 실시간 로그 (tail -f)
make logs-f

# 수동
docker compose -f docker/docker-compose.yml logs -f product_scanner
```

#### 컨테이너 내부 접속

```bash
# Shell 접속
docker compose -f docker/docker-compose.yml exec product_scanner sh

# 컨테이너 내에서
ls -la /app
npm run type-check
tsx test-validator.ts
```

---

## 배포 환경

### Multi-stage Build

Dockerfile은 2단계 빌드로 최적화되어 있습니다:

```dockerfile
# Stage 1: Builder
FROM playwright AS builder
# - 모든 의존성 설치
# - 소스 코드 복사

# Stage 2: Production
FROM playwright AS production
# - builder에서 node_modules만 복사
# - production dependencies만 포함
# - 최종 이미지 크기 최소화
```

### 배포 환경 실행

```bash
cd product_scanner

# Makefile 사용 (권장)
make prod

# 또는 수동 실행
docker compose up --build -d
```

### 상태 확인

```bash
# 컨테이너 상태
make status
# 또는: docker compose ps

# 헬스 체크
curl http://localhost:3989/health

# 로그 확인
docker compose logs -f product_scanner
```

---

## 문제 해결

### 1. 포트 이미 사용 중

**증상**: `Error: Port 3989 is already in use`

**해결**:

```bash
# 포트 사용 프로세스 확인
lsof -i :3989

# 해당 프로세스 종료
kill -9 <PID>

# 또는 기존 컨테이너 종료
make down
```

### 2. Hot Reload가 작동하지 않음

**증상**: 파일 수정 시 자동 재시작 안됨

**원인**:

- macOS/Windows의 파일 시스템 이벤트가 컨테이너에 전달 안됨

**해결**:

```bash
# Docker Desktop 설정 확인
# Settings → Resources → File sharing → project 디렉토리 추가

# 또는 수동 재시작
make restart
```

### 3. node_modules 충돌

**증상**: `Error: Cannot find module 'xxx'`

**원인**:

- 로컬 node_modules가 컨테이너 node_modules를 덮어씀

**해결**:

```bash
# 전체 정리 후 재시작
make clean
make up

# 또는 수동
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up --build
```

### 4. 타입 체크 실패

**증상**: `make type-check` 실패

**해결**:

```bash
# 로그 확인
make logs

# 컨테이너 내부 확인
docker compose -f docker/docker-compose.yml exec product_scanner sh
npx tsc --noEmit

# tsconfig.json 확인
cat tsconfig.json
```

### 5. 캐시 문제

**증상**: 코드 수정이 반영 안됨

**해결**:

```bash
# Docker 빌드 캐시 무시
docker compose -f docker/docker-compose.yml build --no-cache
docker compose -f docker/docker-compose.yml up

# 또는 전체 이미지 재빌드
make clean
make up
```

---

## FAQ

### Q1. 개발 환경과 배포 환경을 언제 사용하나요?

**A**:

- **개발 환경**: 일상적인 개발, 디버깅, 실험
- **배포 환경**: 배포 전 검증, CI/CD, 운영 환경

### Q2. 왜 Makefile을 사용하나요?

**A**:

- 긴 docker compose 명령어를 단축
- 팀원 간 일관된 명령어 사용
- 실수 방지 (올바른 경로와 설정 보장)

### Q3. Volume mount 대신 이미지에 코드를 포함하면 안되나요?

**A**:

- 개발 환경: Volume mount (빠른 피드백)
- 배포 환경: 이미지에 포함 (보안, 일관성)

### Q4. 타입 체크를 로컬에서 해도 되나요?

**A**:

- 가능하지만 권장하지 않음
- 컨테이너 = 배포 환경과 100% 동일
- 로컬 환경 차이로 인한 문제 방지

### Q5. macOS에서 성능이 느린데요?

**A**:

- Docker Desktop 4.6+ 사용 (VirtioFS 기본)
- Settings → Resources → Advanced → Disk image size 증가
- 불필요한 파일은 .dockerignore에 추가

### Q6. Windows에서 권한 문제가 발생해요

**A**:

```bash
# WSL2 사용 권장
# Docker Compose 파일에 user 설정 추가
user: "${UID}:${GID}"
```

---

## 추가 참고 자료

- [../README.md](../README.md) - 프로젝트 개요 및 사용법
- [../../.claude/CLAUDE.md](../../.claude/CLAUDE.md) - 프로젝트 가이드라인
- [../../.claude/commands/dev.md](../../.claude/commands/dev.md) - 개발 환경 명령어
- [../../.claude/commands/docker.md](../../.claude/commands/docker.md) - Docker 관리 명령어

---

**Last Updated**: 2025-10-29
