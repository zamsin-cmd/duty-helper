import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScheduleInput } from "./input";

// TESTDATA.md의 가상 데이터 세트(B·C·D)가 앱 입력 칸에 붙여넣었을 때 오류 없이 읽히는지 지키는 시험.
const doc = readFileSync("TESTDATA.md", "utf8");
const sets = doc.split(/^## /m).filter((part) => part.startsWith("세트"));

function blocksOf(part: string): string[] {
  return [...part.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
}

describe("TESTDATA.md 가상 데이터", () => {
  it("세트가 4개(B·C·D·E) 있다", () => {
    expect(sets).toHaveLength(4);
  });

  const cases: [string, string, string][] = [
    ["B", "2026-05", "A"],
    ["C", "2026-05", "A"],
    ["D", "2026-09", "B"],
    ["E", "2026-10", "A"],
  ];

  for (const [i, [label, month, team]] of cases.entries()) {
    it(`세트 ${label}: 오류 없이 읽힌다`, () => {
      const blocks = blocksOf(sets[i]);
      const employeesText = blocks[0];
      const leavesText = blocks[1] ?? "";
      const holidaysText = label === "C" ? "" : (blocks[2] ?? "");
      const previousText = label === "D" ? (blocks[3] ?? "") : "";
      const built = buildScheduleInput({
        month,
        employeesText,
        leavesText,
        holidaysText,
        previousText,
        firstTuesdayTeam: team as "A" | "B" | "C",
      });
      const errors = built.issues.filter((issue) => issue.level === "error");
      expect(errors).toEqual([]);
      expect(built.input).not.toBeNull();
    });
  }
});
