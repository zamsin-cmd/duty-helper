// Design Ref: §2 ⑤ 당번자 드롭다운 — 당번 지정자가 날짜별 당번자를 직접 바꾼다.
// Plan SC: 작업 14 — 바꾸면 규칙 검사와 근거 숫자를 바로 다시 계산한다 (계산은 화면이 다시 그릴 때 한다).
//
// 이 파일은 "당번표를 어떻게 바꾸는가"만 정한다. 검사·계산은 lib/rules.ts, lib/evidence.ts가 하고,
// 바뀐 당번표를 그쪽에 다시 넘기면 표와 근거 숫자가 항상 현재 당번표와 맞는다.

import type { Assignment, DateString } from "./types";

/** 당번 지정자가 배정 불가 날짜를 직접 비웠을 때(원래 배정 불가가 아니던 날) 남기는 이유 */
export const MANUAL_CLEAR_REASON = "당번 지정자가 비웠습니다";

/**
 * 날짜 하나의 당번자를 바꾼 새 당번표를 돌려준다. 원래 당번표는 바꾸지 않는다.
 *
 * - original: AI가 처음 돌려준 당번표 (어느 날이 원래 "배정 불가 날짜"였는지 알기 위해 필요하다)
 * - current: 지금까지 바꾼 결과를 담은 당번표
 * - name: 새 당번자. null이면 그 날을 배정 불가로 비운다.
 *
 * 규칙 (PRD 5번):
 * - 원래 배정 불가였던 날에 사람을 넣으면 "지정자 직접 지정"(manual)이다. 위반으로 세지 않는다.
 *   그 날을 다시 비우면 AI가 준 원래 배정 불가 칸(이유 포함)으로 돌아간다.
 * - 그 밖의 날에 다른 사람을 넣으면 보통 배정이다. 규칙을 어기면 규칙 검사기가 위반으로 알린다.
 * - 같은 날짜 칸이 여러 개이거나 아예 없었어도, 바꾼 뒤에는 그 날짜에 칸이 하나만 있다.
 */
export function changeAssignment(
  original: Assignment[],
  current: Assignment[],
  date: DateString,
  name: string | null,
): Assignment[] {
  const originalEntry = original.find((entry) => entry.date === date);
  const wasUnassignable = originalEntry !== undefined && originalEntry.name === null;

  let next: Assignment;
  if (name === null) {
    next = wasUnassignable
      ? { date, name: null, unassignableReason: originalEntry.unassignableReason }
      : { date, name: null, unassignableReason: MANUAL_CLEAR_REASON };
  } else {
    next = wasUnassignable ? { date, name, manual: true } : { date, name };
  }

  const firstIndex = current.findIndex((entry) => entry.date === date);
  const others = current.filter((entry) => entry.date !== date);
  if (firstIndex === -1) return [...others, next];
  // 원래 자리에 넣는다 (앞에서 같은 날짜 칸이 지워져도 순서가 흐트러지지 않게)
  const insertAt = current.slice(0, firstIndex).filter((entry) => entry.date !== date).length;
  return [...others.slice(0, insertAt), next, ...others.slice(insertAt)];
}
