# ============================================================================
# Stage 1: Builder
# ============================================================================
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS builder

WORKDIR /app

# Node.js 버전 확인
RUN node --version && npm --version

# package.json과 tsconfig.json 복사
COPY package.json package-lock.json tsconfig.json ./

# 의존성 설치 (production only)
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS production

WORKDIR /app

# Builder stage에서 node_modules 복사
COPY --from=builder /app/node_modules ./node_modules

# 필수 파일 복사
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# 소스 코드 복사
COPY server.ts ./
COPY config ./config
COPY core ./core
COPY fetchers ./fetchers
COPY validators ./validators
COPY test-validator.ts ./

# 환경 변수 설정
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=3000

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# 서버 시작
CMD ["npm", "start"]
