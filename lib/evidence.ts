// Design Ref: §3 ⑤ 지난달 횟수, §10 evidence.ts — 근거 표에 보여 줄 숫자를 프로그램이 센다.
// Plan SC: 작업 7 — 붙여넣은 지난달 당번표에서 직원별 당번 횟수를 센다.
//
// 작업 8(근거 숫자 계산)도 이 파일에 이어서 채웠다: buildEvidence.

import { buildCalendar } from "./calendar";
import { excludedReasonOf } from "./rules";
import type {
  Assignment,
  Employee,
  EvidenceRow,
  PastDuty,
  ScheduleInput,
  TuesdayDuty,
} from "./types";

/**
 * 지난달 당번 횟수를 직원별로 센다.
 *
 * - 지난달 당번표를 넣지 않았으면(없거나 비어 있으면) null을 돌려준다 → 근거 표에 "-"로 보인다.
 * - 당번표를 넣었으면 명단의 모든 직원이 들어 있다. 한 번도 안 선 직원은 0이다.
 * - 명단에 없는 이름은 세지 않는다.
 *
 * 이 숫자는 참고용으로 표시만 하며 이번 달 배정에는 반영하지 않는다 (PRD 5번).
 */
export function countPastDuties(
  previous: PastDuty[] | undefined,
  employees: Employee[],
): Map<string, number> | null {
  if (!previous || previous.length === 0) return null;

  const counts = new Map(employees.map((employee) => [employee.name, 0]));
  for (const { name } of previous) {
    const current = counts.get(name);
    if (current !== undefined) counts.set(name, current + 1);
  }
  return counts;
}

/**
 * 배정 근거 표의 줄(직원 한 명당 한 줄)을 계산한다. 명단 순서대로 돌려준다.
 *
 * 숫자는 모두 프로그램이 당번표에서 직접 센다 (SC-5: 표의 숫자는 실제 당번표와 100% 일치).
 * AI가 쓰는 것은 설명 문장뿐이며, 설명이 없으면 빈 글자다.
 *
 * - count: 이번 달 당번 횟수. "지정자 직접 지정" 칸도 센다. 이름이 없는(배정 불가) 칸은 세지 않는다.
 * - tuesdays: 이 직원이 맡은 화요일의 날짜와 그날 담당 팀 (날짜 순서). 공휴일 화요일은 담당 팀이 없어 뺀다.
 * - previousCount: 지난달 당번표를 넣지 않았으면 null ("-"로 표시).
 * - excludedReason: 총 횟수 차이 비교에서 빠지는 사유. 해당하지 않으면 null.
 *
 * 당번자를 직접 바꿀 때마다 이 함수를 다시 부르면 숫자가 항상 현재 당번표와 맞는다.
 */
export function buildEvidence(
  input: ScheduleInput,
  assignments: Assignment[],
  descriptions: { name: string; text: string }[] = [],
): EvidenceRow[] {
  const calendar = buildCalendar(input);
  const tuesdayTeamByDate = new Map(
    calendar.tuesdays.flatMap((slot) => (slot.team ? [[slot.date, slot.team] as const] : [])),
  );
  const previousCounts = countPastDuties(input.previousSchedule, input.employees);
  const descriptionByName = new Map(descriptions.map((item) => [item.name, item.text]));

  return input.employees.map((employee) => {
    const duties = assignments.filter((assignment) => assignment.name === employee.name);

    const tuesdays: TuesdayDuty[] = duties
      .flatMap((duty) => {
        const team = tuesdayTeamByDate.get(duty.date);
        return team ? [{ date: duty.date, team }] : [];
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return {
      name: employee.name,
      count: duties.length,
      tuesdays,
      previousCount: previousCounts?.get(employee.name) ?? null,
      excludedReason: excludedReasonOf(input, employee, calendar),
      description: descriptionByName.get(employee.name) ?? "",
    };
  });
}
