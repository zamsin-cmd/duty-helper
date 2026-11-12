// 시험 전용: AI("당번지정")를 대신하는 단순한 프로그램.
// Plan SC: 작업 18 — 진짜 AI(키·사용료가 필요)를 부르지 않고도 "붙여넣기 → 후보 → 당번표 → 검사 → 표"
// 전체 흐름을 시험하려고, 서버가 AI에게 보내는 요청(ScheduleRequest)을 받아 같은 모양의 답(ScheduleDraft)을 만든다.
//
// 진짜 AI보다 단순하다: 날짜 순서대로, 후보 중에서 (1) 바로 앞날 당번이 아니고
// (2) 횟수 균형 대상을 먼저, (3) 지금까지 가장 적게 선 사람을 고른다. 같은 입력이면 항상 같은 답이다.
// 이 프로그램은 앱 화면이나 서버에서 쓰이지 않는다. 시험에서만 불러 쓴다.

import type { ScheduleRequest } from "../lib/schemas";
import type { Assignment, ScheduleDraft } from "../lib/types";

export function fakeSchedule(request: ScheduleRequest): ScheduleDraft {
  const rosterOrder = new Map(request.employees.map((employee, index) => [employee.name, index]));
  const counts = new Map(request.employees.map((employee) => [employee.name, 0]));
  const balanceTargets = new Set(request.balanceTargets);
  const unassignableReason = new Map(request.unassignable.map((item) => [item.date, item.reason]));
  const fixed = new Map((request.fixedAssignments ?? []).map((item) => [item.date, item.name]));

  const assignments: Assignment[] = [];
  let previous: string | null = null; // 바로 앞 근무일의 당번자

  for (const date of request.weekdays) {
    const reason = unassignableReason.get(date);
    if (reason !== undefined) {
      assignments.push({ date, name: null, unassignableReason: reason });
      previous = null;
      continue;
    }

    const fixedName = fixed.get(date);
    let pick: string | null;
    if (fixedName !== undefined) {
      pick = fixedName;
    } else {
      const options = (request.candidates[date] ?? []).filter((name) => name !== previous);
      options.sort(
        (a, b) =>
          Number(!balanceTargets.has(a)) - Number(!balanceTargets.has(b)) ||
          (counts.get(a) ?? 0) - (counts.get(b) ?? 0) ||
          (rosterOrder.get(a) ?? 0) - (rosterOrder.get(b) ?? 0),
      );
      pick = options[0] ?? null;
    }

    if (pick === null) {
      assignments.push({
        date,
        name: null,
        unassignableReason: "연속 배정을 피하면 배정할 수 있는 직원이 없습니다",
      });
      previous = null;
    } else {
      assignments.push({ date, name: pick });
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
      previous = pick;
    }
  }

  return {
    assignments,
    // 숫자·날짜가 없는 설명 (PRD 5번 must ②)
    descriptions: request.employees.map((employee) => ({
      name: employee.name,
      text: "고르게 나누어 배정되었습니다",
    })),
  };
}
