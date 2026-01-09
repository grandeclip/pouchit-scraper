.PHONY: up down restart type-check test logs logs-f status clean prune help

# 기본 타겟: 도움말
.DEFAULT_GOAL := help

# 개발 환경 (Volume Mount + Hot Reload)
up: ## 올리브영 전용 환경 시작 (api + oliveyoung worker + redis)
	@echo "🚀 올리브영 전용 환경 시작 중..."
	docker compose -f docker/docker-compose.yml up --build -d api_server worker_oliveyoung redis

up-full: ## 전체 서비스 시작 (모든 worker 포함)
	@echo "🚀 전체 환경 시작 중..."
	docker compose -f docker/docker-compose.yml --profile full up --build -d

down: ## 개발 환경 종료
	@echo "🛑 개발 환경 종료 중..."
	docker compose -f docker/docker-compose.yml down

restart: ## 개발 환경 재시작
	@echo "🔄 개발 환경 재시작 중..."
	docker compose -f docker/docker-compose.yml restart

restart-all: ## 모든 컨테이너 순차 재시작 (의존성 순서)
	@echo "🔄 순차 재시작 시작..."
	@echo "  Phase 1: Redis"
	docker restart pouchit_redis && sleep 10
	@echo "  Phase 2: API Server"
	docker restart pouchit_api_server && sleep 20
	@echo "  Phase 3: Workers"
	docker restart pouchit_worker_oliveyoung && sleep 15
	@echo "✅ 순차 재시작 완료"

# 유틸리티
type-check: ## TypeScript 타입 체크 (컨테이너 내)
	@echo "🔍 타입 체크 중..."
	docker compose -f docker/docker-compose.yml exec api_server npm run type-check

test: ## 테스트 실행 (컨테이너 내)
	@echo "🧪 테스트 실행 중..."
	docker compose -f docker/docker-compose.yml exec api_server npm test

logs: ## 로그 확인
	docker compose -f docker/docker-compose.yml logs

logs-f: ## 로그 실시간 확인
	docker compose -f docker/docker-compose.yml logs -f

status: ## 컨테이너 상태 확인
	@echo "📊 컨테이너 상태:"
	@docker compose -f docker/docker-compose.yml ps

# 정리
clean: ## 컨테이너 & 이미지 삭제
	@echo "🧹 컨테이너 및 이미지 정리 중..."
	docker compose -f docker/docker-compose.yml down -v --rmi all

prune: ## Docker 시스템 전체 정리 (주의!)
	@echo "⚠️  Docker 시스템 전체 정리 중..."
	docker system prune -af --volumes

help: ## 도움말 출력
	@echo "📖 사용 가능한 명령어:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
