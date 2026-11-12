import { describe, expect, it } from "vitest";
import {
  sampleEmployees,
  sampleInput,
  sampleInputTeamAbsent,
  sampleInputTuesdayHoliday,
} from "../data/sample";
import { buildScheduleRequest } from "./candidates";
import { scheduleRequestSchema } from "./schemas";

const request = buildScheduleRequest(sampleInput);

// 작업 11: 날짜별 후보 명단과 AI에 보낼 요청
describe("근무일과 직원 (buildScheduleRequest)", () => {
  it("근무일은 공휴일(12/25)을 뺀 22일이다", () => {
    expect(request.month).toBe("2026-12");
    expect(request.weekdays).toHaveLength(22);
    expect(request.weekdays).not.toContain("2026-12-25");
  });

  it("직원에는 이름·팀·유연근무만 담는다 (근무 기간 같은 세부는 보내지 않는다)", () => {
    expect(request.employees).toHaveLength(12);
    expect(request.employees[2]).toEqual({ name: "박OO", team: "A", flexWork: true });
    for (const employee of request.employees) {
      expect(Object.keys(employee).sort()).toEqual(["flexWork", "name", "team"]);
    }
  });

  it("총 횟수를 맞출 직원은 비교 제외(조·한·오)를 뺀 9명이다", () => {
    expect(request.balanceTargets).toEqual([
      "김OO", "이OO", "박OO", "최OO", "정OO", "강OO", "윤OO", "장OO", "임OO",
    ]);
  });
});

describe("날짜별 후보 명단", () => {
  it("화요일은 그 주 담당 팀원만 후보다 (12/1은 A팀)", () => {
    expect(request.candidates["2026-12-01"]).toEqual(["김OO", "이OO", "박OO", "최OO"]);
    // 12/8은 B팀 차례: 정·강·윤 (조OO는 12/15 입사 전)
    expect(request.candidates["2026-12-08"]).toEqual(["정OO", "강OO", "윤OO"]);
  });

  it("금요일에는 유연근무자(박·강·임)가 후보에서 빠진다", () => {
    // 12/4(금): 박·강·임 제외, 조OO는 입사 전, 오OO는 휴가 시작 전이라 후보
    expect(request.candidates["2026-12-04"]).toEqual([
      "김OO", "이OO", "최OO", "정OO", "윤OO", "장OO", "한OO", "오OO",
    ]);
  });

  it("휴가 중인 직원은 후보에서 빠진다 (12/10: 김OO·오OO 휴가)", () => {
    expect(request.candidates["2026-12-10"]).toEqual([
      "이OO", "박OO", "최OO", "정OO", "강OO", "윤OO", "장OO", "임OO", "한OO",
    ]);
  });

  it("근무 기간 밖의 직원은 후보에서 빠진다 (12/21: 한OO 퇴사 후, 조OO 입사 후)", () => {
    const names = request.candidates["2026-12-21"];
    expect(names).not.toContain("한OO");
    expect(names).toContain("조OO");
    expect(names).not.toContain("오OO"); // 12/21까지 휴가
  });

  it("후보가 있는 날만 candidates에 들어 있고, 모든 후보는 명단에 있는 사람이다", () => {
    const known = new Set(sampleEmployees.map((e) => e.name));
    for (const names of Object.values(request.candidates)) {
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(known.has(name)).toBe(true);
    }
    expect(Object.keys(request.candidates)).toHaveLength(22);
    expect(request.unassignable).toEqual([]);
  });
});

describe("배정 불가 날짜", () => {
  it("화요일 담당 팀 전원이 부재하면 후보 없이 배정 불가로 정하고 이유를 적는다", () => {
    const absent = buildScheduleRequest(sampleInputTeamAbsent);
    expect(absent.candidates["2026-12-08"]).toBeUndefined();
    expect(absent.unassignable).toEqual([
      { date: "2026-12-08", reason: "B팀 전원 부재 (이 화요일은 B팀 차례)" },
    ]);
    // 순번이 미뤄져 12/15는 B팀이 맡는다
    expect(absent.candidates["2026-12-15"]).toEqual(["정OO", "강OO", "조OO", "윤OO"]);
  });

  it("후보가 한 명도 없는 평일도 배정 불가로 정한다", () => {
    const input = {
      ...sampleInput,
      leaves: [
        ...sampleInput.leaves,
        ...sampleEmployees.map((e) => ({ name: e.name, date: "2026-12-02" })),
      ],
    };
    const result = buildScheduleRequest(input);
    expect(result.candidates["2026-12-02"]).toBeUndefined();
    expect(result.unassignable).toContainEqual({
      date: "2026-12-02",
      reason: "배정할 수 있는 직원이 없습니다 (휴가·근무 기간·유연근무 조건)",
    });
  });

  it("화요일이 공휴일이면 그 날은 근무일이 아니고, 순번은 다음 주로 미뤄진다", () => {
    const holiday = buildScheduleRequest(sampleInputTuesdayHoliday);
    expect(holiday.weekdays).not.toContain("2026-12-15");
    // 12/22는 C팀 차례: 장·임·오 (한OO는 12/18 퇴사)
    expect(holiday.candidates["2026-12-22"]).toEqual(["장OO", "임OO", "오OO"]);
  });
});

describe("요청 검사와의 약속", () => {
  it("세 가지 예시 입력 모두 서버의 요청 검사를 통과한다", () => {
    for (const input of [sampleInput, sampleInputTeamAbsent, sampleInputTuesdayHoliday]) {
      const result = scheduleRequestSchema.safeParse(buildScheduleRequest(input));
      expect(result.success).toBe(true);
    }
  });
});
