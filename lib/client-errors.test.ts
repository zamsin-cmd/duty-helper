import { describe, expect, it } from "vitest";
import { apiError } from "./api-errors";
import {
  CLIENT_TIMEOUT_MS,
  NETWORK_ERROR,
  TIMEOUT_ERROR,
  UNEXPECTED_ERROR,
  describeFailure,
  describeThrown,
} from "./client-errors";

/** 서버가 실제로 돌려주는 오류 응답을 (상태, 본문)으로 읽는다. */
async function fromServer(response: Response): Promise<[number, unknown]> {
  return [response.status, await response.json()];
}

// 작업 17: 서버 응답을 화면 안내로
describe("서버가 정한 오류 (describeFailure)", () => {
  it("AI가 바쁘면(503) 서버의 안내 문구를 그대로 쓰고 다시 시도를 보인다", async () => {
    const failure = describeFailure(...(await fromServer(apiError("ai_busy"))));
    expect(failure).toEqual({ message: "AI가 잠시 바쁩니다. 다시 시도해 주세요.", retryable: true });
  });

  it("AI 답이 틀리면(502) 다시 시도를 보인다", async () => {
    const failure = describeFailure(...(await fromServer(apiError("ai_bad_response"))));
    expect(failure).toEqual({ message: "AI 답을 읽지 못했습니다. 다시 시도해 주세요.", retryable: true });
  });

  it("AI 키가 없으면(500) 관리자에게 알리라는 문구만 보이고 다시 시도는 숨긴다 (눌러 봐야 소용없다)", async () => {
    const failure = describeFailure(...(await fromServer(apiError("missing_api_key"))));
    expect(failure).toEqual({
      message: "AI 키가 설정되지 않았습니다. 관리자에게 알려 주세요.",
      retryable: false,
    });
  });

  it("입력 오류(400)는 고쳐야 하므로 다시 시도를 숨긴다", async () => {
    const failure = describeFailure(...(await fromServer(apiError("invalid_input", "month — 대상 월이 올바르지 않습니다"))));
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("입력을 확인해 주세요");
  });

  it("서버가 정한 모든 오류 종류에 사람이 읽을 수 있는 한국어 안내가 있다", async () => {
    for (const code of ["invalid_input", "missing_api_key", "ai_bad_response", "ai_busy"] as const) {
      const { message } = describeFailure(...(await fromServer(apiError(code))));
      expect(message).toMatch(/[가-힣]/);
    }
  });
});

describe("서버가 정한 모양으로 답하지 못했을 때", () => {
  it("배포 환경이 시간 초과로 끊은 504 같은 서버 문제는 안내를 새로 만들고 다시 시도를 보인다", () => {
    expect(describeFailure(504, null)).toEqual({ message: UNEXPECTED_ERROR, retryable: true });
    expect(describeFailure(502, "<html>Bad Gateway</html>")).toEqual({
      message: UNEXPECTED_ERROR,
      retryable: true,
    });
  });

  it("너무 많은 요청(429)도 다시 시도를 보인다", () => {
    expect(describeFailure(429, {}).retryable).toBe(true);
  });

  it("그 밖의 상태(404, 413 등)는 다시 시도를 숨긴다", () => {
    expect(describeFailure(404, null)).toEqual({ message: UNEXPECTED_ERROR, retryable: false });
    expect(describeFailure(413, {}).retryable).toBe(false);
  });

  it("오류 모양이 이상해도(문구가 글자가 아님) 깨지지 않는다", () => {
    expect(describeFailure(500, { error: { code: "ai_busy", message: 123 } }).message).toBe(UNEXPECTED_ERROR);
    expect(describeFailure(500, { error: "문자열" }).message).toBe(UNEXPECTED_ERROR);
    expect(describeFailure(500, undefined).message).toBe(UNEXPECTED_ERROR);
  });

  it("문구는 있는데 종류를 모르면 다시 시도를 숨긴다", () => {
    expect(describeFailure(500, { error: { message: "알 수 없는 오류" } })).toEqual({
      message: "알 수 없는 오류",
      retryable: false,
    });
  });
});

describe("요청을 보내다 난 예외 (describeThrown)", () => {
  it("통신이 끊기면(fetch 실패) 연결 확인 안내와 다시 시도를 보인다", () => {
    expect(describeThrown(new TypeError("Failed to fetch"))).toEqual({
      message: NETWORK_ERROR,
      retryable: true,
    });
  });

  it("화면의 시간 제한(TimeoutError)과 직접 중단(AbortError)은 '너무 오래 걸립니다' 안내다", () => {
    const timeout = new DOMException("signal timed out", "TimeoutError");
    const abort = new DOMException("aborted", "AbortError");
    expect(describeThrown(timeout)).toEqual({ message: TIMEOUT_ERROR, retryable: true });
    expect(describeThrown(abort)).toEqual({ message: TIMEOUT_ERROR, retryable: true });
  });

  it("예외가 아닌 값이 던져져도 깨지지 않는다", () => {
    expect(describeThrown("문자열").retryable).toBe(true);
    expect(describeThrown(undefined).message).toBe(NETWORK_ERROR);
  });
});

describe("화면의 기다리는 시간", () => {
  it("서버의 실행 허용 시간(75초)보다 길어서, 서버가 직접 답할 기회를 먼저 준다", () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(75_000);
  });
});
