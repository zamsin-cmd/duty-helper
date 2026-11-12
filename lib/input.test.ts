import { describe, expect, it } from "vitest";
import { sampleInput } from "../data/sample";
import { sampleRawInput } from "../data/sample-text";
import { buildScheduleInput, type RawInput } from "./input";

/** 예시 입력에서 일부만 바꾼 입력 */
const raw = (changes: Partial<RawInput> = {}): RawInput => ({ ...sampleRawInput, ...changes });

// 작업 9: 입력칸 4개를 읽어 안내와 당번표 입력 묶음을 만든다
describe("정상 입력", () => {
  it("예시 글을 읽으면 예시 데이터와 똑같은 입력 묶음이 나오고 안내는 없다", () => {
    const result = buildScheduleInput(sampleRawInput);
    expect(result.issues).toEqual([]);
    expect(result.input).toEqual(sampleInput);
  });

  it("입력 확인용 개수를 센다", () => {
    expect(buildScheduleInput(sampleRawInput).summary).toEqual({
      employees: 12,
      leaveDays: 1 + 2 + 1 + 1 + 1 + 11,
      holidays: 1,
      previousDuties: 21,
    });
  });

  it("휴가·공휴일·지난달 당번표가 비어 있어도 만들 수 있다", () => {
    const result = buildScheduleInput(
      raw({ leavesText: "", holidaysText: "", previousText: "" }),
    );
    expect(result.issues).toEqual([]);
    expect(result.input?.leaves).toEqual([]);
    expect(result.input?.previousSchedule).toBeUndefined();
  });

  it("고른 첫 화요일 팀이 입력 묶음에 들어간다", () => {
    expect(buildScheduleInput(raw({ firstTuesdayTeam: "C" })).input?.firstTuesdayTeam).toBe("C");
  });
});

describe("대상 월", () => {
  it("고르지 않았거나 형식이 틀리면 오류다", () => {
    for (const month of ["", "2026-13", "12월"]) {
      const result = buildScheduleInput(raw({ month }));
      expect(result.input).toBeNull();
      expect(result.issues).toEqual([
        { section: "month", message: "대상 월을 선택해 주세요 (예: 2026-12)", level: "error" },
      ]);
    }
  });
});

describe("직원 명단", () => {
  it("비어 있으면 오류다", () => {
    const result = buildScheduleInput(raw({ employeesText: "  \n" }));
    expect(result.input).toBeNull();
    expect(result.issues[0]).toMatchObject({
      section: "employees",
      message: "직원 명단이 비어 있습니다",
      level: "error",
    });
  });

  it("잘못된 줄은 줄 번호와 함께 오류로 알리고 당번표 입력은 만들지 않는다", () => {
    const text = sampleRawInput.employeesText.replace("박OO\tA", "박OO\tD");
    const result = buildScheduleInput(raw({ employeesText: text }));
    expect(result.input).toBeNull();
    expect(result.issues).toContainEqual({
      section: "employees",
      line: 3,
      message: '팀 이름이 A/B/C가 아닙니다: "D"',
      level: "error",
    });
  });

  it("직원이 한 명도 없는 팀이 있으면 경고하지만 만들 수는 있다", () => {
    const withoutC = sampleRawInput.employeesText
      .split("\n")
      .filter((line) => !line.includes("\tC\t"))
      .join("\n");
    const result = buildScheduleInput(raw({ employeesText: withoutC, leavesText: "", previousText: "" }));
    expect(result.input).not.toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({ section: "employees", level: "warning" }),
    ]);
    expect(result.issues[0].message).toContain("C팀 직원이 한 명도 없습니다");
  });

  it("명단을 읽을 수 없으면 휴가·지난달 당번표는 읽지 않아 오류가 쏟아지지 않는다", () => {
    const result = buildScheduleInput(raw({ employeesText: "" }));
    const sections = result.issues.map((i) => i.section);
    expect(sections).toEqual(["employees"]);
  });
});

