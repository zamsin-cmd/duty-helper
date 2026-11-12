// Design Ref: §3 ① 입력 해석, §6 붙여넣기 형식 — 엑셀에서 복사한 글을 데이터로 바꾼다.
// Plan SC: 작업 5 — 잘못된 줄은 줄 번호와 이유를 알려 준다 (화면 ③ 입력 오류 안내).
//
// 엑셀에서 복사하면 칸 사이가 탭으로 구분된다. 탭이 없는 줄은 공백으로 나눈다.

import { previousMonthOf } from "./calendar";
import {
  TEAMS,
  type DateString,
  type Employee,
  type Leave,
  type MonthString,
  type PastDuty,
  type Team,
} from "./types";

/** 해석하지 못한 줄 하나. 화면에는 "3번째 줄: …"처럼 보여 준다. */
export interface ParseError {
  /** 붙여넣은 글에서의 줄 번호 (1부터, 빈 줄도 센다) */
  line: number;
  message: string;
  /** 오류의 종류. 같은 종류를 화면에서 묶어 보여 줄 때 쓴다 (선택) */
  kind?: "unknown-name";
  /** kind가 "unknown-name"일 때 명단에 없던 이름 */
  name?: string;
}

/** 해석 결과: 읽은 항목과 읽지 못한 줄의 오류. 오류가 있는 줄은 항목에 들어가지 않는다. */
export interface ParseResult<T> {
  items: T[];
  errors: ParseError[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" 형식이고 실제로 있는 날짜인가 (2026-02-30, 2026-13-01은 아니다) */
export function isValidDate(value: string): value is DateString {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 붙여넣은 글을 줄 단위로 나눈다. 줄 번호를 지키기 위해 빈 줄도 남겨 둔다. */
export function splitLines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r?\n/);
}

/** 한 줄을 칸으로 나눈다. 탭이 있으면 탭으로, 없으면 공백으로 나누고, 끝쪽 빈 칸은 버린다. */
export function splitCells(line: string): string[] {
  const cells = (line.includes("\t") ? line.split("\t") : line.trim().split(/\s+/)).map((cell) =>
    cell.trim(),
  );
  while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/**
 * 붙여넣은 글에서 내용이 있는 줄만 골라 칸으로 나눠 넘겨 준다.
 * - 빈 줄은 건너뛰되 줄 번호에는 센다.
 * - 첫 내용 줄의 첫 칸이 headerWord이면 제목 줄로 보고 건너뛴다.
 */
function forEachContentLine(
  text: string,
  headerWord: string,
  callback: (cells: string[], line: number) => void,
): void {
  let sawContent = false;
  splitLines(text).forEach((rawLine, index) => {
    if (rawLine.trim() === "") return;
    const cells = splitCells(rawLine);
    const isFirstContentLine = !sawContent;
    sawContent = true;
    if (isFirstContentLine && cells[0] === headerWord) return;
    callback(cells, index + 1);
  });
}

/** 팀 칸을 A/B/C로 바꾼다. "a", "A팀"도 받아 준다. 알 수 없으면 null. */
function toTeam(cell: string): Team | null {
  const normalized = cell.replace(/팀$/, "").toUpperCase();
  return (TEAMS as readonly string[]).includes(normalized) ? (normalized as Team) : null;
}

/** 직원 명단 한 줄을 읽는다. 문제마다 오류 메시지를 모아서 돌려준다. */
function parseEmployeeLine(cells: string[]): { employee?: Employee; problems: string[] } {
  if (cells.length < 3 || cells.length > 5) {
    return {
      problems: [
        `칸이 3~5개여야 합니다 (이름 / 팀 / 유연근무 / 시작일 / 종료일). 지금은 ${cells.length}개입니다`,
      ],
    };
  }

  const [name, teamCell, flexCell, startCell = "", endCell = ""] = cells;
  const problems: string[] = [];

  if (name === "") problems.push("이름이 비어 있습니다");

  const team = toTeam(teamCell);
  if (team === null) problems.push(`팀 이름이 A/B/C가 아닙니다: "${teamCell}"`);

  const flex = flexCell.toUpperCase();
  if (flex !== "O" && flex !== "X") {
    problems.push(`유연근무 칸은 O 또는 X여야 합니다: "${flexCell}"`);
  }

  if (startCell !== "" && !isValidDate(startCell)) {
    problems.push(`시작일이 날짜(YYYY-MM-DD)가 아닙니다: "${startCell}"`);
  }
  if (endCell !== "" && !isValidDate(endCell)) {
    problems.push(`종료일이 날짜(YYYY-MM-DD)가 아닙니다: "${endCell}"`);
  }
  if (isValidDate(startCell) && isValidDate(endCell) && startCell > endCell) {
    problems.push(`시작일(${startCell})이 종료일(${endCell})보다 늦습니다`);
  }

  if (problems.length > 0 || team === null) return { problems };

  const employee: Employee = { name, team, flexWork: flex === "O" };
  if (startCell !== "") employee.startDate = startCell;
  if (endCell !== "") employee.endDate = endCell;
  return { employee, problems };
}

/**
 * 붙여넣은 직원 명단을 읽는다.
 *
 * 열 순서: 이름 / 팀(A·B·C) / 유연근무(O·X) / 시작일(선택) / 종료일(선택)
 * - 첫 줄이 제목 줄("이름 …")이면 건너뛴다.
 * - 빈 줄은 건너뛰지만 줄 번호에는 센다.
 * - 같은 이름이 두 번 나오면 뒤의 줄을 오류로 알린다 (이름으로 직원을 구분하기 때문).
 */
export function parseEmployees(text: string): ParseResult<Employee> {
  const items: Employee[] = [];
  const errors: ParseError[] = [];
  const firstLineOf = new Map<string, number>();
  forEachContentLine(text, "이름", (cells, line) => {
    const { employee, problems } = parseEmployeeLine(cells);
    if (employee) {
      const firstLine = firstLineOf.get(employee.name);
      if (firstLine !== undefined) {
        errors.push({
          line,
          message: `이미 ${firstLine}번째 줄에 나온 이름입니다: "${employee.name}"`,
        });
        return;
      }
      firstLineOf.set(employee.name, line);
      items.push(employee);
      return;
    }
    for (const message of problems) errors.push({ line, message });
  });

  return { items, errors };
}

// ───────────── 휴가·출장 / 공휴일 (작업 6) ─────────────

/** 휴가·출장 한 줄에 쓸 수 있는 가장 긴 기간(일). 잘못 입력한 아주 긴 기간을 막는다. */
const MAX_LEAVE_SPAN_DAYS = 366;

/** 시작일부터 종료일까지의 평일(월~금)을 날짜 순서로 돌려준다. 두 날짜는 올바른 날짜여야 한다. */
export function weekdaysInRange(start: DateString, end: DateString): DateString[] {
  const result: DateString[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const day = cursor.getUTCDay(); // 0=일, 6=토
    if (day !== 0 && day !== 6) result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/** 휴가·출장 한 줄을 읽어 하루씩 푼 날짜 목록으로 바꾼다. */
function parseLeaveLine(
  cells: string[],
  knownNames: Set<string>,
): { name?: string; dates?: DateString[]; problems: string[] } {
  if (cells.length < 2 || cells.length > 3) {
    return {
      problems: [
        `칸이 2~3개여야 합니다 (이름 / 시작일 / 종료일, 하루면 종료일 생략). 지금은 ${cells.length}개입니다`,
      ],
    };
  }

  const [name, startCell, endCell = ""] = cells;
  const problems: string[] = [];

  if (name === "") problems.push("이름이 비어 있습니다");
  else if (!knownNames.has(name)) problems.push(`명단에 없는 이름입니다: "${name}"`);

  if (!isValidDate(startCell)) problems.push(`시작일이 날짜(YYYY-MM-DD)가 아닙니다: "${startCell}"`);
  if (endCell !== "" && !isValidDate(endCell)) {
    problems.push(`종료일이 날짜(YYYY-MM-DD)가 아닙니다: "${endCell}"`);
  }
  if (problems.length > 0) return { problems };

  const end = endCell === "" ? startCell : endCell;
  if (startCell > end) {
    return { problems: [`시작일(${startCell})이 종료일(${end})보다 늦습니다`] };
  }
  const spanDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${startCell}T00:00:00Z`)) / 86_400_000 + 1;
  if (spanDays > MAX_LEAVE_SPAN_DAYS) {
    return { problems: [`기간이 너무 깁니다 (최대 ${MAX_LEAVE_SPAN_DAYS}일): ${startCell} ~ ${end}`] };
  }

  const dates = weekdaysInRange(startCell, end);
  if (dates.length === 0) {
    return { problems: [`평일이 하나도 없는 기간입니다: ${startCell} ~ ${end}`] };
  }
  return { name, dates, problems };
}

/**
 * 붙여넣은 휴가·출장 일정을 하루씩 푼 목록으로 읽는다. 사유는 받지 않는다.
 *
 * 열 순서: 이름 / 시작일 / 종료일(하루면 생략)
 * - 기간은 평일(월~금)만 하루씩 푼다. 주말은 어차피 당번이 없다.
 * - 명단(employees)에 없는 이름은 오류로 알리고 그 줄은 읽지 않는다.
 * - 같은 사람의 같은 날이 겹쳐 나오면 한 번만 담는다.
 */
export function parseLeaves(text: string, employees: Employee[]): ParseResult<Leave> {
  const items: Leave[] = [];
  const errors: ParseError[] = [];
  const knownNames = new Set(employees.map((employee) => employee.name));
  const seen = new Set<string>();

  forEachContentLine(text, "이름", (cells, line) => {
    const { name, dates, problems } = parseLeaveLine(cells, knownNames);
    if (name === undefined || dates === undefined) {
      for (const message of problems) errors.push({ line, message });
      return;
    }
    for (const date of dates) {
      const key = `${name}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name, date });
    }
  });

  return { items, errors };
}

