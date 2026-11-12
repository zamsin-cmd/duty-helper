import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateError, generateSchedule } from "@/lib/generate";
import type { ApiErrorBody } from "@/lib/api-errors";
import { POST, maxDuration } from "./route";

// AI를 실제로 부르지 않도록 generateSchedule만 가짜로 바꾼다 (GenerateError는 진짜를 쓴다).
vi.mock("@/lib/generate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/generate")>();
  return { ...original, generateSchedule: vi.fn() };
});

const FAKE_KEY = "fake-key-for-test-do-not-use-0123456789";
const mockedGenerate = vi.mocked(generateSchedule);

beforeEach(() => {
  mockedGenerate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {}); // 서버 기록 출력을 시험 화면에서 숨긴다
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const validBody = {
  month: "2026-12",
  weekdays: ["2026-12-01"],
  candidates: { "2026-12-01": ["김OO"] },
  unassignable: [],
  employees: [{ name: "김OO", team: "A", flexWork: false }],
  balanceTargets: ["김OO"],
};

const draft = {
  assignments: [{ date: "2026-12-01", name: "김OO" }],
  descriptions: [{ name: "김OO", text: "고르게 배정되었습니다" }],
};

function post(body: string): Promise<Response> {
  return POST(new Request("http://localhost/api/schedule", { method: "POST", body }));
}

const readError = async (response: Response) => ((await response.json()) as ApiErrorBody).error;

// 작업 10·11: 서버 API. 입력 오류 → 키 없음 → AI 호출 순서로 판단한다.
describe("POST /api/schedule — 입구", () => {
  it("실행 시간을 60초까지 허용한다", () => {
    expect(maxDuration).toBe(60);
  });

  it("JSON이 아닌 요청은 400이고 AI를 부르지 않는다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    const response = await post("이건 JSON이 아닙니다");
    expect(response.status).toBe(400);
    const error = await readError(response);
    expect(error.code).toBe("invalid_input");
    expect(error.message).toContain("JSON");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("형식이 틀린 요청은 400이고 어느 항목이 문제인지 알려 준다 (AI를 부르지 않는다)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    const response = await post(JSON.stringify({ ...validBody, month: "2026-13" }));
    expect(response.status).toBe(400);
    expect((await readError(response)).message).toContain("month");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("빈 요청 본문도 400이다", async () => {
    expect((await post("")).status).toBe(400);
    expect((await post("{}")).status).toBe(400);
  });

  it("입력이 틀리면 키가 있는지보다 먼저 입력 오류를 알린다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post(JSON.stringify({ ...validBody, month: "x" }))).status).toBe(400);
  });

  it("입력이 맞는데 AI 키가 없으면 500이고 AI를 부르지 않는다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post(JSON.stringify(validBody));
    expect(response.status).toBe(500);
    expect((await readError(response)).code).toBe("missing_api_key");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("공백뿐인 키도 없는 것으로 본다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "   ");
    expect((await post(JSON.stringify(validBody))).status).toBe(500);
  });
});

describe("POST /api/schedule — AI 호출", () => {
  it("입력과 키가 맞으면 AI 답을 200으로 돌려준다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    mockedGenerate.mockResolvedValueOnce(draft);
    const response = await post(JSON.stringify(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(draft);
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    // 검사를 통과한 요청이 그대로 넘어간다
    expect(mockedGenerate.mock.calls[0][0]).toEqual(validBody);
  });

  it("AI가 바쁘면 503, 답을 읽지 못하면 502, 키가 틀리면 500으로 알린다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    const cases = [
      ["ai_busy", 503],
      ["ai_bad_response", 502],
      ["missing_api_key", 500],
    ] as const;
    for (const [code, status] of cases) {
      mockedGenerate.mockRejectedValueOnce(new GenerateError(code, "시험용 이유"));
      const response = await post(JSON.stringify(validBody));
      expect(response.status).toBe(status);
      expect((await readError(response)).code).toBe(code);
    }
  });

  it("예상하지 못한 오류도 502로 알리고 오류 내용을 응답에 담지 않는다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    mockedGenerate.mockRejectedValueOnce(new Error(`내부 사정 ${FAKE_KEY}`));
    const response = await post(JSON.stringify(validBody));
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("내부 사정");
    expect(text).not.toContain(FAKE_KEY);
  });

  it("서버 기록(console.error)에도 키와 직원 정보가 남지 않는다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGenerate.mockRejectedValueOnce(new Error(`키 ${FAKE_KEY} 김OO`));
    await post(JSON.stringify(validBody));
    mockedGenerate.mockRejectedValueOnce(new GenerateError("ai_busy", "AI가 바쁘거나 응답이 늦습니다"));
    await post(JSON.stringify(validBody));
    const everything = JSON.stringify(logged.mock.calls);
    expect(everything).not.toContain(FAKE_KEY);
    expect(everything).not.toContain("김OO");
  });

  it("어떤 응답에도 AI 키 값이 들어 있지 않다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    mockedGenerate.mockResolvedValueOnce(draft);
    const responses = [
      await post(JSON.stringify(validBody)),
      await post(JSON.stringify({ ...validBody, month: "x" })),
      await post("깨진 요청"),
    ];
    for (const response of responses) {
      expect(await response.text()).not.toContain(FAKE_KEY);
    }
  });
});
