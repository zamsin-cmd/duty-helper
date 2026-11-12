import { describe, expect, it } from "vitest";
import { sampleInput, sampleInputTeamAbsent, sampleEmployees } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { checkSchedule, excludedReasonOf } from "./rules";
import type { Assignment, RuleId, Violation } from "./types";

/** 정답지(data/sample-schedule.ts)를 복사하고, 날짜별로 당번자를 바꾼 당번표를 만든다. */
function schedule(changes: Record<string, string | null> = {}): Assignment[] {
  return sampleValidSchedule.map(({ date, name }) => ({
    date,
    name: date in changes ? changes[date] : name,
  }));
}

const rulesAt = (violations: Violation[], date: string): RuleId[] =>
  violations.filter((v) => v.date === date).map((v) => v.rule);

// 작업 4: 규칙 검사기
describe("정답지 확인", () => {
  it("규칙을 모두 지킨 당번표는 위반이 0건이다", () => {
    expect(checkSchedule(sampleInput, schedule())).toEqual([]);
  });
});

describe("규칙별 위반 찾기", () => {
  it("weekday-only: 주말에는 배정할 수 없다", () => {
    const list = [...schedule(), { date: "2026-12-05", name: "김OO" }]; // 토요일
    expect(rulesAt(checkSchedule(sampleInput, list), "2026-12-05")).toEqual(["weekday-only"]);
  });

  it("weekday-only: 공휴일(12/25)에는 배정할 수 없다", () => {
    const list = [...schedule(), { date: "2026-12-25", name: "김OO" }];
    const found = checkSchedule(sampleInput, list).filter((v) => v.date === "2026-12-25");
    expect(found.map((v) => v.rule)).toEqual(["weekday-only"]);
    expect(found[0].message).toContain("공휴일");
  });

  it("no-leave: 휴가일에는 배정할 수 없다", () => {
    // 김OO는 12/10 휴가
    expect(rulesAt(checkSchedule(sampleInput, schedule({ "2026-12-10": "김OO" })), "2026-12-10")).toContain(
      "no-leave",
    );
  });

  it("work-period: 입사 전과 퇴사 후에는 배정할 수 없다", () => {
    const early = checkSchedule(sampleInput, schedule({ "2026-12-07": "조OO" })); // 조OO는 12/15 입사
    expect(rulesAt(early, "2026-12-07")).toContain("work-period");
    const late = checkSchedule(sampleInput, schedule({ "2026-12-21": "한OO" })); // 한OO는 12/18 퇴사
    expect(rulesAt(late, "2026-12-21")).toContain("work-period");
  });

  it("work-period: 명단에 없는 이름도 알려 준다", () => {
    const found = checkSchedule(sampleInput, schedule({ "2026-12-02": "노OO" }));
    expect(found.find((v) => v.date === "2026-12-02")?.message).toContain("명단에 없는");
  });

  it("one-per-day: 한 날에 두 명이면 위반이다", () => {
    const list = [...schedule(), { date: "2026-12-02", name: "박OO" }];
    expect(rulesAt(checkSchedule(sampleInput, list), "2026-12-02")).toContain("one-per-day");
  });

  it("one-per-day: 근무일에 칸이 아예 없으면 위반이다", () => {
    const list = schedule().filter((a) => a.date !== "2026-12-03");
    expect(rulesAt(checkSchedule(sampleInput, list), "2026-12-03")).toEqual(["one-per-day"]);
  });

  it("배정 불가 날짜(이름 없음)는 위반이 아니다", () => {
    expect(checkSchedule(sampleInput, schedule({ "2026-12-03": null }))).toEqual([]);
  });

  it("tuesday-team: 화요일은 그 주 담당 팀원만 설 수 있다", () => {
    // 12/8은 B팀 차례인데 A팀 이OO를 넣었다
    expect(rulesAt(checkSchedule(sampleInput, schedule({ "2026-12-08": "이OO" })), "2026-12-08")).toContain(
      "tuesday-team",
    );
  });

  it("flex-friday: 유연근무자는 금요일에 설 수 없다", () => {
    // 12/11은 금요일, 강OO는 유연근무자
    expect(rulesAt(checkSchedule(sampleInput, schedule({ "2026-12-11": "강OO" })), "2026-12-11")).toContain(
      "flex-friday",
    );
  });

  it("no-consecutive: 이틀 연속 배정은 위반이다", () => {
    // 12/8 강OO, 12/9도 강OO
    expect(rulesAt(checkSchedule(sampleInput, schedule({ "2026-12-09": "강OO" })), "2026-12-09")).toContain(
      "no-consecutive",
    );
  });

  it("no-consecutive: 금요일과 다음 주 월요일도 연속이다", () => {
    // 12/11(금) 윤OO, 12/14(월)도 윤OO
    expect(rulesAt(checkSchedule(sampleInput, schedule({ "2026-12-14": "윤OO" })), "2026-12-14")).toContain(
      "no-consecutive",
    );
  });

  it("no-consecutive: 공휴일을 건너뛴 다음 평일도 연속이다", () => {
    // 12/24(목) 강OO, 12/25 공휴일, 12/28(월)도 강OO
    expect(rulesAt(checkSchedule(sampleInput, schedule({ "2026-12-28": "강OO" })), "2026-12-28")).toContain(
      "no-consecutive",
    );
  });
});

