import { describe, expect, it } from "vitest";
import { sampleEmployees, sampleInput, samplePreviousSchedule } from "../data/sample";
import { previousMonthOf } from "./calendar";
import { countPastDuties } from "./evidence";
import { parsePreviousSchedule } from "./parse";

// 작업 7: 지난달 당번 횟수 자동 계산
describe("지난달 구하기 (previousMonthOf)", () => {
  it("한 달 앞을 돌려준다", () => {
    expect(previousMonthOf("2026-12")).toBe("2026-11");
    expect(previousMonthOf("2026-03")).toBe("2026-02");
  });

  it("1월의 지난달은 작년 12월이다", () => {
    expect(previousMonthOf("2026-01")).toBe("2025-12");
  });

  it("형식이 틀리면 알기 쉬운 오류를 낸다", () => {
    expect(() => previousMonthOf("2026-13")).toThrow("대상 월 형식");
  });
});

describe("지난달 당번표 읽기 (parsePreviousSchedule)", () => {
  it("날짜 / 이름 줄을 읽는다", () => {
    expect(parsePreviousSchedule("2026-11-30\t김OO", sampleEmployees)).toEqual({
      items: [{ date: "2026-11-30", name: "김OO" }],
      errors: [],
    });
  });

  it("예시 데이터를 글로 적었다가 다시 읽으면 똑같이 돌아온다", () => {
    const text = samplePreviousSchedule.map((d) => `${d.date}\t${d.name}`).join("\r\n");
    expect(parsePreviousSchedule(text, sampleEmployees, "2026-12")).toEqual({
      items: samplePreviousSchedule,
      errors: [],
    });
  });

  it("첫 줄이 제목 줄이면 건너뛴다", () => {
    const { items, errors } = parsePreviousSchedule("날짜\t이름\n2026-11-02\t이OO", sampleEmployees);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it("이름이 비어 있는 날(당번이 없던 날)은 오류 없이 건너뛴다", () => {
    const { items, errors } = parsePreviousSchedule(
      "2026-11-02\t김OO\n2026-11-03\t\n2026-11-04",
      sampleEmployees,
    );
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it("두 번째 칸 뒤의 칸(비고)은 무시한다", () => {
    const { items, errors } = parsePreviousSchedule("2026-11-02\t김OO\t월요일 근무", sampleEmployees);
    expect(errors).toEqual([]);
    expect(items).toEqual([{ date: "2026-11-02", name: "김OO" }]);
  });

  it("날짜가 틀리면 줄 번호와 함께 알린다", () => {
    const { items, errors } = parsePreviousSchedule("2026-11-02\t김OO\n11월 3일\t이OO", sampleEmployees);
    expect(items).toHaveLength(1);
    expect(errors).toEqual([{ line: 2, message: '날짜(YYYY-MM-DD)가 아닙니다: "11월 3일"' }]);
  });

  it("명단에 없는 이름은 알리되 퇴사자일 수 있다는 안내를 붙인다", () => {
    const { items, errors } = parsePreviousSchedule("2026-11-02\t노OO", sampleEmployees);
    expect(items).toEqual([]);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toContain("명단에 없는 이름");
    expect(errors[0].message).toContain("퇴사자");
  });

  it("이번 달을 알려 주면 지난달이 아닌 날짜를 알린다", () => {
    const { items, errors } = parsePreviousSchedule(
      "2026-11-30\t김OO\n2026-12-01\t이OO",
      sampleEmployees,
      "2026-12",
    );
    expect(items).toHaveLength(1);
    expect(errors).toEqual([
      { line: 2, message: '지난달(2026-11) 날짜가 아닙니다: "2026-12-01"' },
    ]);
  });

  it("이번 달을 알려 주지 않으면 달은 확인하지 않는다", () => {
    expect(parsePreviousSchedule("2026-12-01\t이OO", sampleEmployees).errors).toEqual([]);
  });

  it("빈 입력은 오류 없이 빈 목록이다", () => {
    expect(parsePreviousSchedule("", sampleEmployees)).toEqual({ items: [], errors: [] });
  });
});

describe("지난달 당번 횟수 세기 (countPastDuties)", () => {
  it("예시 지난달 당번표: 21일을 11명이 돌아가며 맡아 10명은 2회, 오OO는 1회다", () => {
    const counts = countPastDuties(samplePreviousSchedule, sampleEmployees);
    expect(counts).not.toBeNull();
    expect(counts?.get("김OO")).toBe(2);
    expect(counts?.get("한OO")).toBe(2);
    expect(counts?.get("오OO")).toBe(1);
    // 모든 직원의 횟수를 합치면 지난달 평일 수와 같다
    const total = [...(counts?.values() ?? [])].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(21);
  });

  it("지난달에 근무하지 않은 이번 달 입사자(조OO)는 0회다 (빠지지 않고 0으로 들어 있다)", () => {
    const counts = countPastDuties(samplePreviousSchedule, sampleEmployees);
    expect(counts?.has("조OO")).toBe(true);
    expect(counts?.get("조OO")).toBe(0);
  });

  it("지난달 당번표를 넣지 않았으면 null이다 (근거 표에는 '-'로 보인다)", () => {
    expect(countPastDuties(undefined, sampleEmployees)).toBeNull();
    expect(countPastDuties([], sampleEmployees)).toBeNull();
    // 예시 입력 묶음은 지난달 당번표를 갖고 있다
    expect(countPastDuties(sampleInput.previousSchedule, sampleEmployees)).not.toBeNull();
  });

  it("명단에 없는 이름은 세지 않는다", () => {
    const counts = countPastDuties(
      [
        { date: "2026-11-02", name: "김OO" },
        { date: "2026-11-03", name: "노OO" },
      ],
      sampleEmployees,
    );
    expect(counts?.get("김OO")).toBe(1);
    expect(counts?.has("노OO")).toBe(false);
  });
});
