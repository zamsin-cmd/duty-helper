// 사용자 경험 개선: 당번표를 만드는 동안 "몇 초째 기다리는 중인지" 보여 준다.
// AI 답은 보통 10~20초, 최대 60초(AI_TIMEOUT_MS)가 걸려서, 아무 변화가 없으면 멈춘 것처럼 보인다.

/** 버튼에 보여 줄 글. 최대 대기 시간(60초)을 넘기면 "조금만 더" 안내로 바꾼다. */
export function loadingLabel(seconds: number, maxSeconds = 60): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe >= maxSeconds) return `당번표를 만드는 중… ${safe}초째, 곧 끝납니다`;
  return `당번표를 만드는 중… ${safe}초 / 최대 ${maxSeconds}초`;
}
