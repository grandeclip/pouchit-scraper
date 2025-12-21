# Redis 데이터 관리

## Heartbeat 기반 자동 재시작

`restarter` 컨테이너가 컨테이너 상태를 모니터링합니다:

- **체크 주기**: 30초마다
- **Timeout**: 60초 (heartbeat TTL)
- **동작**: heartbeat 없으면 해당 컨테이너 재시작

```bash
# Heartbeat 확인
docker exec product_scanner_redis redis-cli GET "heartbeat:worker:oliveyoung"
docker exec product_scanner_redis redis-cli GET "heartbeat:scheduler"
```

---

## Redis 키 현황

### 1. Job Queue

| 키 패턴 | TTL | 용도 |
|---------|-----|------|
| `workflow:queue:platform:{platform}` | Job TTL | Sorted Set (우선순위 큐) |
| `workflow:job:{jobId}` | 1-2시간 (상태별) | Job 데이터 |
| `search:queue` | Job TTL | Search Job 큐 (FIFO) |
| `search:job:{jobId}` | 10분-1시간 | Search Job 데이터 |

#### Job TTL 정책

| 상태 | TTL |
|------|-----|
| PENDING | 1시간 |
| RUNNING | 2시간 |
| COMPLETED | 1시간 |
| FAILED | 1시간 |

### 2. Heartbeat

| 키 패턴 | TTL | 갱신 주기 |
|---------|-----|----------|
| `heartbeat:{serviceName}` | 60초 | 30초마다 |

서비스 목록:

- `heartbeat:worker:oliveyoung`
- `heartbeat:worker:hwahae`
- `heartbeat:worker:zigzag`
- `heartbeat:worker:musinsa`
- `heartbeat:worker:ably`
- `heartbeat:worker:kurly`
- `heartbeat:worker:search`
- `heartbeat:worker:default`
- `heartbeat:worker:alert`
- `heartbeat:scheduler`
- `heartbeat:alert_watcher`

### 3. Scheduler 상태

| 키 패턴 | TTL | 용도 |
|---------|-----|------|
| `scheduler:enabled` | 없음 | 활성화 플래그 |
| `scheduler:status` | 1시간 | 상태 정보 |
| `scheduler:state:{platform}` | 24시간 | 플랫폼별 상태 |
| `scheduler:last_enqueue_at` | 1시간 | 글로벌 쿨다운 |

#### 플랫폼별 상태 조회

```bash
# 올리브영 마지막 실행 시간
docker exec product_scanner_redis redis-cli HGETALL scheduler:state:oliveyoung

# 화해 마지막 실행 시간
docker exec product_scanner_redis redis-cli HGETALL scheduler:state:hwahae

# 모든 플랫폼
for p in oliveyoung hwahae zigzag musinsa ably kurly; do
  echo "=== $p ==="
  docker exec product_scanner_redis redis-cli HGETALL scheduler:state:$p
done
```

### 4. Alert Watcher 상태

| 키 패턴 | TTL | 용도 |
|---------|-----|------|
| `alert_watcher:enabled` | 없음 | 활성화 플래그 |
| `alert_watcher:status` | 1시간 | 상태 정보 |
| `alert_watcher:task:{taskId}:completed_at` | 24시간 | 작업별 완료 시간 |

#### 작업별 완료 시간 조회

```bash
# collabo_banner 마지막 실행
docker exec product_scanner_redis redis-cli GET alert_watcher:task:collabo_banner:completed_at

# votes 마지막 실행
docker exec product_scanner_redis redis-cli GET alert_watcher:task:votes:completed_at
```

### 5. Daily Sync 상태

| 키 패턴 | TTL | 용도 |
|---------|-----|------|
| `daily_sync:enabled` | 없음 | 활성화 플래그 |
| `daily_sync:status` | 24시간 | 상태/설정 |
| `daily_sync:last_run` | 4시간 | 마지막 실행 결과 |

### 6. Lock

| 키 패턴 | TTL | 용도 |
|---------|-----|------|
| `workflow:lock:platform:{platform}` | Lock TTL | 분산 Lock |
| `workflow:running:platform:{platform}` | Lock TTL | 실행 중 Job 정보 |

---

## 누적 위험 분석

### TTL 없는 키 (영구 저장)

| 키 | 위험도 | 분석 |
|----|--------|------|
| `scheduler:enabled` | 낮음 | 1개 키, boolean |
| `alert_watcher:enabled` | 낮음 | 1개 키, boolean |
| `daily_sync:enabled` | 낮음 | 1개 키, boolean |

**결론**: 제어 플래그로 의도적 영구 저장. 메모리 영향 미미.

---

## 디버깅 명령어

```bash
# Redis 전체 키 확인
docker exec product_scanner_redis redis-cli KEYS "*"

# 특정 패턴 키 확인
docker exec product_scanner_redis redis-cli KEYS "workflow:job:*"
docker exec product_scanner_redis redis-cli KEYS "heartbeat:*"

# 키 TTL 확인
docker exec product_scanner_redis redis-cli TTL "workflow:job:{jobId}"

# 메모리 사용량
docker exec product_scanner_redis redis-cli INFO memory
```
