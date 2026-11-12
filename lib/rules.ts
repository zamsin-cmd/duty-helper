// Design Ref: §3 ⑥ 규칙 검사 — AI가 만든 당번표를 프로그램이 must ① 규칙대로 다시 검사한다.
// Plan SC: 작업 4 / SC-2(휴가 겹침 0건), SC-3(총 횟수 차이 최대 2회), SC-4(규칙 위반 표시).
//
// 검사기는 위반을 "찾아서 알려 주기만" 한다. 당번표를 고치지는 않는다.

import { buildCalendar, type CalendarResult } from "./calendar";
import {
  RULE_IDS,
  type Assignment,
  type DateString,
  type Employee,
  type ExcludeReason,
  type RuleId,
  type ScheduleInput,
  type Violation,
} from "./types";

/** 직원 간 총 당번 횟수 차이의 허용 한도 (PRD 5번) */
const MAX_COUNT_GAP = 2;

/**
 * 총 횟수 차이 비교에서 빠지는 직원의 사유를 돌려준다. 해당하지 않으면 null.
 *
 * - 중간 입사 / 중간 퇴사: 근무 기간이 대상 월의 근무일 전체를 덮지 않는다.
 * - 장기 휴가: 휴가·출장 일수(근무일 기준)가 그 달 근무일 수의 절반 이상이다.
 *
 * 여기서 "평일"은 주말과 공휴일을 뺀 날(근무일)이다. 작업 8(근거 숫자 계산)도 이 함수를 쓴다.
 */
export function excludedReasonOf(
  input: ScheduleInput,
  employee: Employee,
  calendar: CalendarResult = buildCalendar(input),
): ExcludeReason | null {
  const { workDays } = calendar;
  if (workDays.length === 0) return null;

  if (employee.startDate && employee.startDate > workDays[0]) return "중간 입사";
  if (employee.endDate && employee.endDate < workDays[workDays.length - 1]) return "중간 퇴사";

  const workDaySet = new Set(workDays);
  const leaveDays = new Set(
    input.leaves
      .filter((leave) => leave.name === employee.name && workDaySet.has(leave.date))
      .map((leave) => leave.date),
  ).size;
  if (leaveDays * 2 >= workDays.length) return "장기 휴가";

  return null;
}

/** 위반 목록을 날짜 순서로, 같은 날이면 규칙 순서로 정렬한다. 날짜 없는 전체 규칙은 맨 뒤. */
function sortViolations(violations: Violation[]): Violation[] {
  return [...violations].sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === undefined) return 1;
      if (b.date === undefined) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return RULE_IDS.indexOf(a.rule) - RULE_IDS.indexOf(b.rule);
  });
}

/**
 * 당번표를 must ①의 규칙 8개로 검사해 위반 목록을 돌려준다. 위반이 없으면 빈 목록이다.
 *
 * 예외 (PRD 5번):
 * - 이름이 없는(null) 날은 "배정 불가 날짜"이며 위반이 아니다.
 * - `manual`이 true인 칸("지정자 직접 지정")은 위반으로 세지 않는다.
 *   연속 배정 검사에서도 이 칸이 낀 짝은 건너뛴다. 단, 횟수에는 센다.
 * - 명단에 없는 이름은 평가할 수 없어 "work-period" 위반으로 알린다.
 */
