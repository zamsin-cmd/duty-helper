import { describe, expect, it } from "vitest";
import { sampleInput, sampleInputTeamAbsent } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { buildEvidenceView } from "./evidence-view";
import { MANUAL_CLEAR_REASON, changeAssignment } from "./edit";
import { buildScheduleView } from "./schedule-view";
import { checkSchedule } from "./rules";
import type { Assignment } from "./types";

/** 12/8(화)이 B팀 전원 부재라 AI가 배정 불가로 돌려준 당번표 */
const draftWithGap = (): Assignment[] =>
  sampleValidSchedule.map((a) =>
    a.date === "2026-12-08"
      ? { date: a.date, name: null, unassignableReason: "B팀 전원 부재 (이 화요일은 B팀 차례)" }
      : { ...a },
  );

const entryOf = (list: Assignment[], date: string) => list.filter((a) => a.date === date);

// 작업 14: 당번자 직접 변경
describe("보통 날의 변경 (changeAssignment)", () => {
  it("다른 사람으로 바꾸면 그 날의 칸이 새 이름이 된다 (직접 지정 표시는 없다)", () => {
    const next = changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-10", "이OO");
    expect(entryOf(next, "2026-12-10")).toEqual([{ date: "2026-12-10", name: "이OO" }]);
  });

  it("원래 당번표는 바꾸지 않는다 (새 당번표를 돌려준다)", () => {
    const before = JSON.stringify(sampleValidSchedule);
    changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-10", "이OO");
    expect(JSON.stringify(sampleValidSchedule)).toBe(before);
  });

  it("다른 날짜의 칸과 날짜 순서는 그대로다", () => {
    const next = changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-10", "이OO");
    expect(next).toHaveLength(22);
    expect(next.map((a) => a.date)).toEqual(sampleValidSchedule.map((a) => a.date));
    expect(next.filter((a) => a.date !== "2026-12-10")).toEqual(
      sampleValidSchedule.filter((a) => a.date !== "2026-12-10"),
    );
  });

  it("보통 날을 비우면 배정 불가가 되고 비운 이유가 남는다", () => {
    const next = changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-03", null);
    expect(entryOf(next, "2026-12-03")).toEqual([
      { date: "2026-12-03", name: null, unassignableReason: MANUAL_CLEAR_REASON },
    ]);
  });

  it("규칙을 어기는 사람으로 바꾸면 규칙 검사기가 바로 위반으로 알린다", () => {
    // 김OO는 12/10 휴가
    const next = changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-10", "김OO");
    const rules = checkSchedule(sampleInput, next).filter((v) => v.date === "2026-12-10").map((v) => v.rule);
    expect(rules).toContain("no-leave");
  });
});

describe("배정 불가 날짜의 변경 (지정자 직접 지정)", () => {
  const original = draftWithGap();

  it("원래 배정 불가였던 날에 사람을 넣으면 manual이다", () => {
    const next = changeAssignment(original, original, "2026-12-08", "이OO");
    expect(entryOf(next, "2026-12-08")).toEqual([{ date: "2026-12-08", name: "이OO", manual: true }]);
  });

  it("직접 지정한 칸은 다른 팀이어도 위반이 아니고, 표에는 '직접 지정'으로 보인다", () => {
    // 12/8은 B팀 차례, 이OO는 A팀
    const next = changeAssignment(original, original, "2026-12-08", "이OO");
    const view = buildScheduleView(sampleInputTeamAbsent, next);
    const row = view.rows.find((r) => r.date === "2026-12-08");
    expect(row?.status).toBe("manual");
    expect(row?.notes).toContain("지정자 직접 지정");
  });

  it("직접 지정을 다른 사람으로 다시 바꿔도 직접 지정이다", () => {
    const first = changeAssignment(original, original, "2026-12-08", "이OO");
    const second = changeAssignment(original, first, "2026-12-08", "박OO");
    expect(entryOf(second, "2026-12-08")).toEqual([{ date: "2026-12-08", name: "박OO", manual: true }]);
  });

  it("직접 지정한 날을 다시 비우면 AI가 준 원래 배정 불가 칸(이유 포함)으로 돌아간다", () => {
    const first = changeAssignment(original, original, "2026-12-08", "이OO");
    const back = changeAssignment(original, first, "2026-12-08", null);
    expect(entryOf(back, "2026-12-08")).toEqual([
      {
        date: "2026-12-08",
        name: null,
        unassignableReason: "B팀 전원 부재 (이 화요일은 B팀 차례)",
      },
    ]);
  });
});

describe("칸이 비정상일 때", () => {
  it("칸이 아예 없던 날도 사람을 넣으면 칸이 하나 생긴다 (보통 배정)", () => {
    const missing = sampleValidSchedule.filter((a) => a.date !== "2026-12-03");
    const next = changeAssignment(missing, missing, "2026-12-03", "윤OO");
    expect(entryOf(next, "2026-12-03")).toEqual([{ date: "2026-12-03", name: "윤OO" }]);
  });

  it("같은 날짜 칸이 여러 개였어도 바꾸면 하나만 남는다", () => {
    const doubled = [...sampleValidSchedule, { date: "2026-12-02", name: "박OO" }];
    const next = changeAssignment(sampleValidSchedule, doubled, "2026-12-02", "최OO");
    expect(entryOf(next, "2026-12-02")).toEqual([{ date: "2026-12-02", name: "최OO" }]);
    expect(next).toHaveLength(22);
  });
});

describe("바꾼 뒤 다시 계산하면 표와 근거 숫자가 맞는다", () => {
  it("12/10을 박OO에서 이OO로 바꾸면 근거 표도 박OO 1회, 이OO 4회가 된다", () => {
    const next = changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-10", "이OO");
    const rows = buildEvidenceView(sampleInput, next);
    expect(rows.find((r) => r.name === "박OO")?.countText).toBe("1회");
    expect(rows.find((r) => r.name === "이OO")?.countText).toBe("4회");
  });

  it("위반 없던 당번표에서 휴가자로 바꾸면 위반이 생기고, 원래대로 되돌리면 사라진다", () => {
    const bad = changeAssignment(sampleValidSchedule, sampleValidSchedule, "2026-12-10", "김OO");
    expect(buildScheduleView(sampleInput, bad).counts.violations).toBeGreaterThan(0);
    const restored = changeAssignment(sampleValidSchedule, bad, "2026-12-10", "박OO");
    expect(buildScheduleView(sampleInput, restored).counts.violations).toBe(0);
  });
});
