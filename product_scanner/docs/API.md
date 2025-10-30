# Product Scanner API v1 Documentation

## Overview

API v1은 플랫폼별 엔드포인트 구조와 버저닝을 도입한 REST API입니다.

- **Base URL**: `http://localhost:3000`
- **API Version**: `v1`
- **Architecture**: Platform-based Dynamic Routing

## Breaking Changes from v2.0.0

⚠️ **중요**: API 경로가 변경되었습니다.

| 이전 (v2.0.0)              | 변경 (v2.1.0)                                  |
| -------------------------- | ---------------------------------------------- |
| `POST /api/scan/validate`  | `POST /api/v1/platforms/hwahae/scan/validate`  |
| `POST /api/scan/:goodsId`  | `POST /api/v1/platforms/hwahae/scan/:goodsId`  |
| `GET /api/scan/strategies` | `GET /api/v1/platforms/hwahae/scan/strategies` |
| `GET /api/products/*`      | `GET /api/v1/products/*`                       |
| `POST /api/workflows/*`    | `POST /api/v1/workflows/*`                     |

## Authentication

현재 인증 없음 (향후 API Key 기반 인증 추가 예정)

---

## Endpoints

### Health Check

#### `GET /health`

서버 상태 확인

**Response**

```json
{
  "status": "ok",
  "message": "Product Scanner is running",
  "version": "2.1.0",
  "architecture": "API v1 with Platform Routing"
}
```

---

## Platform APIs

### Get Platform List

#### `GET /api/v1/platforms`

지원 플랫폼 목록 조회

**Response**

```json
{
  "platforms": ["hwahae"],
  "count": 1
}
```

---

## Scan APIs (Platform-specific)

플랫폼별 상품 스캔 엔드포인트

### Validate Product

#### `POST /api/v1/platforms/:platform/scan/validate`

CSV 데이터와 API 데이터 비교 검증

**Path Parameters**

- `platform` (string, required): 플랫폼 ID (예: `hwahae`)

**Request Body**

```json
{
  "goodsId": "123456",
  "csvData": {
    "goodsId": "123456",
    "productName": "상품명",
    "thumbnail": "https://...",
    "originalPrice": 30000,
    "discountedPrice": 25000,
    "saleStatus": "판매중"
  },
  "strategyId": "http-api" // Optional
}
```

**Response**

```json
{
  "isMatch": true,
  "csvData": { ... },
  "apiData": { ... },
  "differences": []
}
```

**Status Codes**

- `200 OK`: 검증 성공
- `400 Bad Request`: 필수 파라미터 누락
- `404 Not Found`: 상품 없음
- `500 Internal Server Error`: 서버 오류

---

### Scan Product

#### `POST /api/v1/platforms/:platform/scan/:goodsId`

상품 정보 스캔 (검증 없이)

**Path Parameters**

- `platform` (string, required): 플랫폼 ID
- `goodsId` (string, required): 상품 ID

**Query Parameters**

- `strategyId` (string, optional): 스캔 전략 ID (예: `http-api`, `playwright-detail`)

**Response**

```json
{
  "goodsId": "123456",
  "productName": "상품명",
  "thumbnail": "https://...",
  "originalPrice": 30000,
  "discountedPrice": 25000,
  "saleStatus": "판매중",
  "scrapedAt": "2025-01-15T10:30:00.000Z"
}
```

**Status Codes**

- `200 OK`: 스캔 성공
- `400 Bad Request`: 잘못된 goodsId
- `404 Not Found`: 상품 없음
- `500 Internal Server Error`: 서버 오류

---

### Get Strategies

#### `GET /api/v1/platforms/:platform/scan/strategies`

플랫폼별 사용 가능한 스캔 전략 목록

**Path Parameters**

- `platform` (string, required): 플랫폼 ID

**Response**

```json
{
  "strategies": [
    {
      "id": "http-api",
      "type": "http",
      "priority": 1
    },
    {
      "id": "playwright-detail",
      "type": "playwright",
      "priority": 2
    }
  ]
}
```

---

## Product Search APIs