export function checkSchedule(input: ScheduleInput, assignments: Assignment[]): Violation[] {
  const calendar = buildCalendar(input);
  const workDaySet = new Set(calendar.workDays);
  const holidaySet = new Set(input.holidays);
  const tuesdayByDate = new Map(calendar.tuesdays.map((slot) => [slot.date, slot]));
  const employeeByName = new Map(input.employees.map((e) => [e.name, e]));
  const leaveKeys = new Set(input.leaves.map((l) => `${l.name}|${l.date}`));

  const violations: Violation[] = [];
  const report = (rule: RuleId, date: DateString | undefined, message: string) => {
    violations.push({ rule, date, message });
  };

  const entriesByDate = new Map<DateString, Assignment[]>();
  for (const assignment of assignments) {
    const list = entriesByDate.get(assignment.date) ?? [];
    list.push(assignment);
    entriesByDate.set(assignment.date, list);
  }

  // ── 칸 하나씩 검사: 평일 / 휴가 / 근무 기간 / 화요일 팀 / 유연근무 금요일 ──
  for (const { date, name, manual } of assignments) {
    if (name === null || manual) continue;

    const employee = employeeByName.get(name);
    if (!employee) {
      report("work-period", date, `${name}: 명단에 없는 이름입니다`);
      continue;
    }

    if (!workDaySet.has(date)) {
      report(
        "weekday-only",
        date,
        holidaySet.has(date)
          ? `${name}: 공휴일에는 배정할 수 없습니다`
          : `${name}: 평일이 아닌 날(주말 또는 대상 월 밖)에는 배정할 수 없습니다`,
      );
      continue;
    }

    if (leaveKeys.has(`${name}|${date}`)) {
      report("no-leave", date, `${name}: 휴가·출장일에는 배정할 수 없습니다`);
    }

    if (
      (employee.startDate && date < employee.startDate) ||
      (employee.endDate && date > employee.endDate)
    ) {
      report("work-period", date, `${name}: 근무 기간 밖입니다`);
    }

    const tuesday = tuesdayByDate.get(date);
    if (tuesday?.team && employee.team !== tuesday.team) {
      report(
        "tuesday-team",
        date,
        `${name}: 이 화요일은 ${tuesday.team}팀 차례인데 ${employee.team}팀입니다`,
      );
    }

    if (employee.flexWork && new Date(`${date}T00:00:00Z`).getUTCDay() === 5) {
      report("flex-friday", date, `${name}: 유연근무자는 금요일에 배정할 수 없습니다`);
    }
  }

  // ── 하루 정확히 1명: 근무일마다 당번 칸이 하나여야 한다 ──
  for (const date of calendar.workDays) {
    const entries = entriesByDate.get(date) ?? [];
    const named = entries.filter((entry) => entry.name !== null);
    if (entries.length === 0) {
      report("one-per-day", date, "당번이 배정되지 않았습니다 (배정 불가라면 이름을 비우고 이유를 적어야 합니다)");
    } else if (named.length > 1) {
      report("one-per-day", date, `하루 당번은 정확히 1명이어야 하는데 ${named.length}명입니다`);
    }
  }

  // ── 이틀 연속 금지: 근무일 순서에서 바로 이어지는 날(금→월, 공휴일 건너뛴 날 포함) ──
  const dutyOf = (date: DateString): Assignment | null => {
    const named = (entriesByDate.get(date) ?? []).filter((entry) => entry.name !== null);
    return named.length === 1 ? named[0] : null;
  };
  for (let i = 1; i < calendar.workDays.length; i++) {
    const previous = dutyOf(calendar.workDays[i - 1]);
    const current = dutyOf(calendar.workDays[i]);
    if (!previous || !current || previous.manual || current.manual) continue;
    if (previous.name === current.name) {
      report("no-consecutive", current.date, `${current.name}: 바로 앞 근무일에도 배정되어 이틀 연속입니다`);
    }
  }

  // ── 총 횟수 차이: 비교 제외 직원을 뺀 나머지끼리 최대 2회 (한 달 전체 규칙이라 날짜가 없다) ──
  const counts = new Map<string, number>();
  for (const { name } of assignments) {
    if (name !== null && employeeByName.has(name)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const compared = input.employees
    .filter((employee) => excludedReasonOf(input, employee, calendar) === null)
    .map((employee) => ({ name: employee.name, count: counts.get(employee.name) ?? 0 }));
  if (compared.length >= 2) {
    const most = compared.reduce((a, b) => (b.count > a.count ? b : a));
    const least = compared.reduce((a, b) => (b.count < a.count ? b : a));
    if (most.count - least.count > MAX_COUNT_GAP) {
      report(
        "balance",
        undefined,
        `직원 간 총 당번 횟수 차이가 ${most.count - least.count}회입니다 ` +
          `(가장 많음 ${most.name} ${most.count}회, 가장 적음 ${least.name} ${least.count}회)`,
      );
    }
  }

  return sortViolations(violations);
}
