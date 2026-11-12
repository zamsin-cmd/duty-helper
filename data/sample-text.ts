// Design Ref: §10 — 가상 예시 데이터를 "붙여넣는 글" 모양으로 바꾼 것.
// Plan SC: 작업 9 — 입력 화면의 "예시 데이터 불러오기" 버튼과 시험이 함께 쓴다.
//
// 엑셀에서 복사한 것처럼 칸 사이는 탭(\t)으로 나눈다.

import { sampleEmployees, sampleHolidays, samplePreviousSchedule } from "./sample";
import type { RawInput } from "../lib/input";

/** 직원 명단 글: 이름 / 팀 / 유연근무(O·X) / 시작일 / 종료일 */
const employeesText = sampleEmployees
  .map((e) => [e.name, e.team, e.flexWork ? "O" : "X", e.startDate ?? "", e.endDate ?? ""].join("\t"))
  .join("\n");

/** 휴가·출장 글: 이름 / 시작일 / 종료일(하루면 생략). sampleLeaves와 같은 내용이다. */
const leavesText = [
  "김OO\t2026-12-10",
  "이OO\t2026-12-14\t2026-12-15",
  "임OO\t2026-12-03",
  "정OO\t2026-12-22",
  "최OO\t2026-12-29",
  "오OO\t2026-12-07\t2026-12-21", // 장기 휴가
].join("\n");

/** 지난달 당번표 글: 날짜 / 이름 */
const previousText = samplePreviousSchedule.map((d) => `${d.date}\t${d.name}`).join("\n");

/** 입력 화면에 한 번에 채워 넣을 수 있는 예시 */
export const sampleRawInput: RawInput = {
  month: "2026-12",
  employeesText,
  leavesText,
  holidaysText: sampleHolidays.join("\n"),
  previousText,
  firstTuesdayTeam: "A",
};
