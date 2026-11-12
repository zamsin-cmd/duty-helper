import { describe, expect, it } from "vitest";
import { TEAMS } from "../lib/types";
import {
  sampleEmployees,
  sampleHolidays,
  sampleInput,
  sampleInputTeamAbsent,
  sampleInputTuesdayHoliday,
  sampleLeaves,
  samplePreviousSchedule,
} from "./sample";

/** 날짜 글자의 요일 (0=일 ~ 6=토). 시간대에 흔들리지 않게 UTC로 계산한다. */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const names = new Set(sampleEmployees.map((employee) => employee.name));

// 작업 2: 가상 예시 데이터가 PLAN에서 약속한 상황을 모두 담고 있는지 확인한다.
describe("가상 예시 데이터 (data/sample.ts)", () => {
  it("직원은 12명이고 팀마다 4명이다", () => {
    expect(sampleEmployees).toHaveLength(12);
    for (const team of TEAMS) {
      expect(sampleEmployees.filter((e) => e.team === team)).toHaveLength(4);
    }
  });

  it("이름은 모두 가명(성+OO)이고 겹치지 않는다", () => {
    expect(names.size).toBe(12);
    for (const name of names) {
      expect(name).toMatch(/^[가-힣]OO$/);
    }
  });

  it("유연근무자가 있다", () => {
    expect(sampleEmployees.filter((e) => e.flexWork).length).toBeGreaterThanOrEqual(3);
  });

  it("달 중간 입사자와 퇴사자가 1명씩 있다", () => {
    const joined = sampleEmployees.filter((e) => e.startDate);
    const left = sampleEmployees.filter((e) => e.endDate);
    expect(joined.map((e) => e.name)).toEqual(["조OO"]);
    expect(left.map((e) => e.name)).toEqual(["한OO"]);
    expect(joined[0].startDate?.startsWith("2026-12")).toBe(true);
    expect(left[0].endDate?.startsWith("2026-12")).toBe(true);
  });

  it("휴가는 명단에 있는 사람의 12월 평일에만 들어 있다", () => {
    expect(sampleLeaves.length).toBeGreaterThan(0);
    for (const leave of sampleLeaves) {
      expect(names.has(leave.name)).toBe(true);
      expect(leave.date.startsWith("2026-12")).toBe(true);
      expect([0, 6]).not.toContain(weekdayOf(leave.date));
    }
  });

  it("장기 휴가자(오OO)는 근무일 22일의 절반(11일) 이상 쉰다", () => {
    const days = sampleLeaves.filter((l) => l.name === "오OO").length;
    expect(days).toBeGreaterThanOrEqual(11);
  });

  it("공휴일은 12월 평일에 있다", () => {
    expect(sampleHolidays).toEqual(["2026-12-25"]);
    expect([0, 6]).not.toContain(weekdayOf("2026-12-25"));
  });

  it("지난달 당번표는 11월 평일 21일이고, 이번 달 입사자는 들어 있지 않다", () => {
    expect(samplePreviousSchedule).toHaveLength(21);
    for (const duty of samplePreviousSchedule) {
      expect(duty.date.startsWith("2026-11")).toBe(true);
      expect([0, 6]).not.toContain(weekdayOf(duty.date));
      expect(names.has(duty.name)).toBe(true);
      expect(duty.name).not.toBe("조OO");
    }
  });

  it("기본 입력 묶음이 대상 월 12월과 첫 화요일 팀을 갖고 있다", () => {
    expect(sampleInput.month).toBe("2026-12");
    expect(sampleInput.firstTuesdayTeam).toBe("A");
    expect(weekdayOf("2026-12-01")).toBe(2); // 12/1은 화요일
  });

  it("변형 ①: 12/8 화요일에 일하는 B팀 전원이 휴가다", () => {
    const working = sampleInputTeamAbsent.employees.filter(
      (e) => e.team === "B" && (!e.startDate || e.startDate <= "2026-12-08"),
    );
    expect(working.length).toBeGreaterThan(0);
    for (const employee of working) {
      expect(
        sampleInputTeamAbsent.leaves.some(
          (l) => l.name === employee.name && l.date === "2026-12-08",
        ),
      ).toBe(true);
    }
    // 기본 데이터에는 12/8에 쉬는 B팀 직원이 없다 (변형이 기본 데이터를 바꾸지 않았다).
    const teamB = new Set(
      sampleEmployees.filter((e) => e.team === "B").map((e) => e.name),
    );
    expect(
      sampleInput.leaves.some((l) => l.date === "2026-12-08" && teamB.has(l.name)),
    ).toBe(false);
  });

  it("변형 ②: 12/15 화요일이 공휴일이다", () => {
    expect(weekdayOf("2026-12-15")).toBe(2);
    expect(sampleInputTuesdayHoliday.holidays).toContain("2026-12-15");
    expect(sampleInput.holidays).not.toContain("2026-12-15");
  });
});
