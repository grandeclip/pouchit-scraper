/**
 * Browser Launch Arguments
 *
 * SOLID 원칙:
 * - SRP: Browser 실행 인자 관리만 담당
 * - OCP: 카테고리별 확장 가능
 *
 * 목적:
 * - Chrome 플래그 중복 제거
 * - 카테고리별 플래그 조합 가능
 * - 메모리 최적화 및 Stealth 설정 분리
 */

/**
 * Browser Arguments Categories
 */
export const BROWSER_ARGS = {
  /**
   * 메모리 최적화 플래그
   * - /dev/shm 사용 최소화
   * - GPU 비활성화
   * - Zygote 프로세스 비활성화
   * - 확장 프로그램 및 백그라운드 네트워킹 비활성화
   */
  MEMORY_OPTIMIZED: [
    "--disable-dev-shm-usage", // /dev/shm 사용 최소화 (메모리 절약)
    "--disable-gpu", // GPU 비활성화 (메모리 절약)
    "--disable-software-rasterizer", // 소프트웨어 래스터라이저 비활성화
    "--disable-extensions", // 확장 프로그램 비활성화
    "--disable-background-networking", // 백그라운드 네트워킹 비활성화
    "--disable-default-apps", // 기본 앱 비활성화
    "--no-first-run", // 첫 실행 설정 스킵
    "--no-zygote", // Zygote 프로세스 비활성화 (메모리 절약)
  ],

  /**
   * Stealth 플래그 (봇 탐지 우회)
   * - 자동화 제어 표시 제거
   */
  STEALTH: ["--disable-blink-features=AutomationControlled"],

  /**
   * Sandbox 플래그 (Docker 환경)
   * - Docker 환경에서 필수
   */
  SANDBOX: ["--no-sandbox", "--disable-setuid-sandbox"],

  /**
   * 기본 조합 (Docker + Memory + Stealth)
   */
  get DEFAULT() {
    return [...this.SANDBOX, ...this.MEMORY_OPTIMIZED, ...this.STEALTH];
  },

  /**
   * 로컬 개발 조합 (Memory + Stealth)
   */
  get LOCAL_DEV() {
    return [...this.MEMORY_OPTIMIZED, ...this.STEALTH];
  },
} as const;
