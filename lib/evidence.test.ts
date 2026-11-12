import { describe, expect, it } from "vitest";
import {
  sampleEmployees,
  sampleInput,
  sampleInputTeamAbsent,
  sampleInputTuesdayHoliday,
} from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { buildEvidence } from "./evidence";
import type { Assignment, EvidenceRow } from "./types";

const rowOf = (rows: EvidenceRow[], name: string): EvidenceRow => {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`근거 표에 ${name} 줄이 없습니다`);
  return row;
};

/** 정답지에서 날짜별로 당번자를 바꾼 당번표 */
function schedule(changes: Record<string, string | null> = {}): Assignment[] {
  return sampleValidSchedule.map(({ date, name }) => ({
    date,
    name: date in changes ? changes[date] : name,
  }));
}

// 작업 8: 근거 숫자 계산
describe("근거 표 숫자 (buildEvidence)", () => {
  const rows = buildEvidence(sampleInput, sampleValidSchedule);

  it("명단의 모든 직원이 명단 순서대로 한 줄씩 있다", () => {
    expect(rows.map((r) => r.name)).toEqual(sampleEmployees.map((e) => e.name));
  });

  it("이번 달 당번 횟수를 당번표에서 센다", () => {
    const counts = Object.fromEntries(rows.map((r) => [r.name, r.count]));
    expect(counts).toEqual({
      김OO: 3, 이OO: 3, 박OO: 2, 최OO: 2,
      정OO: 3, 강OO: 2, 조OO: 0, 윤OO: 3,
      장OO: 2, 임OO: 2, 한OO: 0, 오OO: 0,
    });
  });

  it("횟수를 모두 합치면 당번표의 배정된 칸 수와 같다 (100% 일치)", () => {
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(sampleValidSchedule.filter((a) => a.name !== null).length);
    expect(total).toBe(22);
  });

  it("직원이 맡은 화요일의 날짜와 팀을 알려 준다", () => {
    expect(rowOf(rows, "김OO").tuesdays).toEqual([{ date: "2026-12-01", team: "A" }]);
    expect(rowOf(rows, "강OO").tuesdays).toEqual([{ date: "2026-12-08", team: "B" }]);
    expect(rowOf(rows, "임OO").tuesdays).toEqual([{ date: "2026-12-15", team: "C" }]);
    expect(rowOf(rows, "이OO").tuesdays).toEqual([{ date: "2026-12-22", team: "A" }]);
    expect(rowOf(rows, "정OO").tuesdays).toEqual([{ date: "2026-12-29", team: "B" }]);
  });

  it("화요일을 맡지 않은 직원의 화요일 목록은 비어 있다", () => {
    expect(rowOf(rows, "박OO").tuesdays).toEqual([]);
    expect(rowOf(rows, "오OO").tuesdays).toEqual([]);
  });

  it("지난달 당번 횟수를 보여 준다 (이번 달 입사자는 0)", () => {
    expect(rowOf(rows, "김OO").previousCount).toBe(2);
    expect(rowOf(rows, "오OO").previousCount).toBe(1);
    expect(rowOf(rows, "조OO").previousCount).toBe(0);
  });

  it("지난달 당번표를 넣지 않았으면 모두 null이다", () => {
    const noPrevious = buildEvidence(
      { ...sampleInput, previousSchedule: undefined },
      sampleValidSchedule,
    );
    expect(noPrevious.every((r) => r.previousCount === null)).toBe(true);
  });

  it("비교 제외 사유를 알려 준다", () => {
    expect(rowOf(rows, "조OO").excludedReason).toBe("중간 입사");
    expect(rowOf(rows, "한OO").excludedReason).toBe("중간 퇴사");
    expect(rowOf(rows, "오OO").excludedReason).toBe("장기 휴가");
    expect(rowOf(rows, "김OO").excludedReason).toBeNull();
  });
});

describe("설명 칸", () => {
  it("AI가 쓴 설명을 이름에 맞춰 넣고, 없는 직원은 빈 글자다", () => {
    const rows = buildEvidence(sampleInput, sampleValidSchedule, [
      { name: "김OO", text: "화요일 당번을 포함해 고르게 배정되었습니다" },
    ]);
    expect(rowOf(rows, "김OO").description).toBe("화요일 당번을 포함해 고르게 배정되었습니다");
    expect(rowOf(rows, "이OO").description).toBe("");
  });

  it("설명을 아예 주지 않아도 계산은 된다", () => {
    const rows = buildEvidence(sampleInput, sampleValidSchedule);
    expect(rows.every((r) => r.description === "")).toBe(true);
  });
});

describe("당번표가 바뀌면 숫자도 바뀐다", () => {
  it("당번자를 직접 바꾼 뒤 다시 계산하면 새 당번표와 맞는다", () => {
    // 12/10(목)을 박OO에서 이OO로 바꾼다
    const rows = buildEvidence(sampleInput, schedule({ "2026-12-10": "이OO" }));
    expect(rowOf(rows, "박OO").count).toBe(1);
    expect(rowOf(rows, "이OO").count).toBe(4);
  });

  it("이름이 없는 칸(배정 불가)은 세지 않는다", () => {
    const rows = buildEvidence(sampleInput, schedule({ "2026-12-03": null }));
    expect(rowOf(rows, "윤OO").count).toBe(2);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(21);
  });

  it("지정자 직접 지정 칸도 횟수에 센다", () => {
    const list: Assignment[] = schedule().map((a) =>
      a.date === "2026-12-08" ? { date: a.date, name: "이OO", manual: true } : a,
    );
    const rows = buildEvidence(sampleInputTeamAbsent, list);
    expect(rowOf(rows, "이OO").count).toBe(4);
    // 그날 화요일은 B팀 차례였으므로 이OO의 화요일 목록에는 B팀으로 적힌다
    expect(rowOf(rows, "이OO").tuesdays).toContainEqual({ date: "2026-12-08", team: "B" });
  });

  it("공휴일인 화요일에 배정된 칸은 횟수에는 세고 화요일 목록에는 넣지 않는다", () => {
    // 12/15가 공휴일인 입력에서 정답지를 그대로 쓰면 12/15 임OO 칸이 공휴일에 놓인다
    const rows = buildEvidence(sampleInputTuesdayHoliday, sampleValidSchedule);
    expect(rowOf(rows, "임OO").count).toBe(2);
    expect(rowOf(rows, "임OO").tuesdays).toEqual([]);
  });

  it("명단에 없는 이름의 칸은 줄을 만들지 않는다", () => {
    const rows = buildEvidence(sampleInput, schedule({ "2026-12-02": "노OO" }));
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.name === "노OO")).toBeUndefined();
    expect(rowOf(rows, "정OO").count).toBe(2);
  });
});
