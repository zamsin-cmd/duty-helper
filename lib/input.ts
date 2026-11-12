// Design Ref: §2 ②③ 입력칸과 입력 오류 안내, §3 ① 입력 해석.
// Plan SC: 작업 9 — 입력칸 4개의 글을 읽어, 화면에 보여 줄 오류 목록과 당번표 입력 묶음을 만든다.
//
// 화면(컴포넌트)은 이 함수의 결과를 그대로 보여 주기만 한다. 그래서 브라우저 없이 시험할 수 있다.

import { weekdaysOfMonth } from "./calendar";
import {
  parseEmployees,
  parseHolidays,
  parseLeaves,
  parsePreviousSchedule,
  type ParseError,
} from "./parse";
import { TEAMS, type MonthString, type ScheduleInput, type Team } from "./types";

/** 입력 화면의 입력칸 구역 */
export type InputSection = "month" | "employees" | "leaves" | "holidays" | "previous";

/** 구역을 화면에 보여 줄 이름 (오류 안내 앞에 붙인다) */
export const SECTION_LABELS: Record<InputSection, string> = {
  month: "대상 월",
  employees: "직원 명단",
  leaves: "휴가·출장",
  holidays: "공휴일",
  previous: "지난달 당번표",
};

/** 입력 화면 하나가 가진 글과 선택값 전부 */
export interface RawInput {
  /** "YYYY-MM". 아직 고르지 않았으면 빈 글자 */
  month: string;
  employeesText: string;
  leavesText: string;
  holidaysText: string;
  previousText: string;
  firstTuesdayTeam: Team;
}

/**
 * 입력 오류 안내 한 건.
 * - error: 당번표를 만들 수 없다 (버튼이 막힌다)
 * - warning: 참고로 알리지만 당번표는 만들 수 있다
 */
export interface InputIssue {
  section: InputSection;
  /** 붙여넣은 글의 줄 번호. 줄 하나가 아니라 구역 전체에 대한 안내면 없다 */
  line?: number;
  message: string;
  level: "error" | "warning";
}

export interface InputResult {
  /** 오류가 없을 때만 있다. 있으면 "당번표 만들기"를 눌러도 된다 */
  input: ScheduleInput | null;
  issues: InputIssue[];
  /** 입력 확인용 개수 */
  summary: {
    employees: number;
    leaveDays: number;
    holidays: number;
    previousDuties: number;
  };
}

const SECTION_ORDER: InputSection[] = ["month", "employees", "leaves", "holidays", "previous"];

/** 해석 오류를 화면용 안내로 바꾼다 */
function toIssues(
  section: InputSection,
  errors: ParseError[],
  level: InputIssue["level"],
): InputIssue[] {
  return errors.map((error) => ({ section, line: error.line, message: error.message, level }));
}

/** 날짜가 대상 월 안에 있는가 */
const inMonth = (date: string, month: MonthString): boolean => date.startsWith(`${month}-`);

/**
 * 입력 화면의 글을 읽어 안내와 당번표 입력 묶음을 만든다.
 *
 * - 대상 월, 직원 명단, 휴가·출장, 공휴일의 문제는 error다 (이 줄들이 조용히 빠지면 휴가에 배정될 수 있다).
 * - 지난달 당번표의 문제는 warning이다. 참고용 횟수에만 쓰이고, 퇴사자 이름처럼 무시해도 되는 경우가 많다.
 * - 직원 명단이 비어 있거나 오류뿐이면 휴가·지난달 당번표는 명단과 비교할 수 없어 읽지 않는다.
 */
export function buildScheduleInput(raw: RawInput): InputResult {
  const issues: InputIssue[] = [];

  // 대상 월
  let monthValid = true;
  try {
    weekdaysOfMonth(raw.month);
  } catch {
    monthValid = false;
    issues.push({
      section: "month",
      message: "대상 월을 선택해 주세요 (예: 2026-12)",
      level: "error",
    });
  }

  // 직원 명단
  const employees = parseEmployees(raw.employeesText);
  issues.push(...toIssues("employees", employees.errors, "error"));
  if (employees.items.length === 0 && employees.errors.length === 0) {
    issues.push({ section: "employees", message: "직원 명단이 비어 있습니다", level: "error" });
  }
  if (employees.items.length > 0) {
    for (const team of TEAMS) {
      if (!employees.items.some((employee) => employee.team === team)) {
        issues.push({
          section: "employees",
          message: `${team}팀 직원이 한 명도 없습니다. ${team}팀 화요일은 계속 배정 불가 날짜가 됩니다`,
          level: "warning",
        });
      }
    }
  }

  // 휴가·출장, 지난달 당번표는 명단이 있어야 이름을 확인할 수 있다
  const hasRoster = employees.items.length > 0;
  const leaves = hasRoster ? parseLeaves(raw.leavesText, employees.items) : { items: [], errors: [] };
  issues.push(...toIssues("leaves", leaves.errors, "error"));

  const holidays = parseHolidays(raw.holidaysText);
  issues.push(...toIssues("holidays", holidays.errors, "error"));

  const previous = hasRoster
    ? parsePreviousSchedule(raw.previousText, employees.items, monthValid ? raw.month : undefined)
    : { items: [], errors: [] };
  // 지난달 당번표에서 명단에 없는 이름(대개 퇴사자)은 줄마다 알리면 너무 많아지므로 한 건으로 묶는다.
  const unknownNameErrors = previous.errors.filter((error) => error.kind === "unknown-name");
  issues.push(
    ...toIssues(
      "previous",
      previous.errors.filter((error) => error.kind !== "unknown-name"),
      "warning",
    ),
  );
  if (unknownNameErrors.length > 0) {
    const names = [...new Set(unknownNameErrors.map((error) => error.name))];
    issues.push({
      section: "previous",
      message:
        `명단에 없는 이름 ${names.length}명(${names.join(", ")})이 ${unknownNameErrors.length}줄에 나옵니다. ` +
        "이번 달에 없는 퇴사자라면 무시해도 됩니다 (그 줄은 지난달 횟수에서 빠집니다)",
      level: "warning",
    });
  }

  // 대상 월 밖의 날짜는 반영되지 않는다는 점을 알려 준다
  if (monthValid) {
    const outsideLeaves = leaves.items.filter((leave) => !inMonth(leave.date, raw.month)).length;
    if (outsideLeaves > 0) {
      issues.push({
        section: "leaves",
        message: `대상 월(${raw.month}) 밖의 휴가·출장 ${outsideLeaves}일은 사용되지 않습니다`,
        level: "warning",
      });
    }
    const outsideHolidays = holidays.items.filter((date) => !inMonth(date, raw.month)).length;
    if (outsideHolidays > 0) {
      issues.push({
        section: "holidays",
        message: `대상 월(${raw.month}) 밖의 공휴일 ${outsideHolidays}일은 사용되지 않습니다`,
        level: "warning",
      });
    }
  }

  issues.sort((a, b) => {
    const bySection = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    if (bySection !== 0) return bySection;
    return (a.line ?? 0) - (b.line ?? 0);
  });

  const hasError = issues.some((issue) => issue.level === "error");
  const input: ScheduleInput | null = hasError
    ? null
    : {
        month: raw.month,
        employees: employees.items,
        leaves: leaves.items,
        holidays: holidays.items,
        firstTuesdayTeam: raw.firstTuesdayTeam,
        previousSchedule: previous.items.length > 0 ? previous.items : undefined,
      };

  return {
    input,
    issues,
    summary: {
      employees: employees.items.length,
      leaveDays: leaves.items.length,
      holidays: holidays.items.length,
      previousDuties: previous.items.length,
    },
  };
}