describe("총 횟수 차이 (balance)", () => {
  it("차이가 3회 이상이면 날짜 없는 위반으로 알린다", () => {
    // 김OO에게 몰아 주기: 12/14, 12/21을 김OO로 → 김OO 5회, 박OO·최OO 1회
    const found = checkSchedule(
      sampleInput,
      schedule({ "2026-12-14": "김OO", "2026-12-21": "김OO" }),
    ).filter((v) => v.rule === "balance");
    expect(found).toHaveLength(1);
    expect(found[0].date).toBeUndefined();
    expect(found[0].message).toContain("김OO 5회");
  });

  it("차이가 2회까지는 위반이 아니다", () => {
    expect(checkSchedule(sampleInput, schedule()).some((v) => v.rule === "balance")).toBe(false);
  });

  it("비교 제외 직원(조OO)은 횟수가 많아도 차이 계산에서 빠진다", () => {
    // 조OO(12/15 입사)에게 12/16, 12/18, 12/21, 12/23 → 4회
    const found = checkSchedule(
      sampleInput,
      schedule({
        "2026-12-16": "조OO",
        "2026-12-18": "조OO",
        "2026-12-21": "조OO",
        "2026-12-23": "조OO",
      }),
    );
    expect(found.some((v) => v.rule === "balance")).toBe(false);
  });
});

describe("지정자 직접 지정 (manual)", () => {
  it("배정 불가 날짜에 지정자가 직접 넣은 칸은 위반이 아니다", () => {
    // 12/8은 B팀 전원 부재. 이OO(A팀)를 직접 지정해도 위반이 아니다.
    const list: Assignment[] = schedule().map((a) =>
      a.date === "2026-12-08" ? { date: a.date, name: "이OO", manual: true } : a,
    );
    expect(rulesAt(checkSchedule(sampleInputTeamAbsent, list), "2026-12-08")).toEqual([]);
  });

  it("같은 칸을 직접 지정이 아니라 일반 배정으로 넣으면 위반이다", () => {
    const list = schedule({ "2026-12-08": "이OO" });
    expect(rulesAt(checkSchedule(sampleInputTeamAbsent, list), "2026-12-08")).toContain("tuesday-team");
  });

  it("직접 지정한 칸 옆에서는 이틀 연속으로 세지 않는다", () => {
    // 12/8 이OO(직접 지정)와 12/9 이OO는 연속처럼 보이지만 검사에서 제외한다.
    const list: Assignment[] = schedule().map((a) =>
      a.date === "2026-12-08" ? { date: a.date, name: "이OO", manual: true } : a,
    );
    expect(rulesAt(checkSchedule(sampleInputTeamAbsent, list), "2026-12-09")).toEqual([]);
  });
});

describe("비교 제외 사유 (excludedReasonOf)", () => {
  const byName = (name: string) => sampleEmployees.find((e) => e.name === name)!;

  it("달 중간 입사·퇴사와 장기 휴가를 알아본다", () => {
    expect(excludedReasonOf(sampleInput, byName("조OO"))).toBe("중간 입사");
    expect(excludedReasonOf(sampleInput, byName("한OO"))).toBe("중간 퇴사");
    expect(excludedReasonOf(sampleInput, byName("오OO"))).toBe("장기 휴가");
  });

  it("보통 직원은 제외되지 않는다", () => {
    expect(excludedReasonOf(sampleInput, byName("김OO"))).toBeNull();
    expect(excludedReasonOf(sampleInput, byName("박OO"))).toBeNull();
  });

  it("휴가가 근무일의 절반(11일)에서 하루 모자라면 제외되지 않는다", () => {
    const input = {
      ...sampleInput,
      leaves: sampleInput.leaves.filter((l) => !(l.name === "오OO" && l.date === "2026-12-21")),
    };
    expect(excludedReasonOf(input, byName("오OO"))).toBeNull();
  });
});

describe("결과 정렬", () => {
  it("위반은 날짜 순서이고, 날짜 없는 전체 규칙은 맨 뒤에 온다", () => {
    const found = checkSchedule(
      sampleInput,
      schedule({ "2026-12-14": "김OO", "2026-12-21": "김OO", "2026-12-10": "김OO" }),
    );
    const dates = found.map((v) => v.date);
    const dated = dates.filter((d): d is string => d !== undefined);
    expect([...dated].sort()).toEqual(dated);
    expect(dates[dates.length - 1]).toBeUndefined();
  });
});
