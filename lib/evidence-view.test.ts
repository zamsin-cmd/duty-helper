import { describe, expect, it } from "vitest";
import { sampleEmployees, sampleInput, sampleInputTeamAbsent } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { EMPTY_CELL, buildEvidenceView, type EvidenceDisplayRow } from "./evidence-view";
import { shortDate } from "./format";
import type { Assignment } from "./types";

const rowOf = (rows: EvidenceDisplayRow[], name: string): EvidenceDisplayRow => {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`${name} 줄이 없습니다`);
  return row;
};

// 작업 13: 근거 표에 보여 줄 글자
describe("날짜 줄이기 (shortDate)", () => {
  it("월/일로 줄이고 앞의 0은 뗀다", () => {
    expect(shortDate("2026-12-01")).toBe("12/1");
    expect(shortDate("2026-01-09")).toBe("1/9");
    expect(shortDate("2026-12-25")).toBe("12/25");
  });
});

describe("근거 표 줄 (buildEvidenceView)", () => {
  const rows = buildEvidenceView(sampleInput, sampleValidSchedule);

  it("명단의 모든 직원이 명단 순서대로 한 줄씩 있다", () => {
    expect(rows.map((r) => r.name)).toEqual(sampleEmployees.map((e) => e.name));
  });

  it("이번 달 횟수를 '3회' 형태로 보여 준다", () => {
    expect(rowOf(rows, "김OO").countText).toBe("3회");
    expect(rowOf(rows, "박OO").countText).toBe("2회");
    expect(rowOf(rows, "오OO").countText).toBe("0회");
  });

  it("맡은 화요일은 날짜와 팀으로 보여 주고, 없으면 '-'다", () => {
    expect(rowOf(rows, "김OO").tuesdayText).toBe("12/1 (A팀)");
    expect(rowOf(rows, "강OO").tuesdayText).toBe("12/8 (B팀)");
    expect(rowOf(rows, "박OO").tuesdayText).toBe(EMPTY_CELL);
  });

  it("화요일을 여러 번 맡으면 날짜 순서로 쉼표로 이어 붙인다", () => {
    // 이OO에게 12/1(A팀)도 주면 12/1, 12/22 두 번
    const list: Assignment[] = sampleValidSchedule.map((a) =>
      a.date === "2026-12-01" ? { date: a.date, name: "이OO" } : a,
    );
    expect(rowOf(buildEvidenceView(sampleInput, list), "이OO").tuesdayText).toBe(
      "12/1 (A팀), 12/22 (A팀)",
    );
  });

  it("지난달 횟수를 보여 주고, 지난달 당번표를 넣지 않았으면 모두 '-'다", () => {
    expect(rowOf(rows, "김OO").previousText).toBe("2회");
    expect(rowOf(rows, "조OO").previousText).toBe("0회");
    const none = buildEvidenceView({ ...sampleInput, previousSchedule: undefined }, sampleValidSchedule);
    expect(none.every((r) => r.previousText === EMPTY_CELL)).toBe(true);
  });

  it("비교 제외 사유를 보여 주고 excluded 표시를 한다", () => {
    expect(rowOf(rows, "조OO")).toMatchObject({ excludedText: "중간 입사", excluded: true });
    expect(rowOf(rows, "한OO")).toMatchObject({ excludedText: "중간 퇴사", excluded: true });
    expect(rowOf(rows, "오OO")).toMatchObject({ excludedText: "장기 휴가", excluded: true });
    expect(rowOf(rows, "김OO")).toMatchObject({ excludedText: EMPTY_CELL, excluded: false });
  });

  it("설명이 없으면 '-'이고, 있으면 그대로 보여 준다", () => {
    expect(rowOf(rows, "김OO").description).toBe(EMPTY_CELL);
    const withText = buildEvidenceView(sampleInput, sampleValidSchedule, [
      { name: "김OO", text: "화요일 당번을 포함해 고르게 배정되었습니다" },
      { name: "이OO", text: "   " },
    ]);
    expect(rowOf(withText, "김OO").description).toBe("화요일 당번을 포함해 고르게 배정되었습니다");
    expect(rowOf(withText, "이OO").description).toBe(EMPTY_CELL); // 공백뿐인 설명도 없는 것으로 본다
  });
});

describe("당번표와 숫자가 어긋나지 않는다 (SC-5)", () => {
  it("이번 달 횟수를 모두 합치면 배정된 칸 수와 같다", () => {
    const rows = buildEvidenceView(sampleInput, sampleValidSchedule);
    const total = rows.reduce((sum, r) => sum + Number(r.countText.replace("회", "")), 0);
    expect(total).toBe(22);
  });

  it("당번자를 바꾸면 다시 계산한 표가 새 당번표와 맞는다", () => {
    const changed = sampleValidSchedule.map((a) =>
      a.date === "2026-12-10" ? { date: a.date, name: "이OO" } : a,
    );
    const rows = buildEvidenceView(sampleInput, changed);
    expect(rowOf(rows, "박OO").countText).toBe("1회");
    expect(rowOf(rows, "이OO").countText).toBe("4회");
  });

  it("지정자가 직접 지정한 화요일도 그날 담당 팀과 함께 보여 준다", () => {
    const list: Assignment[] = sampleValidSchedule.map((a) =>
      a.date === "2026-12-08" ? { date: a.date, name: "이OO", manual: true } : a,
    );
    expect(rowOf(buildEvidenceView(sampleInputTeamAbsent, list), "이OO").tuesdayText).toContain(
      "12/8 (B팀)",
    );
  });
});
