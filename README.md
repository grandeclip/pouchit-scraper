# Scoob Scraper

Docker 기반 웹 스크래퍼 모듈 모음

## 개요

YAML 설정 기반으로 코드 수정 없이 새로운 스크래퍼를 추가할 수 있는 확장 가능한 웹 스크래핑 시스템입니다.

## 프로젝트 구조

```text
scoob-scraper/
├── product_scanner/   # 상품 검증 스크래퍼
├── product_comparer/  # 검증 결과 비교 GUI
└── README.md
```

## 모듈

### [product_scanner](./product_scanner/)

5개 쇼핑몰 상품 검증 스크래퍼 (DAG 워크플로우 기반)

- **플랫폼**: 화해, 올리브영, 무신사, 지그재그, 에이블리
- **기술**: TypeScript, Playwright, Express, Redis, Supabase, Docker
- **특징**: DAG 워크플로우, 병렬 처리, JSONL 결과 출력

### [product_comparer](./product_comparer/)

검증 결과 비교 GUI 도구

- **기능**: JSONL 파일 시각화, DB vs Fetch 비교, 날짜별 탐색
- **기술**: React 19, TypeScript, Vite, Express
- **특징**: 단일 명령 실행 (concurrently), 페이지네이션, 필터링

## 기술 스택

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Browser**: Playwright
- **Container**: Docker

## 빠른 시작

### product_comparer (비교 GUI)

```bash
cd product_comparer
npm install
npm run dev  # Frontend + Backend 동시 실행
# http://localhost:5173
```

## 아키텍처 특징

- **설정 기반 개발**: YAML 파일로 새 스크래퍼 추가
- **디자인 패턴**: Strategy, Factory, Registry, Template Method
- **SOLID 원칙**: 확장 가능하고 유지보수 쉬운 구조
- **타입 안정성**: TypeScript strict mode

## 문서

각 모듈의 자세한 문서는 해당 디렉토리의 README.md를 참고하세요.

- [product_scanner/README.md](./product_scanner/README.md) - 검증 스크래퍼 아키텍처 및 워크플로우
- [product_comparer/README.md](./product_comparer/README.md) - GUI 도구 사용법 및 API

## 라이선스

Private
