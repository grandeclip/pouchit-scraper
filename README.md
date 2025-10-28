# Scoob Scraper

Docker 기반 웹 스크래퍼 모듈 모음

## 개요

YAML 설정 기반으로 코드 수정 없이 새로운 스크래퍼를 추가할 수 있는 확장 가능한 웹 스크래핑 시스템입니다.

## 프로젝트 구조

```text
scoob-scraper/
├── product_search/    # 상품 검색 스크래퍼 (완성)
└── README.md
```

## 스크래퍼 모듈

### [product_search](./product_search/)

쇼핑몰별 상품 검색 스크래퍼 서버

- **지원 쇼핑몰**: 올리브영, 무신사, 지그재그, 에이블리, 컬리, 화해
- **기술 스택**: TypeScript, Playwright, Express, Docker
- **특징**: YAML 설정만으로 새 쇼핑몰 추가 가능

## 기술 스택

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Browser**: Playwright
- **Container**: Docker

## 빠른 시작

### 상품 검색 스크래퍼 실행

```bash
cd product_search
npm install
npm start
```

### Docker로 실행

```bash
cd product_search
docker-compose up -d
```

### CLI 사용 예시

```bash
cd product_search
npx tsx product-search-cli.ts oliveyoung "라운드랩" "선크림"
```

## 아키텍처 특징

- **설정 기반 개발**: YAML 파일로 새 스크래퍼 추가
- **디자인 패턴**: Strategy, Factory, Registry, Template Method
- **SOLID 원칙**: 확장 가능하고 유지보수 쉬운 구조
- **타입 안정성**: TypeScript strict mode

## 문서

각 모듈의 자세한 문서는 해당 디렉토리의 README.md를 참고하세요.

- [product_search/README.md](./product_search/README.md)

## 라이선스

Private
