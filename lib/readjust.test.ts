import { describe, expect, it } from "vitest";
import { applyEdits, collectEdits } from "./readjust";
import type { ScheduleDraft } from "./types";

const draft: ScheduleDraft = {
  assignments: [
    { date: "2026-12-01", name: "김OO" },
    { date: "2026-12-02", name: "이OO" },
    { date: "2026-12-03", name: null, unassignableReason: "후보 없음" },
    { date: "2026-12-04", name: "박OO" },
  ],
  descriptions: [],
};

describe("고친 내용 찾기 (collectEdits)", () => {
  it("아무것도 안 고쳤으면 비어 있다", () => {
    expect(collectEdits(draft, draft.assignments)).toEqual({ fixed: [], manual: [] });
  });

  it("AI가 정한 날을 바꾸면 fixed, 배정 불가 날에 사람을 넣으면 manual이다", () => {
    const current = [
      { date: "2026-12-01", name: "최OO" },
      { date: "2026-12-02", name: "이OO" },
      { date: "2026-12-03", name: "정OO", manual: true },
      { date: "2026-12-04", name: "박OO" },
    ];
    expect(collectEdits(draft, current)).toEqual({
      fixed: [{ date: "2026-12-01", name: "최OO" }],
      manual: [{ date: "2026-12-03", name: "정OO" }],
    });
  });

  it("사람을 빼서 비운 날은 고정하지 않는다", () => {
    const current = [{ date: "2026-12-02", name: null, unassignableReason: "지정자가 비움" }];
    expect(collectEdits(draft, current)).toEqual({ fixed: [], manual: [] });
  });
});

describe("고침을 새 초안에 반영 (applyEdits)", () => {
  const redraft: ScheduleDraft = {
    assignments: [
      { date: "2026-12-01", name: "오OO" }, // AI가 고정을 어기고 다른 사람을 넣음
      { date: "2026-12-02", name: "강OO" },
      { date: "2026-12-03", name: null, unassignableReason: "후보 없음" },
      { date: "2026-12-04", name: "윤OO" },
    ],
    descriptions: [],
  };

  it("고정한 날은 AI 답과 상관없이 고정한 사람이다", () => {
    const result = applyEdits(redraft, { fixed: [{ date: "2026-12-01", name: "최OO" }], manual: [] });
    expect(result.find((a) => a.date === "2026-12-01")?.name).toBe("최OO");
    expect(result.find((a) => a.date === "2026-12-02")?.name).toBe("강OO"); // 나머지는 새 결과
  });

  it("직접 지정한 칸은 다시 얹히고 manual 표시가 붙는다", () => {
    const result = applyEdits(redraft, { fixed: [], manual: [{ date: "2026-12-03", name: "정OO" }] });
    expect(result.find((a) => a.date === "2026-12-03")).toMatchObject({ name: "정OO", manual: true });
  });

  it("고침이 없으면 새 초안 그대로다", () => {
    expect(applyEdits(redraft, { fixed: [], manual: [] })).toEqual(redraft.assignments);
  });
});
