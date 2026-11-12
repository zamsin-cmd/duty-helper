import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AI_EFFORT, AI_MODEL, AI_TIMEOUT_MS, createAiClient, readApiKey } from "./ai";

afterEach(() => {
  vi.unstubAllEnvs();
});

// 작업 10: AI 연결 설정. 가짜 키만 쓰고 AI는 부르지 않는다.
describe("AI 키 읽기 (readApiKey)", () => {
  it("환경 변수에 키가 있으면 돌려준다 (앞뒤 공백은 지운다)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "  fake-key-for-test  ");
    expect(readApiKey()).toBe("fake-key-for-test");
  });

  it("없거나 비어 있거나 공백뿐이면 null이다", () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("ANTHROPIC_API_KEY", value);
      expect(readApiKey()).toBeNull();
    }
  });
});

describe("AI 연결 설정", () => {
  it("DESIGN §4.3에서 정한 모델·생각 깊이·대기 시간을 쓴다", () => {
    expect(AI_MODEL).toBe("claude-opus-5-5");
    expect(AI_EFFORT).toBe("high");
    expect(AI_TIMEOUT_MS).toBe(60_000);
  });

  it("연결을 만들어도 AI를 부르지는 않고, 대기 60초·자동 재시도 없음으로 정해진다", () => {
    const client = createAiClient("fake-key-for-test");
    expect(client).toBeInstanceOf(Anthropic);
    expect(client.timeout).toBe(60_000);
    // SDK가 시간 초과를 다시 보내면 기다리는 시간이 두 배가 되므로 끈다 (재시도는 generate.ts가 시간을 보고 한다)
    expect(client.maxRetries).toBe(0);
  });
});
