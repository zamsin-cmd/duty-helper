import { describe, expect, it } from "vitest";
import { buildScheduleRequest } from "./candidates";
import { buildCalendar, weekdaysOfMonth } from "./calendar";
import { weekdaysInRange } from "./parse";
import { checkSchedule } from "./rules";
import {
  TEAMS,
  type Employee,
  type Leave,
  type RuleId,
  type ScheduleInput,
} from "./types";

// 작업 18: 후보 명단(candidates.ts)과 규칙 검사기(rules.ts)는 따로 만든 코드다.
// AI는 후보 중에서만 고르므로, "후보인 사람 = 그 날 규칙을 어기지 않는 사람"이어야 AI가 이 규칙들을 어길 수 없다.
// 무작위 입력으로 이 약속이 모든 경우에 맞는지 확인한다.

/** 칸 하나만 보고 판단할 수 있는 규칙들 (연속·횟수 균형·하루 1명은 여러 칸이 필요해서 제외) */
const CELL_RULES: RuleId[] = ["weekday-only", "no-leave", "work-period", "tuesday-team", "flex-friday"];

/** 같은 숫자 씨앗이면 같은 무작위 수열을 내는 간단한 난수 (시험이 매번 같은 결과를 내게) */
function seeded(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number) => Math.floor(next() * max); // 0 이상 max 미만
  const pick = <T>(list: readonly T[]): T => list[int(list.length)];
  return { next, int, pick };
}

const MONTHS = ["2026-12", "2027-02", "2026-09", "2028-02", "2026-05"];

function randomInput(seed: number): ScheduleInput {
  const r = seeded(seed);
  const month = r.pick(MONTHS);
  const weekdays = weekdaysOfMonth(month);

  const employees: Employee[] = Array.from({ length: 5 + r.int(8) }, (_, i) => {
    const employee: Employee = {
      name: `직원${i + 1}`,
      team: r.pick(TEAMS),
      flexWork: r.next() < 0.35,
    };
    if (r.next() < 0.25) employee.startDate = r.pick(weekdays);
    if (r.next() < 0.25) employee.endDate = r.pick(weekdays);
    return employee;
  });

  const leaves: Leave[] = [];
  for (const employee of employees) {
    for (let n = r.int(3); n > 0; n--) {
      const start = r.int(weekdays.length);
      const end = Math.min(weekdays.length - 1, start + r.int(5));
      for (const date of weekdaysInRange(weekdays[start], weekdays[end])) {
        leaves.push({ name: employee.name, date });
      }
    }
  }

  return {
    month,
    employees,
    leaves,
    holidays: Array.from({ length: r.int(3) }, () => r.pick(weekdays)),
    firstTuesdayTeam: r.pick(TEAMS),
  };
}

describe("후보 명단과 규칙 검사기의 일치 (무작위 입력)", () => {
  it("모든 날짜·모든 직원에 대해 '후보인가'와 '그 날 혼자 배정해도 위반이 없는가'가 같다", () => {
    const mismatches: string[] = [];
    let cells = 0;

    for (let seed = 1; seed <= 40; seed++) {
      const input = randomInput(seed);
      const request = buildScheduleRequest(input);
      const { workDays } = buildCalendar(input);

      for (const date of workDays) {
        const candidates = new Set(request.candidates[date] ?? []);
        for (const employee of input.employees) {
          cells++;
          const violations = checkSchedule(input, [{ date, name: employee.name }]).filter(
            (v) => v.date === date && CELL_RULES.includes(v.rule),
          );
          const allowedByRules = violations.length === 0;
          if (allowedByRules !== candidates.has(employee.name)) {
            mismatches.push(
              `seed ${seed} ${date} ${employee.name}: 후보=${candidates.has(employee.name)}, ` +
                `규칙 위반=${violations.map((v) => v.rule).join(",") || "없음"}`,
            );
          }
        }
      }
    }

    expect(cells).toBeGreaterThan(5000); // 시험이 충분히 많은 경우를 돌았는지
    expect(mismatches.slice(0, 5)).toEqual([]);
  }, 60_000);

  it("후보가 하나도 없는 날은 정확히 '배정 불가 날짜'로 정해진다 (후보가 있는 날은 배정 불가에 없다)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const input = randomInput(seed);
      const request = buildScheduleRequest(input);
      const unassignable = new Set(request.unassignable.map((u) => u.date));
      for (const date of request.weekdays) {
        const hasCandidates = (request.candidates[date] ?? []).length > 0;
        expect(unassignable.has(date), `seed ${seed} ${date}`).toBe(!hasCandidates);
      }
    }
  });

  it("요청의 근무일은 달력의 근무일과 같고, 공휴일은 들어 있지 않다", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const input = randomInput(seed);
      const request = buildScheduleRequest(input);
      expect(request.weekdays).toEqual(buildCalendar(input).workDays);
      for (const holiday of input.holidays) expect(request.weekdays).not.toContain(holiday);
    }
  });
});
