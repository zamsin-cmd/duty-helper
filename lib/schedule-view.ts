// Design Ref: §2 ⑤ 당번표, ⑥ 검사 요약 — 당번표를 화면에 그리기 위한 줄(행) 계산.
// Plan SC: 작업 12 — 날짜별 표를 보여 주고, 규칙 위반 칸은 빨간색, "배정 불가 날짜"는 회색으로 표시한다.
//
// 화면 컴포넌트는 이 함수의 결과를 그대로 그리기만 한다. 그래서 브라우저 없이 시험할 수 있다.

import { buildCalendar } from "./calendar";
import { weekdayLabel } from "./format";
import { checkSchedule } from "./rules";
import type { Assignment, DateString, ScheduleInput, Violation } from "./types";

/** 줄의 상태. 화면에서 색과 글자 표시가 달라진다. */
export type RowStatus =
  | "ok" // 규칙을 지킨 배정
  | "violation" // 규칙 위반 (빨간색)
  | "unassignable" // 배정 불가 날짜 (회색)
  | "manual" // 지정자가 직접 지정한 칸 (위반이 아님)
  | "missing"; // 당번 칸이 아예 없음 (빨간색)

/** 표의 한 줄 = 근무일 하루 */
export interface ScheduleRow {
  date: DateString;
  /** 요일 한 글자 (월~금) */
  weekday: string;
  /** 당번자. 배정 불가이거나 없으면 null */
  name: string | null;
  status: RowStatus;
  /** 비고 칸에 줄마다 보여 줄 글 (화요일 담당 팀, 배정 불가 이유, 위반 설명) */
  notes: string[];
}

export interface ScheduleView {
  rows: ScheduleRow[];
  /** 날짜가 없는 한 달 전체 규칙 위반 (총 횟수 차이 등). 표 아래에 따로 보여 준다. */
  overallViolations: Violation[];
  counts: {
    /** 당번자가 정해진 날 */
    assigned: number;
    /** 배정 불가 날짜 */
    unassignable: number;
    /** 규칙 위반 전체 건수 (한 달 전체 규칙 포함) */
    violations: number;
  };
}

/**
 * 당번표와 검사 결과로 표의 줄들을 만든다. 줄은 근무일(평일에서 공휴일을 뺀 날) 순서다.
 *
 * 줄 상태의 우선순위: 규칙 위반 > 배정 불가 > 지정자 직접 지정 > 정상.
 * 위반 설명은 규칙 검사기(lib/rules.ts)가 만든 글을 그대로 비고에 싣는다.
 */
export function buildScheduleView(input: ScheduleInput, assignments: Assignment[]): ScheduleView {
  const calendar = buildCalendar(input);
  const violations = checkSchedule(input, assignments);
  const tuesdayByDate = new Map(calendar.tuesdays.map((slot) => [slot.date, slot]));

  const entriesByDate = new Map<DateString, Assignment[]>();
  for (const assignment of assignments) {
    const list = entriesByDate.get(assignment.date) ?? [];
    list.push(assignment);
    entriesByDate.set(assignment.date, list);
  }

  const rows: ScheduleRow[] = calendar.workDays.map((date) => {
    const entries = entriesByDate.get(date) ?? [];
    const named = entries.filter((entry) => entry.name !== null);
    const dayViolations = violations.filter((violation) => violation.date === date);
    const slot = tuesdayByDate.get(date);

    const notes: string[] = [];
    if (slot?.team) {
      notes.push(slot.status === "all-absent" ? `${slot.team}팀 차례` : `${slot.team}팀 담당`);
    }

    let status: RowStatus;
    if (entries.length === 0) {
      status = "missing";
    } else if (named.length === 0) {
      status = "unassignable";
      notes.push(entries.find((entry) => entry.unassignableReason)?.unassignableReason ?? "이유가 적혀 있지 않습니다");
    } else if (named.some((entry) => entry.manual)) {
      status = "manual";
      notes.push("지정자 직접 지정");
    } else {
      status = "ok";
    }

    if (dayViolations.length > 0) {
      status = entries.length === 0 ? "missing" : "violation";
      notes.push(...dayViolations.map((violation) => violation.message));
    }

    return {
      date,
      weekday: weekdayLabel(date),
      name: named.length > 0 ? named.map((entry) => entry.name).join(", ") : null,
      status,
      notes,
    };
  });

  return {
    rows,
    overallViolations: violations.filter((violation) => violation.date === undefined),
    counts: {
      assigned: rows.filter((row) => row.name !== null).length,
      unassignable: rows.filter((row) => row.status === "unassignable").length,
      violations: violations.length,
    },
  };
}
