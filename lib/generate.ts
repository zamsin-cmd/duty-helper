// Design Ref: §4.3 AI 호출 방식, §7 서버 API — AI를 부르고, 답을 검사하고, 틀리면 한 번 다시 요청한다.
// Plan SC: 작업 11 — 날짜별 당번자와 설명을 정해진 형식으로 받는다.
//
// 이 파일은 서버 쪽 코드(app/api/...)에서만 불러 쓴다.
// AI 연결(client)은 밖에서 받는다. 그래서 시험에서는 가짜 연결을 넣어 비용 없이 확인할 수 있다.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_EFFORT, AI_MODEL } from "./ai";
import type { ApiErrorCode } from "./api-errors";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { scheduleDraftSchema, type ScheduleRequest } from "./schemas";
import type { ScheduleDraft } from "./types";

/** AI 답을 받는 데 실패했을 때. code가 화면에 보일 오류 종류가 된다. */
export class GenerateError extends Error {
  constructor(
    readonly code: Extract<ApiErrorCode, "missing_api_key" | "ai_busy" | "ai_bad_response">,
    message: string,
  ) {
    super(message);
    this.name = "GenerateError";
  }
}

/** AI 답이 형식 때문에 틀렸을 때 다시 요청하는 최대 횟수를 포함한 전체 시도 횟수 (처음 1번 + 다시 1번) */
const MAX_ATTEMPTS = 2;

/** 답 하나를 만드는 데 쓸 수 있는 글자(토큰) 수. 생각하는 데 쓰는 양도 포함이라 넉넉히 잡는다. */
const MAX_TOKENS = 16_000;

/**
 * AI 답이 요청과 맞는 모양인지 확인한다. 문제가 없으면 빈 목록.
 * 규칙 위반(휴가일 배정 등)은 여기서 보지 않는다. 그건 화면에서 규칙 검사기(lib/rules.ts)가 찾아 알린다.
 * 여기서는 "당번표로 쓸 수 없는 답"만 걸러낸다: 없는 날짜·이름, 중복·빠진 날짜, 배정 불가 날짜에 이름, 고정 배정 변경.
 */
export function checkDraftShape(request: ScheduleRequest, draft: ScheduleDraft): string[] {
  const problems: string[] = [];
  const weekdays = new Set(request.weekdays);
  const names = new Set(request.employees.map((employee) => employee.name));
  const unassignable = new Set(request.unassignable.map((item) => item.date));
  const fixed = new Map((request.fixedAssignments ?? []).map((item) => [item.date, item.name]));
  const seen = new Set<string>();

  for (const assignment of draft.assignments) {
    const { date, name } = assignment;
    if (!weekdays.has(date)) {
      problems.push(`근무일이 아닌 날짜: ${date}`);
      continue;
    }
    if (seen.has(date)) problems.push(`같은 날짜가 두 번: ${date}`);
    seen.add(date);
    if (name !== null && !names.has(name)) problems.push(`명단에 없는 이름: ${name}`);
    if (unassignable.has(date) && name !== null) {
      problems.push(`배정 불가 날짜에 이름이 있음: ${date}`);
    }
    if (fixed.has(date) && fixed.get(date) !== name) {
      problems.push(`고정된 배정이 바뀜: ${date}`);
    }
  }
  for (const date of request.weekdays) {
    if (!seen.has(date)) problems.push(`빠진 날짜: ${date}`);
  }
  return problems;
}

/** 한 번의 시도 결과: 성공한 답, 또는 다시 시도할 수 있는 실패 */
type Attempt = { ok: true; draft: ScheduleDraft } | { ok: false; reason: string };

/** AI 호출 자체가 실패했을 때(통신·서버 문제)를 화면용 오류로 바꾼다. 다시 요청해도 소용없는 경우다. */
function toGenerateError(error: unknown): GenerateError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new GenerateError("missing_api_key", "AI 키가 올바르지 않습니다");
  }
  if (
    error instanceof Anthropic.APIConnectionError || // 시간 초과 포함
    error instanceof Anthropic.RateLimitError ||
    (error instanceof Anthropic.APIError && typeof error.status === "number" && error.status >= 500)
  ) {
    return new GenerateError("ai_busy", "AI가 바쁘거나 응답이 늦습니다");
  }
  return new GenerateError("ai_bad_response", "AI 호출이 거절되었습니다");
}

async function attemptOnce(request: ScheduleRequest, client: Anthropic): Promise<Attempt> {
  let response;
  try {
    response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(request) }],
      output_config: { effort: AI_EFFORT, format: zodOutputFormat(scheduleDraftSchema) },
    });
  } catch (error) {
    // 통신·서버 문제(APIError)는 바로 실패로 알리고, 그 밖의 오류는 "답 형식이 틀림"으로 본다.
    // (SDK는 답이 우리 형식에 어긋나면 APIError가 아닌 오류를 던진다.)
    if (error instanceof Anthropic.APIError) throw toGenerateError(error);
    return { ok: false, reason: "AI 답이 정해진 형식과 달랐습니다" };
  }

  if (response.stop_reason === "refusal") return { ok: false, reason: "AI가 답을 거절했습니다" };
  if (response.stop_reason === "max_tokens") return { ok: false, reason: "AI 답이 도중에 잘렸습니다" };
  if (response.parsed_output === null) return { ok: false, reason: "AI 답을 읽지 못했습니다" };

  const problems = checkDraftShape(request, response.parsed_output);
  if (problems.length > 0) {
    return { ok: false, reason: `AI 답이 요청과 맞지 않습니다: ${problems.slice(0, 3).join(", ")}` };
  }
  return { ok: true, draft: response.parsed_output };
}

/**
 * AI에게 당번표 초안을 받는다.
 *
 * - 통신·서버 문제(시간 초과, 바쁨, 키 오류)는 바로 GenerateError로 알린다.
 * - 답이 형식에 어긋나면(설명이 50자 초과, 날짜 빠짐 등) AI에 한 번 다시 요청한다.
 *   그래도 틀리면 GenerateError("ai_bad_response")다.
 */
export async function generateSchedule(
  request: ScheduleRequest,
  client: Anthropic,
): Promise<ScheduleDraft> {
  let lastReason = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await attemptOnce(request, client);
    if (result.ok) return result.draft;
    lastReason = result.reason;
  }
  throw new GenerateError("ai_bad_response", lastReason);
}
