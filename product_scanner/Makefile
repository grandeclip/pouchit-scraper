.PHONY: dev dev-down dev-restart prod down restart type-check test logs logs-f status clean prune help

# 기본 타겟: 도움말
.DEFAULT_GOAL := help

# 개발 환경 (Volume Mount + Hot Reload)
dev: ## 개발 환경 시작 (Volume mount, hot reload)
	@echo "🚀 개발 환경 시작 중..."
	docker compose -f docker/docker compose.dev.yml up --build -d

dev-down: ## 개발 환경 종료
	@echo "🛑 개발 환경 종료 중..."
	docker compose -f docker/docker compose.dev.yml down

dev-restart: ## 개발 환경 재시작
	@echo "🔄 개발 환경 재시작 중..."
	docker compose -f docker/docker compose.dev.yml restart

# 배포 환경 (Multi-stage Build)
prod: ## 배포 환경 시작 (Multi-stage build, 최적화)
	@echo "📦 배포 환경 시작 중..."
	docker compose -f docker/docker compose.yml up --build -d

down: ## 배포 환경 종료
	@echo "🛑 배포 환경 종료 중..."
	docker compose -f docker/docker compose.yml down

restart: ## 배포 환경 재시작
	@echo "🔄 배포 환경 재시작 중..."
	docker compose -f docker/docker compose.yml restart

# 유틸리티
type-check: ## TypeScript 타입 체크 (컨테이너 내)
	@echo "🔍 타입 체크 중..."
	docker compose -f docker/docker compose.dev.yml exec product_scanner_dev npm run type-check

test: ## 테스트 실행 (컨테이너 내)
	@echo "🧪 테스트 실행 중..."
	docker compose -f docker/docker compose.dev.yml exec product_scanner_dev npm test

logs: ## 로그 확인
	docker compose -f docker/docker compose.dev.yml logs product_scanner_dev

logs-f: ## 로그 실시간 확인
	docker compose -f docker/docker compose.dev.yml logs -f product_scanner_dev

status: ## 컨테이너 상태 확인
	@echo "📊 컨테이너 상태:"
	@docker compose -f docker/docker compose.yml ps

# 정리
clean: ## 컨테이너 & 이미지 삭제
	@echo "🧹 컨테이너 및 이미지 정리 중..."
	docker compose -f docker/docker compose.dev.yml down -v --rmi all
	docker compose -f docker/docker compose.yml down -v --rmi all

prune: ## Docker 시스템 전체 정리 (주의!)
	@echo "⚠️  Docker 시스템 전체 정리 중..."
	docker system prune -af --volumes

help: ## 도움말 출력
	@echo "📖 사용 가능한 명령어:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
