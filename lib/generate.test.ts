import OpenAI from "openai";
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
  return { client: { chat: { completions: { create: parse } } } as unknown as OpenAI, parse };
}

/** 가짜 OpenAI 답. draft가 null이면 내용이 빈 답, "refusal"은 거절, "max_tokens"는 잘림(length) */
const answer = (draft: ScheduleDraft | null, stop_reason = "end_turn") => ({
  choices: [
    {
      finish_reason: stop_reason === "max_tokens" ? "length" : "stop",
      message: {
        content: draft === null ? "" : JSON.stringify(draft),
        refusal: stop_reason === "refusal" ? "거절합니다" : null,
      },
    },
  ],
});

const apiError = (status: number) =>
  OpenAI.APIError.generate(status, { error: { type: "x", message: "테스트" } }, "테스트", new Headers());

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

  it("정해진 설정으로 부른다: gpt-4o-mini 고정, 지시문, 엄격한 JSON 형식, 대체 모델 없음", async () => {
    const { client, parse } = fakeClient(answer(goodDraft()));
    await generateSchedule(request, client);
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("gpt-4o-mini");
    expect(params.response_format.type).toBe("json_schema");
    expect(params.response_format.json_schema.strict).toBe(true);
    expect(params.messages).toHaveLength(2);
    expect(params.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(params.messages[1].role).toBe("user");
    expect(params.messages[1].content).toContain("2026-12");
    for (const key of ["fallbacks", "betas", "thinking", "reasoning_effort"]) {
      expect(params).not.toHaveProperty(key);
    }
  });

  it("배정 불가 날의 이유가 null로 와도 읽는다 (엄격 모드는 모든 칸을 채워 보낸다)", async () => {
    const withNulls = {
      choices: [
        {
          finish_reason: "stop",
          message: {
            refusal: null,
            content: JSON.stringify({
              assignments: goodDraft().assignments.map((a) => ({ ...a, unassignableReason: null })),
              descriptions: goodDraft().descriptions,
            }),
          },
        },
      ],
    };
    const { client } = fakeClient(withNulls);
    expect(await generateSchedule(request, client)).toEqual(goodDraft());
  });

  it("답이 형식에 어긋나면(읽을 수 없는 글이면) 한 번 다시 요청해서 성공한다", async () => {
    const { client, parse } = fakeClient(
      { choices: [{ finish_reason: "stop", message: { refusal: null, content: "JSON이 아닌 글" } }] },
      answer(goodDraft()),
    );
    expect(await generateSchedule(request, client)).toEqual(goodDraft());
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("두 번 다 어긋나면 ai_bad_response(502)로 알린다", async () => {
    const bad = { choices: [{ finish_reason: "stop", message: { refusal: null, content: "{}" } }] };
    const { client, parse } = fakeClient(bad, bad);
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
    ["시간 초과", new OpenAI.APIConnectionTimeoutError(), "ai_busy"],
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
