import { describe, expect, it } from "vitest";
import { sampleEmployees } from "../data/sample";
import { isValidDate, parseEmployees, splitCells } from "./parse";

// 작업 5: 직원 명단 해석
describe("날짜 확인 (isValidDate)", () => {
  it("실제 있는 YYYY-MM-DD만 받는다", () => {
    expect(isValidDate("2026-12-15")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true); // 윤년
  });

  it("없는 날짜와 다른 형식은 거절한다", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2027-02-29")).toBe(false); // 윤년 아님
    expect(isValidDate("2026/12/15")).toBe(false);
    expect(isValidDate("2026-1-5")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
});

describe("칸 나누기 (splitCells)", () => {
  it("탭이 있으면 탭으로 나누고 앞뒤 공백을 지운다", () => {
    expect(splitCells("김OO\t A \tX")).toEqual(["김OO", "A", "X"]);
  });

  it("탭이 없으면 공백으로 나눈다", () => {
    expect(splitCells("김OO A X")).toEqual(["김OO", "A", "X"]);
  });

  it("끝쪽 빈 칸은 버리지만 가운데 빈 칸은 지킨다", () => {
    expect(splitCells("김OO\tA\tX\t\t")).toEqual(["김OO", "A", "X"]);
    expect(splitCells("김OO\tA\tX\t\t2026-12-18")).toEqual(["김OO", "A", "X", "", "2026-12-18"]);
  });
});

describe("직원 명단 읽기 (parseEmployees)", () => {
  it("DESIGN 예시 줄을 읽는다", () => {
    expect(parseEmployees("김OO\tA\tX")).toEqual({
      items: [{ name: "김OO", team: "A", flexWork: false }],
      errors: [],
    });
  });

  it("유연근무 O와 근무 기간(시작일·종료일)을 읽는다", () => {
    const { items, errors } = parseEmployees(
      "박OO\tA\tO\n조OO\tB\tX\t2026-12-15\n한OO\tC\tX\t\t2026-12-18",
    );
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { name: "박OO", team: "A", flexWork: true },
      { name: "조OO", team: "B", flexWork: false, startDate: "2026-12-15" },
      { name: "한OO", team: "C", flexWork: false, endDate: "2026-12-18" },
    ]);
  });

  it("예시 데이터를 글로 내보낸 뒤 다시 읽으면 똑같이 돌아온다", () => {
    const text = sampleEmployees
      .map((e) =>
        [e.name, e.team, e.flexWork ? "O" : "X", e.startDate ?? "", e.endDate ?? ""].join("\t"),
      )
      .join("\r\n"); // 엑셀에서 복사하면 줄바꿈이 \r\n일 수 있다
    expect(parseEmployees(text)).toEqual({ items: sampleEmployees, errors: [] });
  });

  it("첫 줄이 제목 줄이면 건너뛴다", () => {
    const { items, errors } = parseEmployees("이름\t팀\t유연근무\t시작일\t종료일\n김OO\tA\tX");
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
  });

  it("빈 줄은 건너뛰되 줄 번호에는 센다", () => {
    const { items, errors } = parseEmployees("김OO\tA\tX\n\n\n이OO\tZ\tX");
    expect(items).toHaveLength(1);
    expect(errors).toEqual([{ line: 4, message: '팀 이름이 A/B/C가 아닙니다: "Z"' }]);
  });

  it("소문자 팀과 'A팀' 표기, 소문자 o/x도 받아 준다", () => {
    const { items, errors } = parseEmployees("김OO a x\n이OO B팀 o");
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { name: "김OO", team: "A", flexWork: false },
      { name: "이OO", team: "B", flexWork: true },
    ]);
  });

  it("빈 입력은 오류 없이 빈 목록이다 (비었는지는 호출하는 쪽이 판단한다)", () => {
    expect(parseEmployees("")).toEqual({ items: [], errors: [] });
    expect(parseEmployees("\n  \n")).toEqual({ items: [], errors: [] });
  });
});

describe("잘못된 줄 알려 주기", () => {
  it("DESIGN 예시처럼 3번째 줄의 팀 이름 오류를 알려 준다", () => {
    const { items, errors } = parseEmployees("김OO\tA\tX\n이OO\tB\tX\n박OO\tD\tX");
    expect(items).toHaveLength(2);
    expect(errors).toEqual([{ line: 3, message: '팀 이름이 A/B/C가 아닙니다: "D"' }]);
  });

  it("유연근무 칸이 O/X가 아니면 알려 준다", () => {
    const { errors } = parseEmployees("김OO\tA\t예");
    expect(errors).toEqual([{ line: 1, message: '유연근무 칸은 O 또는 X여야 합니다: "예"' }]);
  });

  it("없는 날짜와 잘못된 형식을 알려 준다", () => {
    const { errors } = parseEmployees("김OO\tA\tX\t2026/12/15\t2026-02-30");
    expect(errors.map((e) => e.message)).toEqual([
      '시작일이 날짜(YYYY-MM-DD)가 아닙니다: "2026/12/15"',
      '종료일이 날짜(YYYY-MM-DD)가 아닙니다: "2026-02-30"',
    ]);
  });

  it("시작일이 종료일보다 늦으면 알려 준다", () => {
    const { items, errors } = parseEmployees("김OO\tA\tX\t2026-12-20\t2026-12-10");
    expect(items).toEqual([]);
    expect(errors[0].message).toContain("보다 늦습니다");
  });

  it("칸 수가 맞지 않으면 알려 준다", () => {
    const tooFew = parseEmployees("김OO\tA");
    expect(tooFew.errors[0].message).toContain("3~5개");
    expect(tooFew.errors[0].message).toContain("2개");
    const tooMany = parseEmployees("김OO\tA\tX\t2026-12-01\t2026-12-31\t메모");
    expect(tooMany.errors[0].message).toContain("6개");
  });

  it("한 줄에 문제가 여러 개면 모두 알려 주고, 그 줄은 읽지 않는다", () => {
    const { items, errors } = parseEmployees("김OO\tQ\t?");
    expect(items).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([1, 1]);
  });

  it("같은 이름이 또 나오면 뒤의 줄만 오류다", () => {
    const { items, errors } = parseEmployees("김OO\tA\tX\n이OO\tB\tX\n김OO\tC\tX");
    expect(items.map((e) => e.name)).toEqual(["김OO", "이OO"]);
    expect(errors).toEqual([{ line: 3, message: '이미 1번째 줄에 나온 이름입니다: "김OO"' }]);
  });

  it("오류가 난 줄이 있어도 나머지 줄은 읽는다", () => {
    const { items, errors } = parseEmployees("김OO\tA\tX\n이OO\tB\t?\n박OO\tC\tO");
    expect(items.map((e) => e.name)).toEqual(["김OO", "박OO"]);
    expect(errors).toHaveLength(1);
  });
});
