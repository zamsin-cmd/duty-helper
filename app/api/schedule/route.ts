// Design Ref: §7 `POST /api/schedule` — 당번표 초안 만들기.
// Plan SC: 작업 10 (입구·오류 처리) + 작업 11 (AI 당번표 생성).
//
// 이 파일은 서버에서만 실행된다. AI 키(ANTHROPIC_API_KEY)는 여기서만 읽고,
// 응답이나 로그에 내보내지 않는다.

import { createAiClient, readApiKey } from "@/lib/ai";
import { apiError } from "@/lib/api-errors";
import { GenerateError, generateSchedule } from "@/lib/generate";
import { scheduleRequestSchema } from "@/lib/schemas";

/**
 * 서버가 이 요청을 처리하도록 허용하는 시간(초). AI는 전체 60초만 기다리므로(lib/ai.ts의 AI_TIMEOUT_MS)
 * 그보다 여유 있게 잡아야 시간 초과 때에도 서버가 직접 "AI가 바쁩니다(503)"로 답할 수 있다.
 * (같은 값이면 배포 환경이 서버보다 먼저 연결을 끊어, 화면이 정해진 오류 안내를 못 받는다.)
 */
export const maxDuration = 75;

export async function POST(request: Request): Promise<Response> {
  // 1) 요청을 읽는다
  let body: unknown;
  try {
    body = await request.json();
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

  // 4) AI에게 당번표 초안을 받는다 (답 검사와 한 번 다시 요청은 generateSchedule 안에서 한다)
  try {
    const draft = await generateSchedule(parsed.data, createAiClient(apiKey));
    return Response.json(draft);
  } catch (error) {
    // 서버 기록에는 오류 종류와 이유만 남긴다. 요청 내용(직원 정보)이나 키는 남기지 않는다.
    if (error instanceof GenerateError) {
      console.error(`[schedule] ${error.code}: ${error.message}`);
      return apiError(error.code);
    }
    console.error("[schedule] 예상하지 못한 오류:", error instanceof Error ? error.name : typeof error);
    return apiError("ai_bad_response");
  }
}
