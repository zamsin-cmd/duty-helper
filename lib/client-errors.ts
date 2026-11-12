// Design Ref: §7 오류 응답 — 서버 응답(또는 통신 실패)을 화면에 보일 안내와 "다시 시도" 여부로 바꾼다.
// Plan SC: 작업 17 — 입력이 비었을 때, AI 키가 없을 때, AI 응답이 늦거나 틀렸을 때 알기 쉬운 안내.
//
// 서버가 정한 오류 모양(lib/api-errors.ts)이면 그 안내 문구를 그대로 쓴다.
// 서버가 정해진 모양으로 답하지 못한 경우(통신 끊김, 배포 환경이 시간 초과로 끊은 504 등)는
// 여기서 정한 안내를 쓴다.

/** 화면에 보일 실패 안내 */
export interface Failure {
  message: string;
  /** "다시 시도" 버튼을 보여 줄까. 기다리면 나아질 수 있는 실패만 true다. */
  retryable: boolean;
}

/** 서버에 닿지 못했을 때 (인터넷 끊김 등) */
export const NETWORK_ERROR = "서버와 통신하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";

/** 화면이 정한 시간 안에 서버가 답하지 않았을 때 */
export const TIMEOUT_ERROR = "응답이 너무 오래 걸립니다. 잠시 뒤에 다시 시도해 주세요.";

/** 서버가 알아볼 수 없는 답을 줬을 때 */
export const UNEXPECTED_ERROR = "서버에서 예상하지 못한 답이 왔습니다. 잠시 뒤에 다시 시도해 주세요.";

/**
 * 화면이 서버를 기다리는 최대 시간(밀리초). 서버는 AI를 최대 60초 기다리고 75초 안에 반드시 답하므로
 * (app/api/schedule/route.ts), 그 뒤에 한 번 더 여유를 둔다. 이 시간이 지나도 답이 없으면
 * "만드는 중…"에서 영영 못 벗어나지 않도록 화면이 직접 포기하고 다시 시도하게 한다.
 */
export const CLIENT_TIMEOUT_MS = 80_000;

/** 기다리면 나아질 수 있는 서버 오류 종류 (lib/api-errors.ts의 ApiErrorCode) */
const RETRYABLE_CODES: ReadonlySet<string> = new Set(["ai_busy", "ai_bad_response"]);

/**
 * 서버가 오류 상태로 답했을 때의 안내를 정한다.
 *
 * - 서버가 정한 오류 모양이면 그 문구를 그대로 쓴다. 다시 시도는 "AI가 바쁨"과 "AI 답이 틀림"일 때만 보인다.
 *   (입력 오류는 고쳐야 하고, AI 키 오류는 관리자가 고쳐야 해서 다시 눌러 봐야 소용없다.)
 * - 모양이 다르면(빈 답, HTML 오류 쪽 등) 안내를 새로 만든다. 서버 쪽 문제(500번대)와
 *   너무 많은 요청(429)은 다시 시도를 보이고, 그 밖의 상태(404 등)는 보이지 않는다.
 */
export function describeFailure(status: number, body: unknown): Failure {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (typeof error?.message === "string") {
    return {
      message: error.message,
      retryable: typeof error.code === "string" && RETRYABLE_CODES.has(error.code),
    };
  }
  return { message: UNEXPECTED_ERROR, retryable: status >= 500 || status === 429 };
}

/** 요청을 보내다 예외가 났을 때(통신 실패, 시간 초과)의 안내를 정한다. 둘 다 다시 시도할 수 있다. */
export function describeThrown(error: unknown): Failure {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { message: TIMEOUT_ERROR, retryable: true };
  }
  return { message: NETWORK_ERROR, retryable: true };
}
