import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateError, generateSchedule } from "@/lib/generate";
import { RATE_LIMIT_MAX, resetRateLimit } from "@/lib/rate-limit";
import type { ApiErrorBody } from "@/lib/api-errors";
import { POST } from "./route";

// 보안 점검(CHECK.md) 대응 시험: 다른 사이트 요청 차단, 크기 상한, 횟수 제한, 로그에 이름이 남지 않음.
vi.mock("@/lib/generate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/generate")>();
  return { ...original, generateSchedule: vi.fn() };
});

const mockedGenerate = vi.mocked(generateSchedule);
const draft = {
  assignments: [{ date: "2026-12-01", name: "김OO" }],
  descriptions: [{ name: "김OO", text: "고르게 배정되었습니다" }],
};
const validBody = {
  month: "2026-12",
  weekdays: ["2026-12-01"],
  candidates: { "2026-12-01": ["김OO"] },
  unassignable: [],
  employees: [{ name: "김OO", team: "A", flexWork: false }],
  balanceTargets: ["김OO"],
};

function send(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://localhost/api/schedule", {
      method: "POST",
      headers: { host: "localhost", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const code = async (response: Response) => ((await response.json()) as ApiErrorBody).error.code;

beforeEach(() => {
  resetRateLimit();
  mockedGenerate.mockReset();
  mockedGenerate.mockResolvedValue(draft);
  vi.stubEnv("OPENAI_API_KEY", "fake-key-for-test-do-not-use-0123456789");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("다른 사이트에서 보낸 요청 (SEC-001)", () => {
  it("Origin이 다른 주소면 403이고 AI를 부르지 않는다", async () => {
    const response = await send(validBody, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(await code(response)).toBe("forbidden");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("Origin이 같은 주소거나 없으면 통과한다", async () => {
    expect((await send(validBody, { origin: "http://localhost" })).status).toBe(200);
    expect((await send(validBody)).status).toBe(200);
  });
});

describe("요청 크기 상한 (SEC-002)", () => {
  it("본문이 너무 크면 400이고 AI를 부르지 않는다", async () => {
    const response = await send("x".repeat(250_000));
    expect(response.status).toBe(400);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("후보 목록에 같은 이름을 여러 번 넣으면 거절한다", async () => {
    const body = { ...validBody, candidates: { "2026-12-01": Array(50).fill("김OO") } };
    const response = await send(body);
    expect(response.status).toBe(400);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("후보 목록이 100명을 넘으면 거절한다", async () => {
    const body = { ...validBody, candidates: { "2026-12-01": Array.from({ length: 101 }, (_, i) => `이름${i}`) } };
    expect((await send(body)).status).toBe(400);
  });
});

describe("횟수 제한 (SEC-001)", () => {
  it(`같은 주소가 1분에 ${RATE_LIMIT_MAX}번을 넘기면 429이고, 다른 주소는 영향이 없다`, async () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect((await send(validBody, headers)).status).toBe(200);
    }
    const blocked = await send(validBody, headers);
    expect(blocked.status).toBe(429);
    expect(await code(blocked)).toBe("too_many_requests");
    expect(mockedGenerate).toHaveBeenCalledTimes(RATE_LIMIT_MAX);

    expect((await send(validBody, { "x-forwarded-for": "203.0.113.8" })).status).toBe(200);
  });

  it("입력이 틀린 요청은 횟수에 세지 않는다 (AI를 부르지 않으므로)", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < RATE_LIMIT_MAX + 2; i++) {
      expect((await send({ ...validBody, month: "2026-13" }, headers)).status).toBe(400);
    }
    expect((await send(validBody, headers)).status).toBe(200);
  });
});

describe("서버 기록 (SEC-005)", () => {
  it("AI 오류 메시지에 이름이 섞여 있어도 기록에는 오류 종류만 남는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGenerate.mockRejectedValue(new GenerateError("ai_bad_response", "명단에 없는 이름: 홍길동님"));
    await send(validBody);
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("ai_bad_response");
    expect(logged).not.toContain("홍길동");
  });
});
