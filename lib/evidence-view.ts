// Design Ref: §2 ⑦ 근거 표 — 직원별 근거 숫자를 화면에 보여 줄 글자로 바꾼다.
// Plan SC: 작업 13 — 이번 달 횟수 / 화요일 팀 순번 / 지난달 횟수 / 비교 제외 사유 / 설명.
//
// 숫자는 모두 lib/evidence.ts(buildEvidence)가 당번표에서 직접 센 값이다. 여기서는 글자로 꾸미기만 한다.
// 그래서 당번표와 근거 표의 숫자가 어긋나지 않는다 (SC-5).

import { buildEvidence } from "./evidence";
import { shortDate } from "./format";
import type { Assignment, ScheduleInput } from "./types";

/** 값이 없을 때 칸에 보여 줄 글자 */
export const EMPTY_CELL = "-";

/** 근거 표의 한 줄 (화면에 보여 줄 글자) */
export interface EvidenceDisplayRow {
  name: string;
  /** 이번 달 당번 횟수. 예: "3회" */
  countText: string;
  /** 맡은 화요일 날짜와 팀. 예: "12/1 (A팀)", 여러 번이면 쉼표로 이어 붙인다. 없으면 "-" */
  tuesdayText: string;
  /** 지난달 당번 횟수. 지난달 당번표를 넣지 않았으면 "-" */
  previousText: string;
  /** 비교 제외 사유. 해당하지 않으면 "-" */
  excludedText: string;
  /** 총 횟수 차이 비교에서 빠지는 직원인가 */
  excluded: boolean;
  /** AI가 쓴 설명. 없으면 "-" */
  description: string;
}

/**
 * 당번표에서 근거 표의 줄들을 만든다 (명단 순서).
 * 당번자를 바꿀 때마다 다시 부르면 표의 숫자가 항상 현재 당번표와 맞는다.
 */
export function buildEvidenceView(
  input: ScheduleInput,
  assignments: Assignment[],
  descriptions: { name: string; text: string }[] = [],
): EvidenceDisplayRow[] {
  return buildEvidence(input, assignments, descriptions).map((row) => ({
    name: row.name,
    countText: `${row.count}회`,
    tuesdayText:
      row.tuesdays.length > 0
        ? row.tuesdays.map((duty) => `${shortDate(duty.date)} (${duty.team}팀)`).join(", ")
        : EMPTY_CELL,
    previousText: row.previousCount === null ? EMPTY_CELL : `${row.previousCount}회`,
    excludedText: row.excludedReason ?? EMPTY_CELL,
    excluded: row.excludedReason !== null,
    description: row.description.trim() === "" ? EMPTY_CELL : row.description,
  }));
}
