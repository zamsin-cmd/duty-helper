import { describe, expect, it } from "vitest";
import { fakeSchedule } from "../data/fake-ai";
import { sampleRawInput } from "../data/sample-text";
import { buildCalendar } from "./calendar";
import { buildScheduleRequest } from "./candidates";
import { changeAssignment } from "./edit";
import { buildEvidenceView } from "./evidence-view";
import { scheduleToText } from "./export";
import { checkDraftShape } from "./generate";
import { buildScheduleInput, type RawInput } from "./input";
import { parsePreviousSchedule } from "./parse";
import { checkSchedule } from "./rules";
import { buildScheduleView } from "./schedule-view";
import { scheduleDraftSchema, scheduleRequestSchema } from "./schemas";
import type { Assignment } from "./types";

// 작업 18: DESIGN §9 시험 시나리오를 "붙여넣은 글 → 후보 명단 → (AI 대역) 당번표 → 규칙 검사 → 표 → 근거 표 →
// 편집 → 복사" 전체 흐름으로 돌린다. AI 자리에는 시험용 대역(data/fake-ai.ts)을 둔다.
// 진짜 AI의 품질은 여기서 확인하지 않는다 (키가 필요하다). 확인하는 것은 AI를 뺀 나머지 전부가
// PRD대로 맞물려 동작하는지다.

const raw = (changes: Partial<RawInput> = {}): RawInput => ({ ...sampleRawInput, ...changes });

/** 다음 달 ("2026-12" → "2027-01") */
const nextMonthOf = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
};

/** 입력 글에서 시작해 근거 표까지 전체 흐름을 돌린다. 중간 약속(서버가 받을 모양)도 함께 확인한다. */
function runPipeline(input: RawInput) {
  const built = buildScheduleInput(input);
  expect(built.issues.filter((i) => i.level === "error")).toEqual([]);
  const scheduleInput = built.input;
  if (!scheduleInput) throw new Error("입력이 당번표를 만들 수 있는 상태가 아닙니다");

  const request = buildScheduleRequest(scheduleInput);
  expect(scheduleRequestSchema.safeParse(request).success).toBe(true); // 서버가 받아 줄 요청이다

  const draft = fakeSchedule(request);
  expect(scheduleDraftSchema.safeParse(draft).success).toBe(true); // 서버가 받아 줄 AI 답의 모양이다
  expect(checkDraftShape(request, draft)).toEqual([]);

  return {
    input: scheduleInput,
    request,
    draft,
    violations: checkSchedule(scheduleInput, draft.assignments),
    view: buildScheduleView(scheduleInput, draft.assignments),
    evidence: buildEvidenceView(scheduleInput, draft.assignments, draft.descriptions),
  };
}

type Run = ReturnType<typeof runPipeline>;

/** 어떤 시나리오에서든 항상 지켜져야 하는 약속 */
function expectInvariants(run: Run, assignments: Assignment[] = run.draft.assignments) {
  const { input, request } = run;
  const view = buildScheduleView(input, assignments);
  const evidence = buildEvidenceView(input, assignments, run.draft.descriptions);
  const named = assignments.filter((a) => a.name !== null);

  // (1) 근거 표의 숫자는 당번표와 100% 일치한다 (SC-5)
  expect(evidence.reduce((sum, row) => sum + Number(row.countText.replace("회", "")), 0)).toBe(named.length);
  for (const row of evidence) {
    const own = named.filter((a) => a.name === row.name).length;
    expect(row.countText, `${row.name}의 횟수`).toBe(`${own}회`);
  }

  // (2) 표의 위반 건수는 규칙 검사기와 같다
  expect(view.counts.violations).toBe(checkSchedule(input, assignments).length);

  // (3) 표의 줄은 근무일 순서 그대로이고, 공휴일은 없다
  expect(view.rows.map((r) => r.date)).toEqual(buildCalendar(input).workDays);

  // (4) 복사한 글을 다음 달 "지난달 당번표"로 읽으면 같은 당번표가 나오고 오류가 없다
  const parsed = parsePreviousSchedule(scheduleToText(input, assignments), input.employees, nextMonthOf(input.month));
  expect(parsed.errors).toEqual([]);
  expect(parsed.items).toEqual(named.map(({ date, name }) => ({ date, name })));

  // (5) 후보 밖의 사람이 들어가지 않았다 (AI 대역은 후보만 쓴다. 직접 바꾼 칸은 예외라 제외한다)
  for (const a of run.draft.assignments) {
    if (a.name !== null) expect(request.candidates[a.date], a.date).toContain(a.name);
  }
}

