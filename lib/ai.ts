// Design Ref: §4.3 AI 호출 방식, §8 보안 — AI 연결 설정과 키 읽기.
// Plan SC: 작업 10 — .env의 키를 서버 쪽에서만 읽는다. (AI를 실제로 부르는 것은 작업 11)
//
// 이 파일은 서버 쪽 코드(app/api/...)에서만 불러 쓴다. 화면 코드(components/...)에서
// 불러오면 안 된다. (NEXT_PUBLIC_으로 시작하지 않는 환경 변수는 화면 코드에서 비어 보이지만,
// 실수를 막으려고 규칙으로도 정해 둔다.)

import Anthropic from "@anthropic-ai/sdk";

/** 당번표를 짜는 AI 모델 */
export const AI_MODEL = "claude-opus-5-5";

/** 생각 깊이. 여러 조건을 동시에 맞춰야 해서 기본값(medium)보다 한 단계 높인다. */
export const AI_EFFORT = "high";

/**
 * AI 답을 기다리는 전체 최대 시간(밀리초). 다시 요청하는 시간까지 모두 합친 한도다 (DESIGN §7 "최대 60초").
 * 넘으면 "AI가 바쁩니다(503)"로 안내한다. 서버가 이 시간 안에 반드시 답하도록
 * 서버 실행 허용 시간(app/api/schedule/route.ts의 maxDuration)은 이보다 길게 잡는다.
 */
export const AI_TIMEOUT_MS = 60_000;

/**
 * .env의 ANTHROPIC_API_KEY를 읽는다. 없거나 공백뿐이면 null.
 * 요청이 올 때마다 읽는다 (서버를 켠 뒤에 .env를 고쳐도 다음 실행에서 반영되도록).
 * 이 값은 로그나 응답에 절대 내보내지 않는다.
 */
export function readApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? key : null;
}

/**
 * AI 연결을 만든다. 만들기만 하고 부르지는 않는다 (비용 없음).
 * SDK의 자동 재시도는 끈다(maxRetries: 0). 시간 초과도 재시도하는 SDK 기본 동작이 겹치면
 * 기다리는 시간이 약속(AI_TIMEOUT_MS)의 두 배가 되기 때문이다. 다시 요청은 lib/generate.ts가
 * 남은 시간을 보고 직접 하고, 통신 실패는 사용자가 "다시 시도"를 눌러 다시 한다.
 */
export function createAiClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
}
