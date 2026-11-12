// Design Ref: §2 ⑥ 표 복사 버튼 — 확정한 당번표를 엑셀에 붙여넣을 수 있는 글로 바꾼다.
// Plan SC: 작업 15 (nice) — 칸 사이는 탭이라 엑셀에 붙여넣으면 칸이 나뉜다.
//
// 열 순서는 "날짜 / 이름 / 요일 / 비고"다. 처음 두 열(날짜, 이름)이 입력칸 4번(지난달 당번표)의
// 형식과 같아서, 이번 달에 복사한 표를 다음 달 입력칸에 그대로 붙여넣을 수 있다
// (제목 줄과 세 번째 칸부터는 읽을 때 무시된다: lib/parse.ts의 parsePreviousSchedule).

import { buildCalendar } from "./calendar";
import { weekdayLabel } from "./format";
import type { Assignment, DateString, ScheduleInput } from "./types";

/** 복사하는 글의 제목 줄 */
export const EXPORT_HEADER = ["날짜", "이름", "요일", "비고"].join("\t");

/** 칸 안에 탭이나 줄바꿈이 있으면 엑셀에서 칸이 밀리므로 공백 하나로 바꾼다. */
function clean(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * 당번표를 탭으로 나눈 글로 바꾼다. 근무일(평일에서 공휴일을 뺀 날)마다 한 줄이다.
 *
 * - 당번자가 없는 날(배정 불가)은 이름 칸을 비우고, 비고에 이유를 적는다.
 * - 지정자가 직접 지정한 칸은 비고에 "지정자 직접 지정"이라고 적는다.
 * - 규칙 위반 설명은 넣지 않는다 (화면에서 확인하는 정보이고, 엑셀 표에는 필요 없다).
 */
export function scheduleToText(input: ScheduleInput, assignments: Assignment[]): string {
  const { workDays } = buildCalendar(input);
  const entryOf = new Map<DateString, Assignment[]>();
  for (const assignment of assignments) {
    const list = entryOf.get(assignment.date) ?? [];
    list.push(assignment);
    entryOf.set(assignment.date, list);
  }

  const lines = workDays.map((date) => {
    const entries = entryOf.get(date) ?? [];
    const named = entries.filter((entry) => entry.name !== null);
    const name = named.map((entry) => entry.name).join(", ");

    let note = "";
    if (named.length === 0) {
      note = entries.find((entry) => entry.unassignableReason)?.unassignableReason ?? "";
    } else if (named.some((entry) => entry.manual)) {
      note = "지정자 직접 지정";
    }
    return [date, clean(name), weekdayLabel(date), clean(note)].join("\t");
  });

  return [EXPORT_HEADER, ...lines].join("\n");
}
