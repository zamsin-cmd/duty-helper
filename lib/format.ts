// 화면에 보여 줄 글자를 만드는 작은 도구. 당번표 표와 근거 표가 함께 쓴다.

import type { DateString } from "./types";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-12-01" → "화" (요일 한 글자) */
export function weekdayLabel(date: DateString): string {
  return WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** "2026-12-01" → "12/1" */
export function shortDate(date: DateString): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}
