// Design Ref: §6 — 모든 작업이 함께 쓰는 데이터 모양.
// Plan SC: 작업 1 — 직원·휴가·당번표·검사 결과를 어떤 칸으로 다룰지 정한다.
//
// 날짜는 항상 "YYYY-MM-DD" 글자로 다룬다 (예: "2026-12-01").
// 이렇게 하면 시간대(타임존) 때문에 하루가 밀리는 실수를 막을 수 있다.

/** 날짜 글자. 형식: "YYYY-MM-DD" */
export type DateString = string;

/** 대상 월 글자. 형식: "YYYY-MM" */
export type MonthString = string;

/** 팀은 3개로 고정한다 (PRD 6번 범위). */
export const TEAMS = ["A", "B", "C"] as const;
export type Team = (typeof TEAMS)[number];

// ───────────── 입력 ─────────────

/** 직원 한 명. 근무 시작일·종료일은 달 중간 입사·퇴사자만 적는다. */
export interface Employee {
  name: string;
  team: Team;
  /** 유연근무자는 금요일에 배정하지 않는다. */
  flexWork: boolean;
  /** 근무 시작일 (선택) */
  startDate?: DateString;
  /** 근무 종료일 (선택) */
  endDate?: DateString;
}

/** 휴가·출장 하루치. 기간으로 입력해도 하루씩 풀어서 담는다. 사유는 받지 않는다. */
export interface Leave {
  name: string;
  date: DateString;
}

/** 지난달 당번표 한 줄. 지난달 당번 횟수를 세는 데만 쓴다. */
export interface PastDuty {
  date: DateString;
  name: string;
}

/** "당번표 만들기"에 필요한 입력 전체 */
export interface ScheduleInput {
  month: MonthString;
  employees: Employee[];
  leaves: Leave[];
  /** 당번 지정자가 직접 입력한 공휴일 */
  holidays: DateString[];
  /** 이번 달 첫 화요일(공휴일이 아닌 첫 화요일)을 맡을 팀 */
  firstTuesdayTeam: Team;
  /** 지난달 당번표 (선택) */
  previousSchedule?: PastDuty[];
}

// ───────────── 당번표 ─────────────

/** 날짜 하나의 배정 결과 */
export interface Assignment {
  date: DateString;
  /** 당번자 이름. 없으면(null) "배정 불가 날짜" */
  name: string | null;
  /** 배정 불가일 때의 이유 */
  unassignableReason?: string;
  /** 배정 불가 날짜에 당번 지정자가 직접 넣은 칸이면 true ("지정자 직접 지정") */
  manual?: boolean;
}

// ───────────── 규칙 검사 ─────────────

/** must ①의 규칙 이름표. 한글 설명은 RULE_LABELS에 있다. */
export const RULE_IDS = [
  "weekday-only", // 평일에만 배정
  "no-leave", // 휴가·출장일에 배정 금지
  "work-period", // 근무 기간 안에서만 배정
  "one-per-day", // 하루 정확히 1명
  "tuesday-team", // 화요일은 그 주 담당 팀원만
  "flex-friday", // 유연근무자는 금요일 금지
  "no-consecutive", // 이틀 연속 금지
  "balance", // 총 횟수 차이 최대 2회
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** 규칙 이름표를 화면에 보여 줄 한글 설명 */
export const RULE_LABELS: Record<RuleId, string> = {
  "weekday-only": "평일에만 배정",
  "no-leave": "휴가·출장일에 배정 금지",
  "work-period": "근무 기간 안에서만 배정",
  "one-per-day": "하루 정확히 1명",
  "tuesday-team": "화요일은 그 주 담당 팀원만",
  "flex-friday": "유연근무자는 금요일 금지",
  "no-consecutive": "이틀 연속 금지",
  balance: "총 횟수 차이 최대 2회",
};

/** 규칙 위반 한 건 */
export interface Violation {
  /** 위반한 날짜. 횟수 차이 같은 한 달 전체 규칙이면 없다. */
  date?: DateString;
  rule: RuleId;
  /** 화면에 보여 줄 설명 */
  message: string;
}

// ───────────── 근거 표 ─────────────

/** 비교 제외 사유 (총 횟수 차이 계산에서 빠지는 직원) */
export type ExcludeReason = "중간 입사" | "중간 퇴사" | "장기 휴가";

/** 직원이 맡은 화요일 하나 */
export interface TuesdayDuty {
  date: DateString;
  team: Team;
}

/** 배정 근거 표의 한 줄. 설명만 AI가 쓰고 나머지는 프로그램이 센다. */
export interface EvidenceRow {
  name: string;
  /** 이번 달 당번 횟수 */
  count: number;
  /** 이 직원이 맡은 화요일 날짜와 팀 (없으면 빈 목록) */
  tuesdays: TuesdayDuty[];
  /** 지난달 당번 횟수. 지난달 당번표를 넣지 않았으면 null ("-"로 표시) */
  previousCount: number | null;
  /** 비교 제외 사유. 해당하지 않으면 null */
  excludedReason: ExcludeReason | null;
  /** AI가 쓴 설명. 한 문장, 50자 이내, 숫자·날짜 금지 */
  description: string;
}

// ───────────── AI 응답 ─────────────

/** 서버 API가 AI에게서 받는 답의 모양 (DESIGN §4.3) */
export interface ScheduleDraft {
  assignments: Assignment[];
  descriptions: { name: string; text: string }[];
}
