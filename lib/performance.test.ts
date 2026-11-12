import { describe, expect, it } from "vitest";
import { fakeSchedule } from "../data/fake-ai";
import { sampleRawInput } from "../data/sample-text";
import { weekdaysOfMonth } from "./calendar";
import { buildScheduleRequest } from "./candidates";
import { buildEvidenceView } from "./evidence-view";
import { scheduleToText } from "./export";
import { buildScheduleInput } from "./input";
import { checkSchedule } from "./rules";
import { buildScheduleView } from "./schedule-view";

// 작업 19 / SC-1 (작성 시간 30분 이내) 보조: AI를 기다리는 시간을 뺀 나머지 계산은 눈에 띄지 않을 만큼 빨라야 한다.
// 이 시간이 느려지면 30분 약속에서 AI 대기(최대 60초) 말고도 시간을 잡아먹는다는 뜻이라, 그런 퇴보를 막는 보호 장치다.

/** 일부러 큰 입력: 직원 100명(서버 요청 검사가 받아 주는 최대 인원), 한 달 근무일 약 22일, 휴가 300건 */
function largeRaw() {
  const employees = Array.from({ length: 100 }, (_, i) => {
    const team = ["A", "B", "C"][i % 3];
    return `직원${i + 1}\t${team}\t${i % 4 === 0 ? "O" : "X"}`;
  }).join("\n");
  // 휴가는 평일에만 적는다 (주말뿐인 날짜는 앱이 입력 오류로 거절한다)
  const weekdays = weekdaysOfMonth("2026-12");
  const leaves = Array.from({ length: 300 }, (_, i) => `직원${(i % 100) + 1}\t${weekdays[i % weekdays.length]}`).join(
    "\n",
  );
  return { ...sampleRawInput, employeesText: employees, leavesText: leaves, previousText: "" };
}

/** AI를 뺀 전체 계산(입력 해석 → 후보 → 당번표 → 검사 → 표 → 근거 표 → 복사 글)을 한 번 돌리고 걸린 시간(ms)을 돌려준다 */
function runWithoutAi(raw: ReturnType<typeof largeRaw>) {
  const start = performance.now();
  const built = buildScheduleInput(raw);
  if (!built.input) throw new Error("입력 오류: " + JSON.stringify(built.issues));
  const request = buildScheduleRequest(built.input);
  const draft = fakeSchedule(request);
  checkSchedule(built.input, draft.assignments);
  buildScheduleView(built.input, draft.assignments);
  buildEvidenceView(built.input, draft.assignments, draft.descriptions);
  scheduleToText(built.input, draft.assignments);
  return performance.now() - start;
}

describe("AI를 뺀 계산 시간 (SC-1 보조)", () => {
  it("예시 입력(12명)은 1초 안에 끝난다", () => {
    expect(runWithoutAi(sampleRawInput as ReturnType<typeof largeRaw>)).toBeLessThan(1000);
  });

  it("직원 100명·휴가 300건의 큰 입력도 2초 안에 끝난다", () => {
    expect(runWithoutAi(largeRaw())).toBeLessThan(2000);
  });

  it("표가 다시 그려질 때마다 도는 계산(검사+표+근거 표)은 큰 입력에서도 0.5초 안이다 (직접 바꿀 때마다 즉시 반응하려면)", () => {
    const built = buildScheduleInput(largeRaw());
    if (!built.input) throw new Error("입력 오류");
    const draft = fakeSchedule(buildScheduleRequest(built.input));

    const start = performance.now();
    checkSchedule(built.input, draft.assignments);
    buildScheduleView(built.input, draft.assignments);
    buildEvidenceView(built.input, draft.assignments, draft.descriptions);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
