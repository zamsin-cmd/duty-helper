// 보안 점검 SEC-001 — 한 사람(IP)이 AI를 너무 자주 부르지 못하게 막는다.
//
// 서버 메모리에 횟수를 적어 두는 간단한 방식이다. Vercel처럼 서버가 여러 개로 나뉘어 돌면
// 서버마다 따로 세기 때문에 "완벽한 차단"은 아니다. 진짜 방어는 OpenAI의 월 지출 한도와
// Vercel Firewall의 횟수 제한(REPORT·CHECK 참고)이고, 이 파일은 그 앞의 보조 장치다.

/** 한 사람이 1분 동안 AI를 부를 수 있는 최대 횟수 */
export const RATE_LIMIT_MAX = 5;
/** 횟수를 세는 시간 길이(밀리초) */
export const RATE_LIMIT_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

/** 요청 헤더에서 접속자 주소를 읽는다. 알 수 없으면 null (로컬 개발 등 — 이때는 제한하지 않는다). */
export function clientIdOf(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

/** 이번 요청을 센다. 한도를 넘었으면 false (이때는 센 횟수에 더하지 않는다). */
export function allowRequest(clientId: string | null, now: number = Date.now()): boolean {
  if (clientId === null) return true;
  const recent = (hits.get(clientId) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(clientId, recent);
    return false;
  }
  recent.push(now);
  hits.set(clientId, recent);
  // 메모리가 계속 늘지 않도록 가끔 오래된 주소를 정리한다
  if (hits.size > 5_000) {
    for (const [id, times] of hits) {
      if (times.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) hits.delete(id);
    }
  }
  return true;
}

/** 시험에서 횟수를 비운다 */
export function resetRateLimit(): void {
  hits.clear();
}