describe("시나리오 1: 기본 (3팀·12명, 휴가 몇 건)", () => {
  const run = runPipeline(sampleRawInput);

  it("위반 0건이고 총 횟수 차이가 2회 이내다", () => {
    expect(run.violations).toEqual([]);
    expect(run.view.counts).toMatchObject({ assigned: 22, unassignable: 0, violations: 0 });
  });

  it("모든 줄이 정상 상태다", () => {
    expect(run.view.rows.every((row) => row.status === "ok")).toBe(true);
  });

  it("전체 흐름의 약속이 모두 지켜진다", () => {
    expectInvariants(run);
  });
});

describe("시나리오 2: 화요일이 공휴일", () => {
  const run = runPipeline(raw({ holidaysText: "2026-12-25\n2026-12-15" }));

  it("12/15는 표에 없고, 그 주의 순번은 다음 주 화요일(12/22)에 같은 C팀이 맡는다", () => {
    expect(run.view.rows.map((r) => r.date)).not.toContain("2026-12-15");
    const tuesdays = buildCalendar(run.input).tuesdays.map((t) => `${t.date.slice(5)} ${t.team ?? "-"} ${t.status}`);
    expect(tuesdays).toEqual([
      "12-01 A ok",
      "12-08 B ok",
      "12-15 - holiday",
      "12-22 C ok",
      "12-29 A ok",
    ]);
  });

  it("12/22에는 C팀 직원이 서고, 근거 표에 'C팀'으로 적힌다", () => {
    const duty = run.draft.assignments.find((a) => a.date === "2026-12-22");
    const cTeam = ["장OO", "임OO", "한OO", "오OO"];
    expect(cTeam).toContain(duty?.name);
    expect(run.evidence.find((r) => r.name === duty?.name)?.tuesdayText).toContain("12/22 (C팀)");
  });

  it("위반 0건이고 전체 흐름의 약속이 지켜진다", () => {
    expect(run.violations).toEqual([]);
    expectInvariants(run);
  });
});

describe("시나리오 3: 화요일 팀 전원 부재", () => {
  // 12/8(화)은 B팀 차례인데, 그날 일하는 B팀 전원(정·강·윤)이 휴가
  const run = runPipeline(
    raw({ leavesText: `${sampleRawInput.leavesText}\n정OO\t2026-12-08\n강OO\t2026-12-08\n윤OO\t2026-12-08` }),
  );

  it("그 화요일은 배정 불가 날짜로 정해지고 이유가 적힌다 (회색 줄)", () => {
    expect(run.request.unassignable).toEqual([
      { date: "2026-12-08", reason: "B팀 전원 부재 (이 화요일은 B팀 차례)" },
    ]);
    const row = run.view.rows.find((r) => r.date === "2026-12-08");
    expect(row).toMatchObject({ name: null, status: "unassignable" });
    expect(row?.notes).toEqual(["B팀 차례", "B팀 전원 부재 (이 화요일은 B팀 차례)"]);
  });

  it("순번이 미뤄져 다음 주 화요일(12/15)은 같은 B팀이 맡는다", () => {
    const duty = run.draft.assignments.find((a) => a.date === "2026-12-15");
    expect(["정OO", "강OO", "조OO", "윤OO"]).toContain(duty?.name);
  });

  it("배정 불가 날짜는 위반이 아니다", () => {
    expect(run.violations).toEqual([]);
    expect(run.view.counts.unassignable).toBe(1);
  });

  it("당번 지정자가 직접 지정하면 '직접 지정'이 되고 위반이 아니며 근거 표에 12/8(B팀)로 적힌다", () => {
    const edited = changeAssignment(run.draft.assignments, run.draft.assignments, "2026-12-08", "이OO");
    const view = buildScheduleView(run.input, edited);
    const row = view.rows.find((r) => r.date === "2026-12-08");
    expect(row).toMatchObject({ name: "이OO", status: "manual" });
    expect(checkSchedule(run.input, edited).filter((v) => v.date === "2026-12-08")).toEqual([]);
    expect(buildEvidenceView(run.input, edited).find((r) => r.name === "이OO")?.tuesdayText).toContain("12/8 (B팀)");
    expectInvariants(run, edited);
  });

  it("직접 지정을 다시 비우면 AI가 준 원래 배정 불가 칸으로 돌아간다", () => {
    const filled = changeAssignment(run.draft.assignments, run.draft.assignments, "2026-12-08", "이OO");
    const cleared = changeAssignment(run.draft.assignments, filled, "2026-12-08", null);
    expect(cleared).toEqual(run.draft.assignments);
  });

  it("전체 흐름의 약속이 지켜진다", () => {
    expectInvariants(run);
  });
});

