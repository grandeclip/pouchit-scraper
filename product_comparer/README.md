# Product Comparer

**JSONL 비교 모니터링 도구** - product_scanner 결과 파일 시각화 및 비교

## 📌 용도

- product_scanner 워크플로우 실행 결과(JSONL) 비교
- DB 데이터 vs Fetch 데이터 차이점 시각화
- 날짜별 / 플랫폼별 결과 파일 탐색
- 파일 업로드를 통한 임의 JSONL 분석

## 🏗️ 아키텍처

### 기술 스택

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Express + TypeScript
- **스타일**: CSS (순수 CSS, 라이브러리 없음)

### 디렉토리 구조

```text
product_comparer/
├── server/
│   └── index.ts          # Express API 서버
├── src/
│   ├── App.tsx           # 메인 React 컴포넌트
│   ├── App.css           # 스타일시트
│   └── main.tsx          # React 엔트리포인트
├── package.json
├── vite.config.ts        # Vite 설정 (프록시 포함)
└── README.md
```

## 🚀 실행 방법

### 1. 의존성 설치

```bash
cd product_comparer
npm install
```

### 2. 개발 서버 실행

**단일 명령 실행 (권장):**

```bash
npm run dev
# Frontend + Backend 동시 실행
# API: http://localhost:3200
# Web: http://localhost:5173
```

**개별 실행 (선택):**

```bash
# 터미널 1 - 백엔드만
npm run dev:server

# 터미널 2 - 프론트엔드만
npm run dev:gui
```

### 3. 브라우저 접속

```
http://localhost:5173
```

**종료**: `Ctrl+C` 누르면 Frontend + Backend 모두 정상 종료

## 📖 사용법

### 1. 날짜 선택 방식

1. 드롭다운에서 날짜 선택 (예: 2025-11-11)
2. 해당 날짜의 JSONL 파일 목록 확인
3. 플랫폼별로 정렬된 파일 선택
4. 비교 결과 자동 표시

### 2. 파일 업로드 방식

1. "📤 또는 JSONL 파일 업로드" 섹션 클릭
2. 로컬 JSONL 파일 선택
3. 비교 결과 즉시 표시

## 📊 표시 정보

### 메타 정보

- **Job ID**: 워크플로우 실행 ID (UUID7)
- **Platform**: 플랫폼 이름 (hwahae, oliveyoung, musinsa, zigzag, ably)
- **Workflow**: 워크플로우 ID
- **시작/완료 시간**: 작업 시간 정보
- **소요 시간**: 총 실행 시간
- **요약**: 총 개수, 성공/실패, 일치율

### 상품 비교 정보

각 상품별로 다음 필드 비교:

- **상품명**: DB vs Fetch 비교
- **썸네일**: 이미지 URL 및 미리보기
- **정가**: 원가 비교
- **할인가**: 할인가 비교
- **판매상태**: on_sale, sold_out 등

**시각적 표시**:

- ✅ 일치
- ⚠️ 불일치
- 빨간 테두리: 전체 불일치
- 초록 테두리: 전체 일치

## 🔧 API 엔드포인트

### `GET /api/dates`

**설명**: results 디렉토리의 날짜 목록 조회

**응답**:

```json
["2025-11-11", "2025-11-10", "2025-11-07"]
```

### `GET /api/files/:date`

**설명**: 특정 날짜의 JSONL 파일 목록 조회

**파라미터**:

- `date`: 날짜 (YYYY-MM-DD)

**응답**:

```json
[
  {
    "name": "job_hwahae_019a717a-6857-763d-83ca-319dd95acd16.jsonl",
    "platform": "hwahae",
    "size": 5301,
    "timestamp": 123456789,
    "mtime": "2025-11-11T05:54:01.000Z"
  }
]
```

### `GET /api/content/:date/:filename`

**설명**: JSONL 파일 내용 파싱 및 반환

**파라미터**:

- `date`: 날짜
- `filename`: 파일명

**응답**:

```json
{
  "meta": {
    "header": { "job_id": "...", "platform": "hwahae", ... },
    "footer": { "completed_at": "...", "summary": {...} },
    "duration": 10000,
    "incomplete": false
  },
  "products": [
    {
      "product_set_id": "...",
      "url": "...",
      "db": { "product_name": "...", "thumbnail": "...", ... },
      "fetch": { "product_name": "...", "thumbnail": "...", ... },
      "comparison": { "product_name": true, "thumbnail": false, ... },
      "match": false
    }
  ]
}
```

### `POST /api/upload`

**설명**: JSONL 파일 업로드 및 파싱

**Content-Type**: `multipart/form-data`

**Body**:

- `file`: JSONL 파일

**응답**: `/api/content/:date/:filename`와 동일

## 🎨 UI 특징

### 반응형 디자인

- 모바일: 단일 컬럼
- 태블릿/데스크톱: 2컬럼 비교 뷰

### 색상 코드

- **파란색 왼쪽 테두리**: DB 데이터
- **오렌지색 왼쪽 테두리**: Fetch 데이터
- **초록색 카드**: 전체 일치
- **빨간색 카드**: 불일치 항목 존재

## 🔍 주요 기능

### 1. UUID7 타임스탬프 추출

파일명에서 UUID7을 파싱하여 생성 시간 추출

```typescript
const uuidMatch = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4})/);
const hex = uuidMatch[1].replace(/-/g, "").substring(0, 12);
const timestamp = parseInt(hex, 16);
```

### 2. 소요 시간 자동 계산

메타 정보의 started_at과 completed_at 차이 계산

### 3. 불완전 작업 감지

마지막 줄에 footer meta가 없으면 경고 표시

## 📝 개발 노트

### 프록시 설정

Vite 개발 서버는 `/api/*` 요청을 `localhost:3200`으로 프록시:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3200',
      changeOrigin: true,
    },
  },
}
```

### ES Module 이슈 해결

`__dirname` 대신 ES Module 방식 사용:

```typescript
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## 🚨 주의사항

- `npm run dev` 명령으로 Frontend + Backend 자동 실행 (concurrently 사용)
- `../product_scanner/results` 디렉토리 접근 권한 필요
- JSONL 파일 형식: 첫 줄 header meta, 마지막 줄 footer meta
- Ctrl+C로 종료 시 모든 프로세스 정상 종료

## 🎯 향후 개선 사항

- [ ] 다크 모드 지원
- [ ] 필터링 기능 (플랫폼, 일치/불일치)
- [ ] 통계 차트 추가
- [ ] 다중 파일 동시 비교
- [ ] 비교 결과 내보내기 (JSON, CSV)
