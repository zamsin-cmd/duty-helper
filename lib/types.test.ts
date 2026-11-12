import { describe, expect, it } from "vitest";
import {
  RULE_IDS,
  RULE_LABELS,
  TEAMS,
  type Assignment,
  type Employee,
  type EvidenceRow,
  type ScheduleInput,
  type Violation,
} from "./types";

// 작업 1: 데이터 모양과 시험 도구가 제대로 갖춰졌는지 확인한다.
describe("데이터 모양 (lib/types.ts)", () => {
  it("팀은 A, B, C 세 개로 고정되어 있다", () => {
    expect(TEAMS).toEqual(["A", "B", "C"]);
  });

  it("must ①의 규칙 8개가 모두 있고 이름이 겹치지 않는다", () => {
    expect(RULE_IDS).toHaveLength(8);
    expect(new Set(RULE_IDS).size).toBe(8);
  });

  it("모든 규칙에 한글 설명이 있다", () => {
    for (const id of RULE_IDS) {
      expect(RULE_LABELS[id]).toBeTruthy();
    }
  });

  it("DESIGN §6의 예시 데이터를 이 모양으로 담을 수 있다", () => {
    const kim: Employee = { name: "김OO", team: "A", flexWork: false };
    const park: Employee = {
      name: "박OO",
      team: "B",
      flexWork: true,
      startDate: "2026-12-15",
    };

    const input: ScheduleInput = {
      month: "2026-12",
      employees: [kim, park],
      leaves: [{ name: "김OO", date: "2026-12-07" }],
      holidays: ["2026-12-25"],
      firstTuesdayTeam: "A",
    };

    // 배정 불가 날짜는 이름이 비어 있고 이유가 붙는다.
    const noOne: Assignment = {
      date: "2026-12-08",
      name: null,
      unassignableReason: "B팀 전원 휴가",
    };

    // 한 달 전체 규칙(횟수 차이)은 날짜 없이 담는다.
    const balance: Violation = {
      rule: "balance",
      message: "직원 간 총 당번 횟수 차이가 3회입니다",
    };

    const row: EvidenceRow = {
      name: "김OO",
      count: 3,
      tuesdays: [{ date: "2026-12-01", team: "A" }],
      previousCount: null,
      excludedReason: null,
      description: "화요일 당번을 포함해 고르게 배정되었습니다",
    };

    expect(input.employees).toHaveLength(2);
    expect(noOne.name).toBeNull();
    expect(balance.date).toBeUndefined();
    expect(row.previousCount).toBeNull();
  });
});