describe("시나리오 4: 위반이 남은 채 확정", () => {
  // "확정" 버튼의 경고와 잠금은 화면 동작이라 작업 14에서 브라우저로 확인했다.
  // 여기서는 그 바탕이 되는 데이터 쪽을 확인한다: 위반이 남아도 표·근거·복사가 모두 정상이다.
  const base = runPipeline(sampleRawInput);
  // 김OO는 12/10 휴가인데 그날 당번으로 바꾼다
  const edited = changeAssignment(base.draft.assignments, base.draft.assignments, "2026-12-10", "김OO");

  it("규칙 위반이 잡히고 표는 그 줄을 빨간색으로 표시한다", () => {
    const violations = checkSchedule(base.input, edited);
    expect(violations.some((v) => v.date === "2026-12-10" && v.rule === "no-leave")).toBe(true);
    const row = buildScheduleView(base.input, edited).rows.find((r) => r.date === "2026-12-10");
    expect(row?.status).toBe("violation");
  });

  it("위반이 남아 있어도 복사할 글에는 위반 설명이 없고 이름만 들어 있다", () => {
    const text = scheduleToText(base.input, edited);
    expect(text).toContain("2026-12-10\t김OO\t목\t");
    expect(text).not.toContain("휴가·출장일에는");
  });

  it("전체 흐름의 약속이 지켜진다", () => {
    expectInvariants(base, edited);
  });
});

describe("시나리오 5: 금요일 인원 부족 (유연근무자 다수 + 금요일 휴가)", () => {
  // 9명 중 6명이 유연근무자라 금요일에는 3명(이·강·임)만 설 수 있는데, 그마저 금요일마다 휴가
  const run = runPipeline({
    month: "2026-12",
    employeesText: [
      "김OO\tA\tO", "이OO\tA\tX", "박OO\tA\tO",
      "정OO\tB\tO", "강OO\tB\tX", "윤OO\tB\tO",
      "장OO\tC\tO", "임OO\tC\tX", "오OO\tC\tO",
    ].join("\n"),
    leavesText: [
      "이OO\t2026-12-04",
      "강OO\t2026-12-11",
      "이OO\t2026-12-18", "강OO\t2026-12-18", "임OO\t2026-12-18", // 12/18은 금요일 후보가 한 명도 없다
    ].join("\n"),
    holidaysText: "2026-12-25",
    previousText: "",
    firstTuesdayTeam: "A",
  });

  const fridays = ["2026-12-04", "2026-12-11", "2026-12-18"];

  it("유연근무자는 금요일에 한 번도 배정되지 않는다 (0건)", () => {
    expect(run.violations.filter((v) => v.rule === "flex-friday")).toEqual([]);
    for (const date of fridays) {
      const name = run.draft.assignments.find((a) => a.date === date)?.name;
      if (name !== null && name !== undefined) expect(["이OO", "강OO", "임OO"]).toContain(name);
    }
  });

  it("후보가 한 명도 없는 금요일(12/18)은 배정 불가 날짜로 정해진다", () => {
    expect(run.request.candidates["2026-12-18"]).toBeUndefined();
    expect(run.request.unassignable).toContainEqual({
      date: "2026-12-18",
      reason: "배정할 수 있는 직원이 없습니다 (휴가·근무 기간·유연근무 조건)",
    });
    expect(run.view.rows.find((r) => r.date === "2026-12-18")?.status).toBe("unassignable");
  });

  it("그래도 규칙 위반은 없고 총 횟수 차이도 2회 이내다 (총 횟수만 맞춘다)", () => {
    expect(run.violations).toEqual([]);
  });

  it("전체 흐름의 약속이 지켜진다", () => {
    expectInvariants(run);
  });
});

