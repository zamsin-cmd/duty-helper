// Design Ref: §3 ② 달력 계산 — 대상 월의 평일 목록과 주별 화요일 담당 팀을 구한다.
// Plan SC: 작업 3 — 화요일이 공휴일이거나 담당 팀 전원이 부재하면 순번을 미룬다.
//
// 날짜는 모두 "YYYY-MM-DD" 글자이고, 요일 계산은 UTC로 한다 (시간대 때문에 하루가 밀리지 않게).

import { TEAMS, type DateString, type MonthString, type ScheduleInput, type Team } from "./types";

/** 화요일 하나의 결과 상태 */
export type TuesdayStatus =
  | "ok" // 담당 팀이 정해졌고 일할 수 있는 팀원이 있다
  | "holiday" // 공휴일이라 당번이 없다 (순번은 다음 화요일로 미뤄진다)
  | "all-absent"; // 담당 팀원이 모두 쉬거나 근무 기간 밖이다 → 배정 불가 날짜 (순번은 미뤄진다)

/** 한 달의 화요일 한 칸 */
export interface TuesdaySlot {
  date: DateString;
  /** 그날 담당 팀. 공휴일이면 null */
  team: Team | null;
  status: TuesdayStatus;
}

export interface CalendarResult {
  month: MonthString;
  /** 주말을 뺀 모든 평일 (공휴일 포함) */
  weekdays: DateString[];
  /** 당번을 설 수 있는 날: 평일에서 공휴일을 뺀 날 */
  workDays: DateString[];
  /** 한 달의 모든 화요일과 담당 팀 */
  tuesdays: TuesdaySlot[];
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 날짜 글자의 요일 (0=일, 1=월, ... 6=토) */
function weekdayOf(date: DateString): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** 대상 월의 모든 평일(월~금)을 날짜 순서대로 돌려준다. 공휴일은 빼지 않는다. */
export function weekdaysOfMonth(month: MonthString): DateString[] {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error(`대상 월 형식이 올바르지 않습니다: "${month}" (예: 2026-12)`);
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  const result: DateString[] = [];
  const cursor = new Date(Date.UTC(year, monthNumber - 1, 1));
  while (cursor.getUTCMonth() === monthNumber - 1) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      result.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/** 다음 순번의 팀 (A → B → C → A) */
function nextTeam(team: Team): Team {
  return TEAMS[(TEAMS.indexOf(team) + 1) % TEAMS.length];
}

/** 그날 그 팀에서 실제로 일할 수 있는 사람이 한 명이라도 있는가 (근무 기간 안이고 휴가가 아님) */
function teamHasWorker(input: ScheduleInput, team: Team, date: DateString): boolean {
  return input.employees.some(
    (employee) =>
      employee.team === team &&
      (!employee.startDate || employee.startDate <= date) &&
      (!employee.endDate || date <= employee.endDate) &&
      !input.leaves.some((leave) => leave.name === employee.name && leave.date === date),
  );
}

/**
 * 대상 월의 평일 목록과 화요일 담당 팀을 계산한다.
 *
 * 화요일 규칙 (PRD 5번):
 * - 첫 화요일 팀은 "공휴일이 아닌 첫 화요일"이 맡는다.
 * - 팀은 A → B → C → A 순서로 돌아간다.
 * - 화요일이 공휴일이면 그 순번은 다음 주 화요일로 미룬다 (같은 팀이 맡는다).
 * - 담당 팀원이 모두 부재하면 그날은 "배정 불가 날짜"이고, 순번은 다음 주 화요일로 미룬다.
 */
export function buildCalendar(input: ScheduleInput): CalendarResult {
  const holidays = new Set(input.holidays);
  const weekdays = weekdaysOfMonth(input.month);
  const workDays = weekdays.filter((date) => !holidays.has(date));

  const tuesdays: TuesdaySlot[] = [];
  let turn: Team = input.firstTuesdayTeam;

  for (const date of weekdays.filter((day) => weekdayOf(day) === 2)) {
    if (holidays.has(date)) {
      tuesdays.push({ date, team: null, status: "holiday" });
    } else if (!teamHasWorker(input, turn, date)) {
      tuesdays.push({ date, team: turn, status: "all-absent" });
    } else {
      tuesdays.push({ date, team: turn, status: "ok" });
      turn = nextTeam(turn);
    }
  }

  return { month: input.month, weekdays, workDays, tuesdays };
}

/** 대상 월의 지난달 ("2026-12" → "2026-11", "2026-01" → "2025-12") */
export function previousMonthOf(month: MonthString): MonthString {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error(`대상 월 형식이 올바르지 않습니다: "${month}" (예: 2026-12)`);
  }
  const previous = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 2, 1));
  return previous.toISOString().slice(0, 7);
}
