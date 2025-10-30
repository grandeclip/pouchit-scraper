/**
 * Express Request 타입 확장
 *
 * Request 객체에 커스텀 속성 추가:
 * - id: Request ID (UUID)
 * - log: Request별 로거 인스턴스
 */

import { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      /**
       * Request ID (UUID v4)
       * requestLogger 미들웨어에서 자동 생성
       */
      id?: string;

      /**
       * Request 전용 로거
       * request_id, method, path 컨텍스트 포함
       */
      log?: Logger;
    }
  }
}
