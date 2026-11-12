// Design Ref: §3 ③ 배정 가능표 — 날짜별로 그날 설 수 있는 사람을 미리 고르고, AI에 보낼 요청을 만든다.
// Plan SC: 작업 11 — AI가 달력과 규칙을 틀리게 세지 않도록, 프로그램이 계산한 답안지를 준다 (DESIGN §1 원칙 2).
//
// AI가 하는 일은 "후보 중에서 골라 고르게 나누기"뿐이다. 휴가·근무 기간·유연근무(금요일)·화요일 팀 조건은
// 여기서 이미 반영되므로, AI가 이 조건을 어길 수 없다.

import { buildCalendar } from "./calendar";
import { excludedReasonOf } from "./rules";
import type { ScheduleRequest } from "./schemas";
import type { DateString, Employee, ScheduleInput } from "./types";

/** 그날 이 직원이 일할 수 있는가: 근무 기간 안이고, 휴가가 아니고, 유연근무자는 금요일이 아니다. */
function canWork(employee: Employee, date: DateString, leaveKeys: Set<string>): boolean {
  if (employee.startDate && date < employee.startDate) return false;
  if (employee.endDate && date > employee.endDate) return false;
  if (leaveKeys.has(`${employee.name}|${date}`)) return false;
  const isFriday = new Date(`${date}T00:00:00Z`).getUTCDay() === 5;
  return !(employee.flexWork && isFriday);
}

/**
 * 입력(ScheduleInput)을 AI에 보낼 요청(ScheduleRequest)으로 바꾼다.
 *
 * - weekdays: 근무일 (평일에서 공휴일을 뺀 날)
 * - candidates: 날짜별 후보 명단. 화요일은 그 주 담당 팀원만 후보다.
 * - unassignable: 후보가 한 명도 없어 미리 "배정 불가"로 정한 날과 이유
 *   (화요일 담당 팀 전원 부재 포함). 이런 날은 candidates에 넣지 않는다.
 * - balanceTargets: 총 횟수 차이를 맞출 직원 (비교 제외 직원을 뺀 것)
 */
export function buildScheduleRequest(input: ScheduleInput): ScheduleRequest {
  const calendar = buildCalendar(input);
  const tuesdayByDate = new Map(calendar.tuesdays.map((slot) => [slot.date, slot]));
  const leaveKeys = new Set(input.leaves.map((leave) => `${leave.name}|${leave.date}`));

  const candidates: Record<DateString, string[]> = {};
  const unassignable: { date: DateString; reason: string }[] = [];

  for (const date of calendar.workDays) {
    const slot = tuesdayByDate.get(date);

    if (slot?.status === "all-absent") {
      unassignable.push({
        date,
        reason: `${slot.team}팀 전원 부재 (이 화요일은 ${slot.team}팀 차례)`,
      });
      continue;
    }

    const names = input.employees
      .filter((employee) => canWork(employee, date, leaveKeys))
      .filter((employee) => !slot?.team || employee.team === slot.team)
      .map((employee) => employee.name);

    if (names.length === 0) {
      unassignable.push({
        date,
        reason: "배정할 수 있는 직원이 없습니다 (휴가·근무 기간·유연근무 조건)",
      });
    } else {
      candidates[date] = names;
    }
  }

  return {
    month: input.month,
    weekdays: calendar.workDays,
    candidates,
    unassignable,
    employees: input.employees.map(({ name, team, flexWork }) => ({ name, team, flexWork })),
    balanceTargets: input.employees
      .filter((employee) => excludedReasonOf(input, employee, calendar) === null)
      .map((employee) => employee.name),
  };
}
