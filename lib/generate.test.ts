import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleEmployees, sampleInput } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { buildScheduleRequest } from "./candidates";
import { GenerateError, checkDraftShape, generateSchedule } from "./generate";
import { SYSTEM_PROMPT } from "./prompt";
import type { ScheduleRequest } from "./schemas";
import type { ScheduleDraft } from "./types";

const request: ScheduleRequest = buildScheduleRequest(sampleInput);

/** 규칙을 지킨 정답지 당번표와 설명 (숫자·날짜 없는 설명) */
const goodDraft = (): ScheduleDraft => ({
  assignments: sampleValidSchedule.map(({ date, name }) => ({ date, name })),
  descriptions: sampleEmployees.map((e) => ({ name: e.name, text: "고르게 나누어 배정되었습니다" })),
});

/** 가짜 AI 연결. 호출은 mock 하나로 모아 몇 번 불렀는지 센다. */
function fakeClient(...results: unknown[]) {
  const parse = vi.fn();
  for (const result of results) {
    if (result instanceof Error) parse.mockRejectedValueOnce(result);
    else parse.mockResolvedValueOnce(result);
  }
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

const answer = (draft: ScheduleDraft | null, stop_reason = "end_turn") => ({
  stop_reason,
  parsed_output: draft,
});

const apiError = (status: number) =>
  Anthropic.APIError.generate(status, { error: { type: "x", message: "테스트" } }, "테스트", new Headers());

afterEach(() => {
  vi.restoreAllMocks();
});

// 작업 11: 답의 모양 확인
describe("답의 모양 확인 (checkDraftShape)", () => {
  it("정답지는 문제가 없다", () => {
    expect(checkDraftShape(request, goodDraft())).toEqual([]);
  });

  it("근무일이 아닌 날짜, 같은 날짜 두 번, 빠진 날짜를 알아낸다", () => {
    const draft = goodDraft();
    draft.assignments.push({ date: "2026-12-05", name: "김OO" }); // 토요일
    draft.assignments.push({ date: "2026-12-01", name: "이OO" }); // 중복
    draft.assignments = draft.assignments.filter((a) => a.date !== "2026-12-03"); // 빠짐
    const problems = checkDraftShape(request, draft);
    expect(problems).toContain("근무일이 아닌 날짜: 2026-12-05");
    expect(problems).toContain("같은 날짜가 두 번: 2026-12-01");
    expect(problems).toContain("빠진 날짜: 2026-12-03");
  });

  it("명단에 없는 이름을 알아낸다", () => {
    const draft = goodDraft();
    draft.assignments[0] = { date: "2026-12-01", name: "노OO" };
    expect(checkDraftShape(request, draft)).toContain("명단에 없는 이름: 노OO");
  });

  it("이름이 없는 날(배정 불가)은 문제가 아니다", () => {
    const draft = goodDraft();
    draft.assignments[2] = { date: "2026-12-03", name: null, unassignableReason: "후보가 없습니다" };
    expect(checkDraftShape(request, draft)).toEqual([]);
  });

  it("미리 배정 불가로 정한 날짜에 이름을 쓰면 문제다", () => {
    const withUnassignable: ScheduleRequest = {
      ...request,
      unassignable: [{ date: "2026-12-03", reason: "후보 없음" }],
    };
    expect(checkDraftShape(withUnassignable, goodDraft())).toContain(
      "배정 불가 날짜에 이름이 있음: 2026-12-03",
    );
  });

  it("고정 배정을 바꾸면 문제다", () => {
    const withFixed: ScheduleRequest = {
      ...request,
      fixedAssignments: [{ date: "2026-12-01", name: "이OO" }],
    };
    expect(checkDraftShape(withFixed, goodDraft())).toContain("고정된 배정이 바뀜: 2026-12-01");
  });
});

describe("AI 호출 (generateSchedule)", () => {
  it("올바른 답이 오면 그대로 돌려주고, 한 번만 부른다", async () => {
    const { client, parse } = fakeClient(answer(goodDraft()));
    const draft = await generateSchedule(request, client);
    expect(draft).toEqual(goodDraft());
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("DESIGN §4.3의 설정으로 부른다: 모델·생각 깊이·지시문, 대체 모델 없음", async () => {
    const { client, parse } = fakeClient(answer(goodDraft()));
    await generateSchedule(request, client);
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.effort).toBe("high");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.system).toBe(SYSTEM_PROMPT);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(params.messages[0].content).toContain("2026-12");
    // 합의한 대로: 대체 모델(fallbacks)을 쓰지 않고, 쓸 수 없는 값(temperature, 생각 끄기)도 보내지 않는다
    for (const key of ["fallbacks", "betas", "temperature", "top_p", "thinking"]) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it("답이 형식에 어긋나면(SDK가 오류를 던지면) 한 번 다시 요청해서 성공한다", async () => {
    const { client, parse } = fakeClient(
      new Error("Failed to parse structured output: 설명이 50자를 넘습니다"),
      answer(goodDraft()),
    );
    expect(await generateSchedule(request, client)).toEqual(goodDraft());
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("두 번 다 어긋나면 ai_bad_response(502)로 알린다", async () => {
    const { client, parse } = fakeClient(new Error("틀림"), new Error("또 틀림"));
    const error = await generateSchedule(request, client).catch((e) => e);
    expect(error).toBeInstanceOf(GenerateError);
    expect(error.code).toBe("ai_bad_response");
    expect(parse).toHaveBeenCalledTimes(2); // 무한 반복하지 않는다
  });

  it("거절·잘림·읽지 못함·요청과 안 맞는 답도 한 번 다시 요청한다", async () => {
    const missingDate = goodDraft();
    missingDate.assignments.pop();
    for (const bad of [
      answer(null, "refusal"),
      answer(goodDraft(), "max_tokens"),
      answer(null),
      answer(missingDate),
    ]) {
      const { client, parse } = fakeClient(bad, answer(goodDraft()));
      expect(await generateSchedule(request, client)).toEqual(goodDraft());
      expect(parse).toHaveBeenCalledTimes(2);
    }
  });

  it("다시 요청해도 요청과 안 맞으면 어떤 점이 문제였는지 담아 알린다", async () => {
    const missingDate = goodDraft();
    missingDate.assignments.pop();
    const { client } = fakeClient(answer(missingDate), answer(missingDate));
    const error = await generateSchedule(request, client).catch((e) => e);
    expect(error.code).toBe("ai_bad_response");
    expect(error.message).toContain("빠진 날짜");
  });
});

describe("통신·서버 문제는 다시 요청하지 않고 바로 알린다", () => {
  const cases: [string, Error, string][] = [
    ["시간 초과", new Anthropic.APIConnectionTimeoutError(), "ai_busy"],
    ["너무 많은 요청(429)", apiError(429), "ai_busy"],
    ["AI 서버 오류(500)", apiError(500), "ai_busy"],
    ["과부하(529)", apiError(529), "ai_busy"],
    ["키가 올바르지 않음(401)", apiError(401), "missing_api_key"],
    ["권한 없음(403)", apiError(403), "missing_api_key"],
    ["요청이 거절됨(400)", apiError(400), "ai_bad_response"],
  ];

  for (const [label, failure, code] of cases) {
    it(`${label} → ${code}`, async () => {
      const { client, parse } = fakeClient(failure);
      const error = await generateSchedule(request, client).catch((e) => e);
      expect(error).toBeInstanceOf(GenerateError);
      expect(error.code).toBe(code);
      expect(parse).toHaveBeenCalledTimes(1);
    });
  }
});