describe("시나리오 6: 중간 입사·퇴사", () => {
  // 조OO는 12/15 입사(예시 그대로), 한OO는 12/17까지 근무
  const run = runPipeline(
    raw({ employeesText: sampleRawInput.employeesText.replace("2026-12-18", "2026-12-17") }),
  );

  it("조OO는 입사일 전에, 한OO는 퇴사일 후에 배정되지 않는다 (근무 기간 밖 0건)", () => {
    expect(run.violations.filter((v) => v.rule === "work-period")).toEqual([]);
    for (const a of run.draft.assignments) {
      if (a.name === "조OO") expect(a.date >= "2026-12-15").toBe(true);
      if (a.name === "한OO") expect(a.date <= "2026-12-17").toBe(true);
    }
  });

  it("근거 표에 '비교 제외'로 중간 입사·중간 퇴사가 나온다", () => {
    expect(run.evidence.find((r) => r.name === "조OO")).toMatchObject({ excludedText: "중간 입사", excluded: true });
    expect(run.evidence.find((r) => r.name === "한OO")).toMatchObject({ excludedText: "중간 퇴사", excluded: true });
  });

  it("비교 제외 직원은 총 횟수 차이 계산에서 빠져 위반이 없다", () => {
    expect(run.request.balanceTargets).not.toContain("조OO");
    expect(run.request.balanceTargets).not.toContain("한OO");
    expect(run.violations).toEqual([]);
  });

  it("전체 흐름의 약속이 지켜진다", () => {
    expectInvariants(run);
  });
});

describe("시나리오 7: 장기 휴가 (평일의 절반 이상)", () => {
  it("11일 휴가(근무일 22일의 절반)이면 '장기 휴가'로 비교 제외다", () => {
    const run = runPipeline(sampleRawInput); // 오OO: 12/7~12/21 평일 11일
    expect(run.evidence.find((r) => r.name === "오OO")).toMatchObject({ excludedText: "장기 휴가", excluded: true });
    expect(run.request.balanceTargets).not.toContain("오OO");
    for (const a of run.draft.assignments) {
      if (a.name === "오OO") expect(a.date < "2026-12-07" || a.date > "2026-12-21").toBe(true);
    }
    expectInvariants(run);
  });

  it("하루 모자란 10일 휴가이면 비교 제외가 아니고 총 횟수 균형에 들어간다 (경계)", () => {
    const run = runPipeline(
      raw({ leavesText: sampleRawInput.leavesText.replace("오OO\t2026-12-07\t2026-12-21", "오OO\t2026-12-07\t2026-12-18") }),
    );
    expect(run.evidence.find((r) => r.name === "오OO")).toMatchObject({ excludedText: "-", excluded: false });
    expect(run.request.balanceTargets).toContain("오OO");
    expect(run.violations).toEqual([]);
    expectInvariants(run);
  });
});

