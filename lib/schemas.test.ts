import { describe, expect, it } from "vitest";
import { scheduleDraftSchema, scheduleRequestSchema } from "./schemas";
import type { ScheduleDraft } from "./types";

/** 올바른 요청 하나. 시험마다 일부만 바꿔서 쓴다. */
const validRequest = () => ({
  month: "2026-12",
  weekdays: ["2026-12-01", "2026-12-02"],
  candidates: {
    "2026-12-01": ["김OO"],
    "2026-12-02": ["김OO", "이OO"],
  },
  unassignable: [],
  employees: [
    { name: "김OO", team: "A", flexWork: false },
    { name: "이OO", team: "B", flexWork: true },
  ],
  balanceTargets: ["김OO", "이OO"],
});

/** 요청을 검사해서 첫 문제의 글을 돌려준다. 문제가 없으면 null. */
function firstProblem(request: unknown): string | null {
  const result = scheduleRequestSchema.safeParse(request);
  return result.success ? null : result.error.issues[0].message;
}

// 작업 10: 요청 검사 (화면 → 서버)
describe("요청 검사 (scheduleRequestSchema)", () => {
  it("올바른 요청은 통과한다", () => {
    expect(scheduleRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("고정 배정(다시 맞추기용)은 선택이고, 있으면 함께 검사한다", () => {
    const ok = { ...validRequest(), fixedAssignments: [{ date: "2026-12-01", name: "김OO" }] };
    expect(scheduleRequestSchema.safeParse(ok).success).toBe(true);
    const bad = { ...validRequest(), fixedAssignments: [{ date: "2026-12-01", name: "노OO" }] };
    expect(firstProblem(bad)).toContain("명단에 없는 이름");
  });

  it("대상 월 형식이 틀리면 거절한다", () => {
    expect(firstProblem({ ...validRequest(), month: "2026-13" })).toContain("대상 월");
    expect(firstProblem({ ...validRequest(), month: "12월" })).toContain("대상 월");
  });

  it("없는 날짜를 거절한다", () => {
    expect(firstProblem({ ...validRequest(), weekdays: ["2026-02-30"] })).toContain("날짜");
  });

  it("근무일이 하나도 없으면 거절한다", () => {
    expect(firstProblem({ ...validRequest(), weekdays: [], candidates: {} })).toContain("근무일");
  });

  it("직원이 한 명도 없으면 거절한다", () => {
    expect(firstProblem({ ...validRequest(), employees: [], candidates: {}, balanceTargets: [] })).toContain(
      "직원이 한 명도 없습니다",
    );
  });

  it("팀이 A/B/C가 아니면 거절한다", () => {
    const request = validRequest();
    request.employees[0].team = "D";
    expect(firstProblem(request)).toContain("A, B, C");
  });

  it("같은 이름의 직원이 둘이면 거절한다", () => {
    const request = validRequest();
    request.employees[1].name = "김OO";
    expect(firstProblem(request)).toContain("같은 이름");
  });

  it("대상 월 밖의 근무일을 거절한다", () => {
    expect(firstProblem({ ...validRequest(), weekdays: ["2027-01-04"], candidates: {} })).toContain(
      "대상 월(2026-12) 밖",
    );
  });

  it("후보 명단의 날짜가 근무일이 아니거나 이름이 명단에 없으면 거절한다", () => {
    expect(
      firstProblem({ ...validRequest(), candidates: { "2026-12-03": ["김OO"] } }),
    ).toContain("근무일이 아닌 날짜");
    expect(
      firstProblem({ ...validRequest(), candidates: { "2026-12-01": ["노OO"] } }),
    ).toContain("명단에 없는 이름");
  });

  it("배정 불가 날짜가 근무일이 아니면 거절한다", () => {
    expect(
      firstProblem({
        ...validRequest(),
        unassignable: [{ date: "2026-12-05", reason: "후보 없음" }],
      }),
    ).toContain("근무일이 아닌 날짜");
  });

  it("균형 대상에 명단에 없는 이름이 있으면 거절한다", () => {
    expect(firstProblem({ ...validRequest(), balanceTargets: ["노OO"] })).toContain("명단에 없는 이름");
  });

  it("항목이 빠졌을 때의 안내도 영어가 아니라 한국어다", () => {
    const result = scheduleRequestSchema.safeParse({ month: "2026-12" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/Invalid input|expected|received/);
      expect(message).toMatch(/[가-힣]/);
    }
  });

  it("필요한 항목이 빠지면 거절한다", () => {
    const { month, ...withoutMonth } = validRequest();
    expect(month).toBe("2026-12");
    expect(scheduleRequestSchema.safeParse(withoutMonth).success).toBe(false);
    expect(scheduleRequestSchema.safeParse(null).success).toBe(false);
    expect(scheduleRequestSchema.safeParse("문자열").success).toBe(false);
  });
});

// 작업 11에서 쓸 AI 답 검사도 미리 확인한다
describe("AI 답 검사 (scheduleDraftSchema)", () => {
  it("올바른 답은 통과하고, 만든 값은 types.ts의 ScheduleDraft와 같은 모양이다", () => {
    const draft: ScheduleDraft = scheduleDraftSchema.parse({
      assignments: [
        { date: "2026-12-01", name: "김OO" },
        { date: "2026-12-08", name: null, unassignableReason: "B팀 전원 휴가" },
      ],
      descriptions: [{ name: "김OO", text: "화요일 당번을 포함해 고르게 배정되었습니다" }],
    });
    expect(draft.assignments).toHaveLength(2);
  });

  it("이름이 없는 날에 이유가 없으면 거절한다", () => {
    const result = scheduleDraftSchema.safeParse({
      assignments: [{ date: "2026-12-08", name: null }],
      descriptions: [],
    });
    expect(result.success).toBe(false);
  });

  it("설명이 50자를 넘으면 거절한다", () => {
    const result = scheduleDraftSchema.safeParse({
      assignments: [],
      descriptions: [{ name: "김OO", text: "가".repeat(51) }],
    });
    expect(result.success).toBe(false);
  });

  it("설명에 숫자나 날짜가 있으면 거절한다", () => {
    for (const text of ["12월 1일에 섰습니다", "3회 배정되었습니다"]) {
      const result = scheduleDraftSchema.safeParse({
        assignments: [],
        descriptions: [{ name: "김OO", text }],
      });
      expect(result.success).toBe(false);
    }
  });

  it("50자 정확히는 통과한다", () => {
    const result = scheduleDraftSchema.safeParse({
      assignments: [],
      descriptions: [{ name: "김OO", text: "가".repeat(50) }],
    });
    expect(result.success).toBe(true);
  });
});