Supabase 기반 상품 검색 (플랫폼 무관)

### Search Products

#### `GET /api/v1/products/search`

상품 검색

**Query Parameters**

- `query` (string, required): 검색어
- `limit` (number, optional): 결과 개수 (default: 10)

**Response**

```json
{
  "products": [
    {
      "product_set_id": "uuid",
      "goods_name": "상품명",
      "goods_id": "123456",
      "platform": "hwahae"
    }
  ],
  "count": 1
}
```

---

### Get Product by ID

#### `GET /api/v1/products/:productSetId`

UUID로 상품 조회

**Path Parameters**

- `productSetId` (string, required): Product Set UUID

**Response**

```json
{
  "product_set_id": "uuid",
  "goods_name": "상품명",
  "goods_id": "123456",
  "platform": "hwahae"
}
```

---

### Health Check (Products)

#### `GET /api/v1/products/health`

Supabase 연결 상태 확인

**Response**

```json
{
  "status": "ok",
  "message": "Supabase connection is healthy"
}
```

---

## Workflow APIs

DAG 기반 워크플로우 실행

### Execute Workflow

#### `POST /api/v1/workflows/execute`

워크플로우 실행

**Request Body**

```json
{
  "workflowId": "bulk-validation-v1",
  "data": {
    "csvFilePath": "./input.csv"
  }
}
```

**Response**

```json
{
  "jobId": "job-uuid",
  "workflowId": "bulk-validation-v1",
  "status": "queued"
}
```

---

### Get Job Status

#### `GET /api/v1/workflows/jobs/:jobId`

Job 상태 조회

**Path Parameters**

- `jobId` (string, required): Job ID

**Response**

```json
{
  "jobId": "job-uuid",
  "workflowId": "bulk-validation-v1",
  "status": "completed",
  "result": { ... }
}
```

---

### List Workflows

#### `GET /api/v1/workflows`

사용 가능한 워크플로우 목록

**Response**

```json
{
  "workflows": [
    {
      "id": "bulk-validation-v1",
      "name": "Bulk Product Validation"
    }
  ]
}
```

---

### Health Check (Workflows)

#### `GET /api/v1/workflows/health`

워크플로우 시스템 상태 확인

**Response**

```json
{
  "status": "ok",
  "redis": "connected",
  "workers": "running"
}
```

---

## Error Responses

모든 API는 오류 시 다음 형식으로 응답합니다:

```json
{
  "error": "Error message description"
}
```

**Common Status Codes**

- `400 Bad Request`: 잘못된 요청 파라미터
- `404 Not Found`: 리소스 없음
- `500 Internal Server Error`: 서버 내부 오류

---

## Examples

### cURL Examples

#### 플랫폼 목록 조회

```bash
curl http://localhost:3000/api/v1/platforms
```

#### 화해 상품 스캔

```bash
curl -X POST http://localhost:3000/api/v1/platforms/hwahae/scan/123456
```

#### 상품 검증

```bash
curl -X POST http://localhost:3000/api/v1/platforms/hwahae/scan/validate \
  -H "Content-Type: application/json" \
  -d '{
    "goodsId": "123456",
    "csvData": {
      "goodsId": "123456",
      "productName": "상품명",
      "thumbnail": "https://...",
      "originalPrice": 30000,
      "discountedPrice": 25000,
      "saleStatus": "판매중"
    }
  }'
```

---

## Version History

### v2.1.0 (2025-01-15)

- ✅ API 버저닝 도입 (`/api/v1`)
- ✅ 플랫폼별 엔드포인트 분리
- ✅ 동적 플랫폼 라우팅 (YAML 기반)
- ⚠️ Breaking Change: 모든 엔드포인트 경로 변경

### v2.0.0

- Strategy Pattern 기반 다중 전략 지원
- Supabase 연동
- DAG 기반 워크플로우

---

## Future Roadmap

- [ ] API Key 기반 인증
- [ ] Rate Limiting
- [ ] API v2 (GraphQL 고려)
- [ ] 새 플랫폼 추가 (olive, coupang 등)
