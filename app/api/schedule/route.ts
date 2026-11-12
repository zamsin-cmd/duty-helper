// Design Ref: §7 `POST /api/schedule` — 당번표 초안 만들기.
// Plan SC: 작업 10 (입구·오류 처리) + 작업 11 (AI 당번표 생성).
//
// 이 파일은 서버에서만 실행된다. AI 키(OPENAI_API_KEY)는 여기서만 읽고,
// 응답이나 로그에 내보내지 않는다.

import { createAiClient, readApiKey } from "@/lib/ai";
import { apiError } from "@/lib/api-errors";
import { GenerateError, generateSchedule } from "@/lib/generate";
import { allowRequest, clientIdOf } from "@/lib/rate-limit";
import { scheduleRequestSchema } from "@/lib/schemas";

/**
 * 서버가 이 요청을 처리하도록 허용하는 시간(초). AI는 전체 60초만 기다리므로(lib/ai.ts의 AI_TIMEOUT_MS)
 * 그보다 여유 있게 잡아야 시간 초과 때에도 서버가 직접 "AI가 바쁩니다(503)"로 답할 수 있다.
 * (같은 값이면 배포 환경이 서버보다 먼저 연결을 끊어, 화면이 정해진 오류 안내를 못 받는다.)
 */
export const maxDuration = 75;

/** 요청 본문의 최대 크기(바이트). 직원 100명·한 달 후보를 담아도 이보다 훨씬 작다 (SEC-002). */
const MAX_BODY_BYTES = 200_000;

/** 다른 사이트의 화면에서 몰래 보낸 요청인지 확인한다 (SEC-001). Origin이 있으면 우리 주소와 같아야 한다. */
function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false; // Origin이 없는 요청(서버끼리 호출 등)은 막지 않는다. 횟수 제한이 대신 막는다.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return apiError("forbidden");

  // 1) 요청을 읽는다 (너무 큰 본문은 거절한다)
  let body: unknown;
  try {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return apiError("invalid_input", "요청이 너무 큽니다");
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return apiError("invalid_input", "요청이 너무 큽니다");
    body = JSON.parse(text);
  } catch {
    return apiError("invalid_input", "요청 내용이 올바른 JSON이 아닙니다");
  }

  // 2) Zod로 검사한다
  const parsed = scheduleRequestSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "요청"} — ${issue.message}`)
      .join(" / ");
    return apiError("invalid_input", detail);
  }

  // 3) AI 키가 있는지 확인한다 (값은 읽기만 하고 내보내지 않는다)
  const apiKey = readApiKey();
  if (apiKey === null) {
    return apiError("missing_api_key");
  }

  // 3-1) 한 사람이 너무 자주 부르면 막는다 (AI 비용 보호, SEC-001)
  if (!allowRequest(clientIdOf(request))) {
    return apiError("too_many_requests");
  }

  // 4) AI에게 당번표 초안을 받는다 (답 검사와 한 번 다시 요청은 generateSchedule 안에서 한다)
  try {
    const draft = await generateSchedule(parsed.data, createAiClient(apiKey));
    return Response.json(draft);
  } catch (error) {
    // 서버 기록에는 오류 종류와 이유만 남긴다. 요청 내용(직원 정보)이나 키는 남기지 않는다.
    if (error instanceof GenerateError) {
      // 메시지에는 AI가 쓴 이름이 섞일 수 있어 종류만 남긴다 (SEC-005)
      console.error(`[schedule] ${error.code}`);
      return apiError(error.code);
    }
    console.error("[schedule] 예상하지 못한 오류:", error instanceof Error ? error.name : typeof error);
    return apiError("ai_bad_response");
  }
}
