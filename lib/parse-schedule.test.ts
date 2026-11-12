import { describe, expect, it } from "vitest";
import { sampleEmployees, sampleHolidays, sampleLeaves } from "../data/sample";
import { parseHolidays, parseLeaves, weekdaysInRange } from "./parse";

// 작업 6: 휴가·출장·공휴일 해석
describe("기간 풀기 (weekdaysInRange)", () => {
  it("평일만 하루씩 푼다", () => {
    expect(weekdaysInRange("2026-12-10", "2026-12-10")).toEqual(["2026-12-10"]);
    // 12/11 금 ~ 12/14 월 → 토·일은 빠진다
    expect(weekdaysInRange("2026-12-11", "2026-12-14")).toEqual(["2026-12-11", "2026-12-14"]);
  });

  it("주말뿐인 기간은 빈 목록이다", () => {
    expect(weekdaysInRange("2026-12-05", "2026-12-06")).toEqual([]);
  });
});

describe("휴가·출장 읽기 (parseLeaves)", () => {
  it("종료일을 생략하면 하루짜리다", () => {
    expect(parseLeaves("김OO\t2026-12-10", sampleEmployees)).toEqual({
      items: [{ name: "김OO", date: "2026-12-10" }],
      errors: [],
    });
  });

  it("기간은 평일만 하루씩 푼다", () => {
    const { items } = parseLeaves("이OO\t2026-12-11\t2026-12-14", sampleEmployees);
    expect(items).toEqual([
      { name: "이OO", date: "2026-12-11" },
      { name: "이OO", date: "2026-12-14" },
    ]);
  });

  it("예시 데이터의 휴가를 글로 적었다가 다시 읽으면 똑같이 돌아온다", () => {
    const text = [
      "김OO\t2026-12-10",
      "이OO\t2026-12-14\t2026-12-15",
      "임OO\t2026-12-03",
      "정OO\t2026-12-22",
      "최OO\t2026-12-29",
      "오OO\t2026-12-07\t2026-12-21", // 장기 휴가: 평일 11일
    ].join("\r\n");
    expect(parseLeaves(text, sampleEmployees)).toEqual({ items: sampleLeaves, errors: [] });
  });

  it("첫 줄이 제목 줄이면 건너뛴다", () => {
    const { items, errors } = parseLeaves("이름\t시작일\t종료일\n김OO\t2026-12-10", sampleEmployees);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it("명단에 없는 이름은 줄 번호와 함께 알리고 그 줄은 읽지 않는다", () => {
    const { items, errors } = parseLeaves("김OO\t2026-12-10\n노OO\t2026-12-11", sampleEmployees);
    expect(items).toHaveLength(1);
    expect(errors).toEqual([{ line: 2, message: '명단에 없는 이름입니다: "노OO"' }]);
  });

  it("빈 줄은 줄 번호에는 센다", () => {
    const { errors } = parseLeaves("김OO\t2026-12-10\n\n\n노OO\t2026-12-11", sampleEmployees);
    expect(errors.map((e) => e.line)).toEqual([4]);
  });

  it("날짜 형식이 틀리거나 없는 날짜면 알린다", () => {
    const { items, errors } = parseLeaves("김OO\t2026/12/10\t2026-02-30", sampleEmployees);
    expect(items).toEqual([]);
    expect(errors.map((e) => e.message)).toEqual([
      '시작일이 날짜(YYYY-MM-DD)가 아닙니다: "2026/12/10"',
      '종료일이 날짜(YYYY-MM-DD)가 아닙니다: "2026-02-30"',
    ]);
  });

  it("시작일이 종료일보다 늦으면 알린다", () => {
    const { errors } = parseLeaves("김OO\t2026-12-15\t2026-12-10", sampleEmployees);
    expect(errors[0].message).toContain("보다 늦습니다");
  });

  it("칸 수가 맞지 않으면 알린다", () => {
    expect(parseLeaves("김OO", sampleEmployees).errors[0].message).toContain("2~3개");
    expect(
      parseLeaves("김OO\t2026-12-10\t2026-12-11\t연차", sampleEmployees).errors[0].message,
    ).toContain("4개");
  });

  it("주말뿐인 기간은 휴가 일수가 없으므로 알린다", () => {
    const { items, errors } = parseLeaves("김OO\t2026-12-05\t2026-12-06", sampleEmployees);
    expect(items).toEqual([]);
    expect(errors[0].message).toContain("평일이 하나도 없는");
  });

  it("너무 긴 기간(1년 초과)은 알린다", () => {
    const { errors } = parseLeaves("김OO\t2026-01-01\t2028-01-01", sampleEmployees);
    expect(errors[0].message).toContain("너무 깁니다");
  });

  it("같은 날이 겹쳐 적히면 한 번만 담는다", () => {
    const { items } = parseLeaves(
      "김OO\t2026-12-10\t2026-12-11\n김OO\t2026-12-11\t2026-12-14",
      sampleEmployees,
    );
    expect(items.map((l) => l.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-14"]);
  });

  it("빈 입력은 오류 없이 빈 목록이다", () => {
    expect(parseLeaves("", sampleEmployees)).toEqual({ items: [], errors: [] });
  });
});

describe("공휴일 읽기 (parseHolidays)", () => {
  it("줄마다 날짜 하나를 읽는다", () => {
    expect(parseHolidays("2026-12-25")).toEqual({ items: ["2026-12-25"], errors: [] });
    expect(parseHolidays("2026-12-24\r\n2026-12-25").items).toEqual(["2026-12-24", "2026-12-25"]);
  });

  it("예시 데이터의 공휴일을 글로 적었다가 다시 읽으면 똑같이 돌아온다", () => {
    expect(parseHolidays(sampleHolidays.join("\n"))).toEqual({ items: sampleHolidays, errors: [] });
  });

  it("첫 줄이 '날짜'이면 제목 줄로 보고 건너뛴다", () => {
    expect(parseHolidays("날짜\n2026-12-25")).toEqual({ items: ["2026-12-25"], errors: [] });
  });

  it("같은 날짜가 겹치면 한 번만 담는다", () => {
    expect(parseHolidays("2026-12-25\n2026-12-25").items).toEqual(["2026-12-25"]);
  });

  it("날짜가 아닌 줄은 줄 번호와 함께 알린다", () => {
    const { items, errors } = parseHolidays("2026-12-25\n\n성탄절\n2026-02-30");
    expect(items).toEqual(["2026-12-25"]);
    expect(errors).toEqual([
      { line: 3, message: '날짜(YYYY-MM-DD)가 아닙니다: "성탄절"' },
      { line: 4, message: '날짜(YYYY-MM-DD)가 아닙니다: "2026-02-30"' },
    ]);
  });

  it("한 줄에 날짜가 둘이거나 메모가 붙어 있으면 알린다 (조용히 무시하지 않는다)", () => {
    const twoDates = parseHolidays("2026-12-24 2026-12-25");
    expect(twoDates.items).toEqual([]);
    expect(twoDates.errors[0].message).toContain("날짜 하나만");
    expect(parseHolidays("2026-12-25\t성탄절").errors).toHaveLength(1);
  });

  it("빈 입력은 오류 없이 빈 목록이다", () => {
    expect(parseHolidays("")).toEqual({ items: [], errors: [] });
  });
});