/**
 * 붙여넣은 공휴일을 날짜 목록으로 읽는다.
 *
 * 줄마다 날짜 하나(YYYY-MM-DD). 첫 줄이 "날짜"이면 제목 줄로 보고 건너뛴다.
 * 한 줄에 날짜가 둘 이상이거나 메모가 붙어 있으면 오류로 알린다 (조용히 무시하면 날짜를 놓칠 수 있어서).
 * 같은 날짜가 겹치면 한 번만 담는다.
 */
export function parseHolidays(text: string): ParseResult<DateString> {
  const items: DateString[] = [];
  const errors: ParseError[] = [];
  const seen = new Set<DateString>();

  forEachContentLine(text, "날짜", (cells, line) => {
    if (cells.length !== 1) {
      errors.push({ line, message: `한 줄에 날짜 하나만 적어 주세요. 지금은 ${cells.length}칸입니다` });
      return;
    }
    const [date] = cells;
    if (!isValidDate(date)) {
      errors.push({ line, message: `날짜(YYYY-MM-DD)가 아닙니다: "${date}"` });
      return;
    }
    if (seen.has(date)) return;
    seen.add(date);
    items.push(date);
  });

  return { items, errors };
}

// ───────────── 지난달 당번표 (작업 7) ─────────────

/**
 * 붙여넣은 지난달 당번표를 읽는다. 지난달 당번 횟수를 세는 데만 쓴다.
 *
 * 열 순서: 날짜 / 이름 (두 번째 칸 뒤의 칸은 비고로 보고 무시한다)
 * - 이름 칸이 비어 있는 날(배정 불가였던 날)은 당번이 없는 날로 보고 조용히 건너뛴다.
 * - 첫 줄이 "날짜"로 시작하면 제목 줄로 보고 건너뛴다.
 * - 명단(employees)에 없는 이름은 오류로 알린다. 퇴사자라면 무시해도 되도록 안내문을 붙인다.
 * - month(이번 달)를 주면, 지난달 날짜가 아닌 줄을 오류로 알린다 (달을 잘못 붙여넣은 실수를 잡는다).
 */
export function parsePreviousSchedule(
  text: string,
  employees: Employee[],
  month?: MonthString,
): ParseResult<PastDuty> {
  const items: PastDuty[] = [];
  const errors: ParseError[] = [];
  const knownNames = new Set(employees.map((employee) => employee.name));
  const expectedMonth = month === undefined ? undefined : previousMonthOf(month);

  forEachContentLine(text, "날짜", (cells, line) => {
    const [date, name = ""] = cells;
    if (!isValidDate(date)) {
      errors.push({ line, message: `날짜(YYYY-MM-DD)가 아닙니다: "${date}"` });
      return;
    }
    if (expectedMonth !== undefined && !date.startsWith(expectedMonth)) {
      errors.push({ line, message: `지난달(${expectedMonth}) 날짜가 아닙니다: "${date}"` });
      return;
    }
    if (name === "") return; // 당번이 없던 날
    if (!knownNames.has(name)) {
      errors.push({
        line,
        message: `명단에 없는 이름입니다: "${name}" (이번 달에 없는 퇴사자라면 무시해도 됩니다)`,
        kind: "unknown-name",
        name,
      });
      return;
    }
    items.push({ date, name });
  });

  return { items, errors };
}
