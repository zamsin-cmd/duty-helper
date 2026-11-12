// Design Ref: §10 — 가상 예시 데이터. 달력 계산·규칙 검사기·화면 확인에 쓰는 시험 재료.
// Plan SC: 작업 2 — 3개 팀, 유연근무자, 휴가자, 중간 입사·퇴사자, 공휴일, 지난달 당번표.
//
// 모든 이름은 가명이다 (PRD 7번: 실습에는 가상 데이터만 쓴다).
// 대상 월은 2026년 12월이다. 2026-12-01은 화요일이고, 평일은 23일,
// 공휴일(12/25)을 빼면 근무일은 22일이다.

import type {
  DateString,
  Employee,
  Leave,
  PastDuty,
  ScheduleInput,
} from "../lib/types";

/** 시작일부터 종료일까지의 평일(월~금) 날짜 목록을 만든다. 휴가를 하루씩 풀 때 쓴다. */
function weekdaysBetween(start: DateString, end: DateString): DateString[] {
  const result: DateString[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const day = cursor.getUTCDay(); // 0=일, 6=토
    if (day !== 0 && day !== 6) {
      result.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/** 한 사람의 휴가를 날짜별 한 줄씩으로 만든다. */
function leaveOf(name: string, start: DateString, end: DateString = start): Leave[] {
  return weekdaysBetween(start, end).map((date) => ({ name, date }));
}

// ───────────── 직원 12명 (팀별 4명) ─────────────

export const sampleEmployees: Employee[] = [
  // A팀
  { name: "김OO", team: "A", flexWork: false },
  { name: "이OO", team: "A", flexWork: false },
  { name: "박OO", team: "A", flexWork: true }, // 유연근무자 (금요일 배정 금지)
  { name: "최OO", team: "A", flexWork: false },
  // B팀
  { name: "정OO", team: "B", flexWork: false },
  { name: "강OO", team: "B", flexWork: true }, // 유연근무자
  { name: "조OO", team: "B", flexWork: false, startDate: "2026-12-15" }, // 달 중간 입사
  { name: "윤OO", team: "B", flexWork: false },
  // C팀
  { name: "장OO", team: "C", flexWork: false },
  { name: "임OO", team: "C", flexWork: true }, // 유연근무자
  { name: "한OO", team: "C", flexWork: false, endDate: "2026-12-18" }, // 달 중간 퇴사
  { name: "오OO", team: "C", flexWork: false }, // 장기 휴가자 (아래 휴가 참고)
];

// ───────────── 휴가·출장 (사유는 받지 않는다) ─────────────

export const sampleLeaves: Leave[] = [
  ...leaveOf("김OO", "2026-12-10"),
  ...leaveOf("이OO", "2026-12-14", "2026-12-15"),
  ...leaveOf("임OO", "2026-12-03"),
  ...leaveOf("정OO", "2026-12-22"),
  ...leaveOf("최OO", "2026-12-29"),
  // 오OO: 12/7~12/21 평일 11일 → 근무일 22일의 절반 이상이라 "장기 휴가"로 본다.
  ...leaveOf("오OO", "2026-12-07", "2026-12-21"),
];

// ───────────── 공휴일 (당번 지정자가 직접 입력한다) ─────────────

export const sampleHolidays: DateString[] = ["2026-12-25"]; // 금요일

// ───────────── 지난달(2026-11) 당번표 ─────────────
// 지난달 당번 횟수를 세는 용도라서 이번 달 규칙을 지킬 필요는 없다.
// 11월 평일 21일을 이번 달에 이미 근무 중인 11명(조OO 제외)이 돌아가며 맡은 것으로 만든다.

const lastMonthWorkers = sampleEmployees
  .map((employee) => employee.name)
  .filter((name) => name !== "조OO");

export const samplePreviousSchedule: PastDuty[] = [
  ...weekdaysBetween("2026-11-01", "2026-11-30"),
].map((date, index) => ({
  date,
  name: lastMonthWorkers[index % lastMonthWorkers.length],
}));

// ───────────── 입력 묶음 ─────────────

/** 기본 시험 데이터. 위의 모든 상황(유연근무, 휴가, 중간 입사·퇴사, 장기 휴가, 공휴일)이 들어 있다. */
export const sampleInput: ScheduleInput = {
  month: "2026-12",
  employees: sampleEmployees,
  leaves: sampleLeaves,
  holidays: sampleHolidays,
  firstTuesdayTeam: "A", // 12/1 A팀 → 12/8 B팀 → 12/15 C팀 → 12/22 A팀 → 12/29 B팀
  previousSchedule: samplePreviousSchedule,
};

/**
 * 시험용 변형 ① — 화요일 팀 전원 부재.
 * 12/8(화)은 B팀 차례인데, 그날 일하는 B팀 전원이 휴가를 간다.
 */
export const sampleInputTeamAbsent: ScheduleInput = {
  ...sampleInput,
  leaves: [
    ...sampleLeaves,
    ...leaveOf("정OO", "2026-12-08"),
    ...leaveOf("강OO", "2026-12-08"),
    ...leaveOf("윤OO", "2026-12-08"),
  ],
};

/**
 * 시험용 변형 ② — 화요일이 공휴일.
 * 12/15(화)을 공휴일로 바꿔서, 그 주 순번이 다음 주로 미뤄지는지 확인한다.
 */
export const sampleInputTuesdayHoliday: ScheduleInput = {
  ...sampleInput,
  holidays: [...sampleHolidays, "2026-12-15"],
};
