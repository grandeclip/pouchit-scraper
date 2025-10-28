# 상품 정보 스크래퍼 서버
# Playwright 최신 버전 기반 Docker 이미지
FROM mcr.microsoft.com/playwright:v1.56.1-noble

# 작업 디렉토리 설정
WORKDIR /app

# Node.js 버전 확인
RUN node --version && npm --version

# package.json과 tsconfig.json 복사
COPY package.json tsconfig.json ./

# 의존성 설치 (npm 사용)
RUN npm install

# 모든 소스 코드 복사
COPY server.ts ./
COPY config ./config
COPY core ./core
COPY services ./services
COPY scrapers ./scrapers
COPY extractors ./extractors
COPY controllers ./controllers
COPY middleware ./middleware

# 환경 변수 설정
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=3100

# 포트 노출
EXPOSE 3100

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3100/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# 서버 시작
CMD ["npm", "start"]
