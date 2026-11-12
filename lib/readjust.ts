// Design Ref: §7 재조정 (nice, 작업 16) — 직접 고친 날짜는 그대로 두고 나머지만 AI가 다시 맞춘다.
// Plan SC: 작업 16. 서버(API)는 이미 fixedAssignments를 받는다. 여기서는 화면 쪽 계산만 한다.
//
// 이 파일의 함수는 모두 순수 함수라 AI 없이 시험할 수 있다.

import { changeAssignment } from "./edit";
import type { Assignment, DateString, ScheduleDraft } from "./types";

/** 서버에 "이 날은 이 사람 그대로 두라"고 알리는 항목 */
export interface FixedAssignment {
  date: DateString;
  name: string;
}

/** 지정자가 직접 고친 내용을 두 갈래로 나눈 것 */
export interface Edits {
  /** AI가 정한 날을 다른 사람으로 바꾼 것 → 다시 맞출 때 서버에 "고정"으로 보낸다 */
  fixed: FixedAssignment[];
  /** 원래 배정 불가였던 날에 사람을 직접 지정한 것 → AI는 이 날을 비워 두므로, 새 결과 위에 다시 얹는다 */
  manual: FixedAssignment[];
}

/**
 * AI의 첫 초안(draft)과 지금 당번표(current)를 견줘서 지정자가 고친 내용을 찾는다.
 * 사람을 빼서 비워 둔 날(name이 null)은 고정할 사람이 없으므로 여기에 넣지 않는다.
 */
export function collectEdits(draft: ScheduleDraft, current: Assignment[]): Edits {
  const originalOf = new Map(draft.assignments.map((entry) => [entry.date, entry]));
  const edits: Edits = { fixed: [], manual: [] };
  for (const entry of current) {
    if (entry.name === null) continue;
    const original = originalOf.get(entry.date);
    if (entry.manual) {
      edits.manual.push({ date: entry.date, name: entry.name });
    } else if (original && original.name !== entry.name) {
      edits.fixed.push({ date: entry.date, name: entry.name });
    }
  }
  return edits;
}

/**
 * 다시 맞춘 AI 초안에 지정자의 고침을 확실히 반영한 당번표를 만든다.
 * - 고정한 날은 AI가 어떻게 답했든 고정한 사람으로 덮어쓴다 (서버도 검사하지만 한 번 더 지킨다).
 * - 직접 지정한 칸은 새 초안 위에 다시 얹는다 (원래 배정 불가였던 날이면 manual 표시가 붙는다).
 */
export function applyEdits(draft: ScheduleDraft, edits: Edits): Assignment[] {
  let result = draft.assignments;
  for (const { date, name } of [...edits.fixed, ...edits.manual]) {
    result = changeAssignment(draft.assignments, result, date, name);
  }
  return result;
}
