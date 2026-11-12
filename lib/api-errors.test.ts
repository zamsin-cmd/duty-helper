import { describe, expect, it } from "vitest";
import { apiError, type ApiErrorBody } from "./api-errors";

async function read(response: Response): Promise<ApiErrorBody> {
  return (await response.json()) as ApiErrorBody;
}

// 작업 10: 오류 응답 (DESIGN §7 표)
describe("오류 응답 (apiError)", () => {
  it("입력 오류는 400이고 어느 항목이 문제인지 뒤에 붙인다", async () => {
    const response = apiError("invalid_input", "month — 대상 월이 올바르지 않습니다");
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({
      error: { code: "invalid_input", message: "입력을 확인해 주세요: month — 대상 월이 올바르지 않습니다" },
    });
  });

  it("문제 항목을 안 주면 '입력을 확인해 주세요'만 나온다", async () => {
    expect((await read(apiError("invalid_input"))).error.message).toBe("입력을 확인해 주세요");
  });

  it("AI 키가 없으면 500이고 관리자에게 알리라고 안내한다", async () => {
    const response = apiError("missing_api_key");
    expect(response.status).toBe(500);
    expect((await read(response)).error.message).toBe(
      "AI 키가 설정되지 않았습니다. 관리자에게 알려 주세요.",
    );
  });

  it("AI 답을 읽지 못하면 502, AI가 바쁘면 503이고 다시 시도하라고 안내한다", async () => {
    const bad = apiError("ai_bad_response");
    const busy = apiError("ai_busy");
    expect([bad.status, busy.status]).toEqual([502, 503]);
    expect((await read(bad)).error.message).toBe("AI 답을 읽지 못했습니다. 다시 시도해 주세요.");
    expect((await read(busy)).error.message).toBe("AI가 잠시 바쁩니다. 다시 시도해 주세요.");
  });
});
