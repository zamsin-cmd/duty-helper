import { describe, expect, it } from "vitest";
import {
  sampleInput,
  sampleInputTeamAbsent,
  sampleInputTuesdayHoliday,
} from "../data/sample";
import { buildCalendar, weekdaysOfMonth } from "./calendar";

/** 화요일 결과를 "날짜:팀:상태" 글자 목록으로 줄여서 비교하기 쉽게 한다. */
function summary(input: Parameters<typeof buildCalendar>[0]): string[] {
  return buildCalendar(input).tuesdays.map(
    (slot) => `${slot.date.slice(5)} ${slot.team ?? "-"} ${slot.status}`,
  );
}

// 작업 3: 평일 목록과 화요일 담당 팀 계산
describe("평일 목록 (weekdaysOfMonth)", () => {
  it("2026년 12월은 평일이 23일이고 12/1(화)부터 12/31(목)까지다", () => {
    const days = weekdaysOfMonth("2026-12");
    expect(days).toHaveLength(23);
    expect(days[0]).toBe("2026-12-01");
    expect(days[days.length - 1]).toBe("2026-12-31");
  });

  it("주말은 들어 있지 않다", () => {
    expect(weekdaysOfMonth("2026-12")).not.toContain("2026-12-05"); // 토
    expect(weekdaysOfMonth("2026-12")).not.toContain("2026-12-06"); // 일
  });

  it("28일인 2월(2026-02)은 평일이 20일이다", () => {
    expect(weekdaysOfMonth("2026-02")).toHaveLength(20);
  });

  it("윤년 2월(2028-02)도 29일까지 올바르게 센다", () => {
    const days = weekdaysOfMonth("2028-02");
    expect(days).toHaveLength(21);
    expect(days[days.length - 1]).toBe("2028-02-29");
  });

  it("대상 월 형식이 틀리면 알기 쉬운 오류를 낸다", () => {
    expect(() => weekdaysOfMonth("2026-13")).toThrow("대상 월 형식");
    expect(() => weekdaysOfMonth("2026/12")).toThrow("대상 월 형식");
    expect(() => weekdaysOfMonth("")).toThrow("대상 월 형식");
  });
});

describe("근무일 (buildCalendar.workDays)", () => {
  it("공휴일(12/25)을 빼면 근무일은 22일이다", () => {
    const calendar = buildCalendar(sampleInput);
    expect(calendar.weekdays).toHaveLength(23);
    expect(calendar.workDays).toHaveLength(22);
    expect(calendar.workDays).not.toContain("2026-12-25");
  });
});

describe("화요일 담당 팀 (buildCalendar.tuesdays)", () => {
  it("기본: A → B → C → A → B 순서로 돌아간다", () => {
    expect(summary(sampleInput)).toEqual([
      "12-01 A ok",
      "12-08 B ok",
      "12-15 C ok",
      "12-22 A ok",
      "12-29 B ok",
    ]);
  });

  it("화요일이 공휴일이면 그 순번을 다음 주로 미룬다", () => {
    // 12/15는 C팀 차례였는데 공휴일 → 12/22에 같은 C팀이 맡는다.
    expect(summary(sampleInputTuesdayHoliday)).toEqual([
      "12-01 A ok",
      "12-08 B ok",
      "12-15 - holiday",
      "12-22 C ok",
      "12-29 A ok",
    ]);
  });

  it("담당 팀 전원이 부재하면 배정 불가로 표시하고 순번을 미룬다", () => {
    // 12/8은 B팀 차례인데 일하는 B팀 전원이 휴가 → 12/15에 같은 B팀이 맡는다.
    expect(summary(sampleInputTeamAbsent)).toEqual([
      "12-01 A ok",
      "12-08 B all-absent",
      "12-15 B ok",
      "12-22 C ok",
      "12-29 A ok",
    ]);
  });

  it("첫 화요일이 공휴일이면 공휴일이 아닌 첫 화요일이 첫 팀을 맡는다", () => {
    const input = { ...sampleInput, holidays: [...sampleInput.holidays, "2026-12-01"] };
    expect(summary(input).slice(0, 3)).toEqual([
      "12-01 - holiday",
      "12-08 A ok",
      "12-15 B ok",
    ]);
  });

  it("지정자가 고른 첫 화요일 팀부터 시작한다", () => {
    const input = { ...sampleInput, firstTuesdayTeam: "C" as const };
    expect(summary(input).slice(0, 3)).toEqual([
      "12-01 C ok",
      "12-08 A ok",
      "12-15 B ok",
    ]);
  });

  it("아직 입사 전인 직원은 일하는 사람으로 세지 않는다", () => {
    // 12/8에 B팀의 정OO·강OO·윤OO가 쉬면, 12/15 입사 예정인 조OO가 있어도 12/8은 전원 부재다.
    const calendar = buildCalendar(sampleInputTeamAbsent);
    expect(calendar.tuesdays[1].status).toBe("all-absent");
  });

  it("퇴사 후의 직원은 일하는 사람으로 세지 않는다", () => {
    // C팀에 한OO(12/18 퇴사) 한 명만 남기고, 퇴사 뒤 C팀 차례가 오면 전원 부재가 되는지 본다.
    const onlyLeaver = {
      ...sampleInput,
      employees: sampleInput.employees.filter(
        (e) => e.team !== "C" || e.name === "한OO",
      ),
      holidays: [] as string[],
      firstTuesdayTeam: "C" as const,
    };
    // 12/1(화) C팀은 한OO가 일하므로 ok → 이후 12/22는 다시 C팀 차례지만 한OO는 퇴사해서 전원 부재다.
    const slots = buildCalendar(onlyLeaver).tuesdays;
    expect(slots[0]).toMatchObject({ date: "2026-12-01", team: "C", status: "ok" });
    const dec22 = slots.find((s) => s.date === "2026-12-22");
    expect(dec22?.status).toBe("all-absent");
  });
});
