import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleEmployees, sampleInput } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { buildScheduleRequest } from "./candidates";
import { GenerateError, generateSchedule } from "./generate";
import type { ScheduleDraft } from "./types";

// 작업 17: AI를 기다리는 시간은 다시 요청하는 것까지 합쳐 전체 60초 안에 끝난다.
const request = buildScheduleRequest(sampleInput);

const goodDraft = (): ScheduleDraft => ({
  assignments: sampleValidSchedule.map(({ date, name }) => ({ date, name })),
  descriptions: sampleEmployees.map((e) => ({ name: e.name, text: "고르게 배정되었습니다" })),
});

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

afterEach(() => {
  vi.restoreAllMocks();
});

/** 시계를 가짜로 바꾸고, parse 호출마다 정해진 시간이 흐르게 하는 가짜 AI 연결 */
function clockedClient(steps: { elapsedMs: number; result: unknown }[]) {
  let now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const parse = vi.fn();
  for (const step of steps) {
    parse.mockImplementationOnce(async () => {
      now += step.elapsedMs;
      return step.result;
    });
  }
  return { client: { chat: { completions: { create: parse } } } as unknown as OpenAI, parse };
}

describe("시간 예산 (generateSchedule)", () => {
  it("첫 시도에는 전체 한도 60초를 기다릴 수 있고, SDK 자동 재시도는 끈다", async () => {
    const { client, parse } = clockedClient([{ elapsedMs: 5_000, result: answer(goodDraft()) }]);
    await generateSchedule(request, client);
    const options = parse.mock.calls[0][1];
    expect(options).toEqual({ timeout: 60_000, maxRetries: 0 });
  });

  it("답이 틀려 다시 요청할 때는 이미 쓴 시간을 뺀 남은 시간만 기다린다", async () => {
    // 첫 시도가 20초 걸리고 틀림 → 두 번째 시도는 40초만 기다린다
    const { client, parse } = clockedClient([
      { elapsedMs: 20_000, result: answer(null) },
      { elapsedMs: 10_000, result: answer(goodDraft()) },
    ]);
    await generateSchedule(request, client);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][1]).toEqual({ timeout: 40_000, maxRetries: 0 });
  });

  it("첫 시도에서 시간을 거의 다 써서 다시 요청할 시간이 모자라면, 다시 요청하지 않고 ai_busy로 알린다", async () => {
    // 55초 걸리고 틀림 → 남은 5초(< 10초)라 다시 요청하지 않는다
    const { client, parse } = clockedClient([{ elapsedMs: 55_000, result: answer(null) }]);
    const error = await generateSchedule(request, client).catch((e) => e);
    expect(error).toBeInstanceOf(GenerateError);
    expect(error.code).toBe("ai_busy");
    expect(error.message).toContain("다시 요청할 시간이 남지 않았습니다");
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("남은 시간이 정확히 10초이면 다시 요청한다 (경계)", async () => {
    const { client, parse } = clockedClient([
      { elapsedMs: 50_000, result: answer(null) },
      { elapsedMs: 3_000, result: answer(goodDraft()) },
    ]);
    await generateSchedule(request, client);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][1].timeout).toBe(10_000);
  });

  it("어느 시도에서든 '이미 흐른 시간 + 이번 시도의 대기 한도'가 60초를 넘지 않는다", async () => {
    // 첫 시도 30초(틀림) → 두 번째 시도의 한도는 30초여야 한다 (30 + 30 = 60)
    const elapsedPerAttempt = [30_000, 30_000];
    const { client, parse } = clockedClient([
      { elapsedMs: elapsedPerAttempt[0], result: answer(null) },
      { elapsedMs: elapsedPerAttempt[1], result: answer(null) },
    ]);
    await generateSchedule(request, client).catch(() => undefined);

    let elapsedBefore = 0;
    parse.mock.calls.forEach((call, index) => {
      expect(elapsedBefore + call[1].timeout).toBeLessThanOrEqual(60_000);
      elapsedBefore += elapsedPerAttempt[index];
    });
    expect(parse).toHaveBeenCalledTimes(2);
  });
});
