// Design Ref: §7 오류 응답 — 서버 API가 돌려주는 오류의 모양과 화면에 보일 안내 문구.
// Plan SC: 작업 10 / 작업 17(오류 처리)의 바탕.
//
// 오류 문구에는 비밀 값(API 키 등)을 절대 넣지 않는다.

/** 오류의 종류 */
export type ApiErrorCode =
  | "invalid_input" // 입력이 비었거나 형식이 틀림 → 400
  | "missing_api_key" // .env에 AI 키가 없음 → 500
  | "ai_bad_response" // AI 답의 형식이 틀림 → 502
  | "forbidden" // 다른 사이트에서 보낸 요청 → 403
  | "too_many_requests" // 너무 자주 요청함 → 429
  | "ai_busy"; // AI가 바쁘거나 60초 안에 응답이 없음 → 503

/** 화면이 받는 오류 응답의 모양 */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

const STATUS: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  missing_api_key: 500,
  ai_bad_response: 502,
  ai_busy: 503,
  forbidden: 403,
  too_many_requests: 429,
};

/** 오류 종류별 안내 문구 (DESIGN §7 표). invalid_input은 어느 항목이 문제인지 뒤에 붙인다. */
const MESSAGES: Record<Exclude<ApiErrorCode, "invalid_input">, string> = {
  missing_api_key: "AI 키가 설정되지 않았습니다. 관리자에게 알려 주세요.",
  ai_bad_response: "AI 답을 읽지 못했습니다. 다시 시도해 주세요.",
  ai_busy: "AI가 잠시 바쁩니다. 다시 시도해 주세요.",
  forbidden: "허용되지 않은 요청입니다.",
  too_many_requests: "요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.",
};

/** 오류 종류에 맞는 HTTP 상태 코드와 안내 문구로 응답을 만든다. */
export function apiError(code: ApiErrorCode, detail?: string): Response {
  const message =
    code === "invalid_input"
      ? `입력을 확인해 주세요${detail ? `: ${detail}` : ""}`
      : MESSAGES[code];
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status: STATUS[code] });
}
