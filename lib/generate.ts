// Design Ref: §4.3 AI 호출 방식, §7 서버 API — AI를 부르고, 답을 검사하고, 틀리면 한 번 다시 요청한다.
// Plan SC: 작업 11 — 날짜별 당번자와 설명을 정해진 형식으로 받는다.
//
// 이 파일은 서버 쪽 코드(app/api/...)에서만 불러 쓴다.
// AI 연결(client)은 밖에서 받는다. 그래서 시험에서는 가짜 연결을 넣어 비용 없이 확인할 수 있다.

import OpenAI from "openai";
import { AI_MODEL, AI_TIMEOUT_MS } from "./ai";
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

/** 답 하나를 만드는 데 쓸 수 있는 글자(토큰) 수. gpt-4o-mini의 출력 한도(약 16,000) 안에서 넉넉히 잡는다. */
const MAX_TOKENS = 16_000;

/** 다시 요청하려면 남아 있어야 하는 최소 시간(밀리초). 이보다 적으면 다시 요청하지 않고 "늦다"고 알린다. */
const MIN_RETRY_MS = 10_000;

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
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return new GenerateError("missing_api_key", "AI 키가 올바르지 않습니다");
  }
  if (
    error instanceof OpenAI.APIConnectionError || // 시간 초과 포함
    error instanceof OpenAI.RateLimitError ||
    (error instanceof OpenAI.APIError && typeof error.status === "number" && error.status >= 500)
  ) {
    return new GenerateError("ai_busy", "AI가 바쁘거나 응답이 늦습니다");
  }
  return new GenerateError("ai_bad_response", "AI 호출이 거절되었습니다");
}

/**
 * OpenAI에 알려 주는 답의 모양(JSON 스키마). OpenAI의 엄격 모드는 모든 칸을 꼭 있어야 하는 칸으로 요구해서,
 * "배정 불가 이유"처럼 없을 수 있는 칸은 null을 허용하는 칸으로 둔다. 자세한 검사(글자 수 등)는 받은 뒤 Zod가 한다.
 */
const DRAFT_JSON_SCHEMA = {
  name: "schedule_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["assignments", "descriptions"],
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "name", "unassignableReason"],
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            name: { type: ["string", "null"], description: "당번 이름. 배정 불가면 null" },
            unassignableReason: { type: ["string", "null"], description: "name이 null일 때만 이유, 아니면 null" },
          },
        },
      },
      descriptions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "text"],
          properties: { name: { type: "string" }, text: { type: "string" } },
        },
      },
    },
  },
};

/** 엄격 모드 때문에 들어온 null 이유를 "없음"으로 바꿔 우리 형식에 맞춘다 */
function normalizeDraft(json: unknown): unknown {
  if (typeof json !== "object" || json === null || !Array.isArray((json as { assignments?: unknown }).assignments)) {
    return json;
  }
  const draft = json as { assignments: Record<string, unknown>[] };
  return {
    ...draft,
    assignments: draft.assignments.map((a) =>
      a && typeof a === "object" && a.unassignableReason === null ? { date: a.date, name: a.name } : a,
    ),
  };
}

/** timeoutMs: 이번 시도에서 기다릴 수 있는 시간(전체 한도에서 이미 쓴 시간을 뺀 것) */
async function attemptOnce(
  request: ScheduleRequest,
  client: OpenAI,
  timeoutMs: number,
): Promise<Attempt> {
  let response;
  try {
    response = await client.chat.completions.create(
      {
        model: AI_MODEL,
        max_completion_tokens: MAX_TOKENS,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(request) },
        ],
        response_format: { type: "json_schema", json_schema: DRAFT_JSON_SCHEMA },
      },
      // 남은 시간만큼만 기다리고, SDK가 알아서 다시 보내지 않게 한다 (시간 약속을 지키기 위해)
      { timeout: timeoutMs, maxRetries: 0 },
    );
  } catch (error) {
    // 통신·서버 문제(APIError)는 바로 실패로 알린다.
    if (error instanceof OpenAI.APIError) throw toGenerateError(error);
    return { ok: false, reason: "AI 답을 받는 중 알 수 없는 오류가 났습니다" };
  }

  const choice = response.choices[0];
  if (!choice || choice.message.refusal) return { ok: false, reason: "AI가 답을 거절했습니다" };
  if (choice.finish_reason === "length") return { ok: false, reason: "AI 답이 도중에 잘렸습니다" };
  if (!choice.message.content) return { ok: false, reason: "AI 답을 읽지 못했습니다" };

  // 글을 JSON으로 읽고, 우리 형식(Zod)으로 한 번 더 검사한다.
  let json: unknown;
  try {
    json = JSON.parse(choice.message.content);
  } catch {
    return { ok: false, reason: "AI 답이 정해진 형식과 달랐습니다" };
  }
  const parsed = scheduleDraftSchema.safeParse(normalizeDraft(json));
  if (!parsed.success) return { ok: false, reason: "AI 답이 정해진 형식과 달랐습니다" };

  const problems = checkDraftShape(request, parsed.data);
  if (problems.length > 0) {
    return { ok: false, reason: `AI 답이 요청과 맞지 않습니다: ${problems.slice(0, 3).join(", ")}` };
  }
  return { ok: true, draft: parsed.data };
}

/**
 * AI에게 당번표 초안을 받는다.
 *
 * - 통신·서버 문제(시간 초과, 바쁨, 키 오류)는 바로 GenerateError로 알린다.
 * - 답이 형식에 어긋나면(설명이 50자 초과, 날짜 빠짐 등) AI에 한 번 다시 요청한다.
 *   그래도 틀리면 GenerateError("ai_bad_response")다.
 * - 기다리는 시간은 다시 요청하는 것까지 합쳐 전체 AI_TIMEOUT_MS(60초) 안에 끝난다.
 *   첫 시도가 오래 걸려 다시 요청할 시간(MIN_RETRY_MS)이 남지 않으면, 다시 요청하지 않고
 *   GenerateError("ai_busy")로 알린다.
 */
export async function generateSchedule(
  request: ScheduleRequest,
  client: OpenAI,
): Promise<ScheduleDraft> {
  const deadline = Date.now() + AI_TIMEOUT_MS;
  let lastReason = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (attempt > 1 && remaining < MIN_RETRY_MS) {
      throw new GenerateError("ai_busy", `다시 요청할 시간이 남지 않았습니다 (${lastReason})`);
    }
    const result = await attemptOnce(request, client, remaining);
    if (result.ok) return result.draft;
    lastReason = result.reason;
  }
  throw new GenerateError("ai_bad_response", lastReason);
}