describe("휴가·출장과 공휴일", () => {
  it("명단에 없는 이름은 오류다 (그 휴가가 조용히 빠지면 안 된다)", () => {
    const result = buildScheduleInput(raw({ leavesText: "노OO\t2026-12-10" }));
    expect(result.input).toBeNull();
    expect(result.issues).toEqual([
      {
        section: "leaves",
        line: 1,
        message: '명단에 없는 이름입니다: "노OO"',
        level: "error",
      },
    ]);
  });

  it("공휴일 형식이 틀리면 오류다", () => {
    const result = buildScheduleInput(raw({ holidaysText: "성탄절" }));
    expect(result.input).toBeNull();
    expect(result.issues[0]).toMatchObject({ section: "holidays", line: 1, level: "error" });
  });

  it("대상 월 밖의 휴가·공휴일은 경고만 하고 만들 수는 있다", () => {
    const result = buildScheduleInput(
      raw({
        leavesText: "김OO\t2026-12-10\n이OO\t2027-01-04",
        holidaysText: "2026-12-25\n2027-01-01",
      }),
    );
    expect(result.input).not.toBeNull();
    expect(result.issues.map((i) => i.message)).toEqual([
      "대상 월(2026-12) 밖의 휴가·출장 1일은 사용되지 않습니다",
      "대상 월(2026-12) 밖의 공휴일 1일은 사용되지 않습니다",
    ]);
  });
});

describe("지난달 당번표", () => {
  it("문제가 있어도 경고일 뿐 당번표는 만들 수 있다 (퇴사자 이름 등)", () => {
    const result = buildScheduleInput(
      raw({ previousText: `${sampleRawInput.previousText}\n2026-11-30\t노OO` }),
    );
    expect(result.input).not.toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ section: "previous", level: "warning" });
    expect(result.issues[0].message).toContain("퇴사자");
  });

  it("명단에 없는 이름이 여러 줄에 나와도 안내는 이름별로 묶어 한 건만 보여 준다", () => {
    const result = buildScheduleInput(
      raw({
        previousText: [
          "2026-11-02\t노OO",
          "2026-11-03\t하OO",
          "2026-11-04\t노OO",
          "2026-11-05\t노OO",
          "2026-11-06\t하OO",
        ].join("\n"),
      }),
    );
    expect(result.input).not.toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ section: "previous", level: "warning" });
    expect(result.issues[0].line).toBeUndefined();
    expect(result.issues[0].message).toContain("2명(노OO, 하OO)이 5줄에 나옵니다");
  });

  it("묶는 것은 이름 오류뿐이고 날짜 오류는 줄마다 알린다", () => {
    const result = buildScheduleInput(
      raw({ previousText: "2026-11-02\t노OO\n11월 3일\t김OO\n2026-11-04\t노OO" }),
    );
    // 줄 번호 없는 묶음 안내가 그 구역 맨 앞, 그 뒤에 줄 번호가 있는 날짜 오류가 온다
    expect(result.issues.map((i) => i.line)).toEqual([undefined, 2]);
  });

  it("이번 달 날짜가 섞여 있으면 경고한다", () => {
    const result = buildScheduleInput(raw({ previousText: "2026-12-01\t김OO" }));
    expect(result.input).not.toBeNull();
    expect(result.issues[0].message).toContain("지난달(2026-11) 날짜가 아닙니다");
  });
});

describe("안내 순서", () => {
  it("구역 순서(대상 월 → 명단 → 휴가 → 공휴일 → 지난달)와 줄 번호 순서로 정렬된다", () => {
    const result = buildScheduleInput({
      month: "",
      employeesText: "김OO\tA\tX\n이OO\tZ\tX\n박OO\tY\tX",
      leavesText: "김OO\t2026/12/10",
      holidaysText: "성탄절",
      previousText: "2026-11-02\t노OO",
      firstTuesdayTeam: "A",
    });
    // 직원 명단에서 읽힌 사람은 김OO(A팀) 한 명뿐이라 B·C팀 "직원 없음" 경고가 줄 번호 없이 붙는다.
    // 줄 번호가 없는 안내(구역 전체에 대한 것)는 그 구역의 맨 앞에 온다.
    expect(result.issues.map((i) => [i.section, i.line])).toEqual([
      ["month", undefined],
      ["employees", undefined],
      ["employees", undefined],
      ["employees", 2],
      ["employees", 3],
      ["leaves", 1],
      ["holidays", 1],
      ["previous", undefined], // 지난달 당번표의 이름 안내는 줄 번호 없는 묶음 안내다
    ]);
  });
});