describe("시나리오 8: 연속 금지 (팀마다 2명뿐)", () => {
  const run = runPipeline({
    month: "2026-12",
    employeesText: ["김OO\tA\tX", "이OO\tA\tX", "정OO\tB\tX", "윤OO\tB\tX", "장OO\tC\tX", "임OO\tC\tX"].join("\n"),
    leavesText: "",
    holidaysText: "2026-12-25",
    previousText: "",
    firstTuesdayTeam: "A",
  });

  it("이틀 연속 배정이 없다 (0건)", () => {
    expect(run.violations.filter((v) => v.rule === "no-consecutive")).toEqual([]);
    expect(run.violations).toEqual([]);
  });

  it("금요일→다음 주 월요일, 공휴일을 건너뛴 12/24(목)→12/28(월)도 서로 다른 사람이다", () => {
    const who = (date: string) => run.draft.assignments.find((a) => a.date === date)?.name;
    for (const [before, after] of [
      ["2026-12-04", "2026-12-07"],
      ["2026-12-11", "2026-12-14"],
      ["2026-12-18", "2026-12-21"],
      ["2026-12-24", "2026-12-28"],
    ]) {
      expect(who(before), `${before} → ${after}`).not.toBeNull();
      expect(who(before)).not.toBe(who(after));
    }
  });

  it("전체 흐름의 약속이 지켜진다", () => {
    expectInvariants(run);
  });
});

describe("시나리오 9: 직접 변경 (위반되는 사람으로 바꿈)", () => {
  const base = runPipeline(sampleRawInput);

  it("규칙을 어기는 사람으로 바꾸면 그 칸이 즉시 빨간색이 되고 근거 숫자가 즉시 바뀐다", () => {
    // 12/10(목)의 원래 당번자를, 그날 휴가 중인 김OO로 바꾼다 (AI 대역이 12/10에 누구를 넣었는지는 입력에 따라 달라진다)
    const originalName = base.draft.assignments.find((a) => a.date === "2026-12-10")?.name;
    expect(originalName).toBeTruthy();
    expect(originalName).not.toBe("김OO"); // 휴가 중인 사람은 후보가 아니므로 원래 당번자일 수 없다

    const edited = changeAssignment(base.draft.assignments, base.draft.assignments, "2026-12-10", "김OO");
    const row = buildScheduleView(base.input, edited).rows.find((r) => r.date === "2026-12-10");
    expect(row?.status).toBe("violation");

    const evidence = buildEvidenceView(base.input, edited);
    const count = (rows: typeof evidence, name: string) =>
      Number(rows.find((r) => r.name === name)?.countText.replace("회", ""));
    expect(count(evidence, "김OO")).toBe(count(base.evidence, "김OO") + 1); // 김OO는 1회 늘고
    expect(count(evidence, originalName as string)).toBe(count(base.evidence, originalName as string) - 1); // 원래 당번자는 1회 줄어든다
    expectInvariants(base, edited);
  });

  it("화요일에 다른 팀 사람으로 바꾸면 화요일 팀 위반이다", () => {
    // 12/8은 B팀 차례인데 A팀 이OO
    const edited = changeAssignment(base.draft.assignments, base.draft.assignments, "2026-12-08", "이OO");
    const row = buildScheduleView(base.input, edited).rows.find((r) => r.date === "2026-12-08");
    expect(row?.status).toBe("violation");
    expect(row?.notes.join(" ")).toContain("B팀 차례인데 A팀");
  });

  it("원래 사람으로 되돌리면 위반이 사라진다", () => {
    const bad = changeAssignment(base.draft.assignments, base.draft.assignments, "2026-12-10", "김OO");
    const original = base.draft.assignments.find((a) => a.date === "2026-12-10")?.name ?? null;
    const restored = changeAssignment(base.draft.assignments, bad, "2026-12-10", original);
    expect(checkSchedule(base.input, restored)).toEqual([]);
  });
});

describe("시나리오 10: 재조정 (nice, 작업 16)", () => {
  // 작업 16(자동 재조정)은 아직 만들지 않았다 (PRD에서 "여유가 있을 때만"). 만들면 이 시나리오를 채운다.
  it.todo("한 날짜를 고정하고 '나머지 다시 맞추기'를 누르면 고정한 날짜는 그대로이고 나머지만 바뀐다");
});
