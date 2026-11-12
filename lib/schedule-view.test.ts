import { describe, expect, it } from "vitest";
import { sampleInput, sampleInputTeamAbsent } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { buildScheduleView, type ScheduleRow } from "./schedule-view";
import type { Assignment } from "./types";

/** 정답지에서 날짜별로 칸을 바꾼 당번표 */
function schedule(changes: Record<string, Partial<Assignment>> = {}): Assignment[] {
  return sampleValidSchedule.map((a) => ({ ...a, ...(changes[a.date] ?? {}) }));
}

const rowOf = (rows: ScheduleRow[], date: string): ScheduleRow => {
  const row = rows.find((r) => r.date === date);
  if (!row) throw new Error(`${date} 줄이 없습니다`);
  return row;
};

// 작업 12: 당번표 줄 계산
describe("정상 당번표", () => {
  const view = buildScheduleView(sampleInput, sampleValidSchedule);

  it("근무일 22일이 날짜 순서로 한 줄씩 나온다 (공휴일 12/25는 없다)", () => {
    expect(view.rows).toHaveLength(22);
    expect(view.rows[0].date).toBe("2026-12-01");
    expect(view.rows[21].date).toBe("2026-12-31");
    expect(view.rows.map((r) => r.date)).not.toContain("2026-12-25");
    expect(view.rows.map((r) => r.date)).toEqual([...view.rows.map((r) => r.date)].sort());
  });

  it("요일을 한 글자로 알려 준다 (12/1은 화, 12/4는 금, 12/7은 월)", () => {
    expect(rowOf(view.rows, "2026-12-01").weekday).toBe("화");
    expect(rowOf(view.rows, "2026-12-04").weekday).toBe("금");
    expect(rowOf(view.rows, "2026-12-07").weekday).toBe("월");
  });

  it("규칙을 모두 지켰으니 모든 줄이 ok이고 위반은 0건이다", () => {
    expect(view.rows.every((r) => r.status === "ok")).toBe(true);
    expect(view.counts).toEqual({ assigned: 22, unassignable: 0, violations: 0 });
    expect(view.overallViolations).toEqual([]);
  });

  it("화요일에는 그날 담당 팀을 비고에 적는다", () => {
    expect(rowOf(view.rows, "2026-12-01")).toMatchObject({ name: "김OO", notes: ["A팀 담당"] });
    expect(rowOf(view.rows, "2026-12-08").notes).toEqual(["B팀 담당"]);
    expect(rowOf(view.rows, "2026-12-02").notes).toEqual([]); // 수요일은 비고 없음
  });
});

describe("규칙 위반 줄 (빨간색)", () => {
  it("휴가일 배정은 violation이고 비고에 위반 설명이 실린다", () => {
    // 김OO는 12/10 휴가
    const view = buildScheduleView(sampleInput, schedule({ "2026-12-10": { name: "김OO" } }));
    const row = rowOf(view.rows, "2026-12-10");
    expect(row.status).toBe("violation");
    expect(row.name).toBe("김OO");
    expect(row.notes.join(" ")).toContain("휴가·출장일에는 배정할 수 없습니다");
    // 다른 줄은 영향이 없다 (김OO가 4회가 되어 횟수 차이 위반이 날짜 없이 따로 나온다)
    expect(rowOf(view.rows, "2026-12-09").status).toBe("ok");
  });

  it("화요일 위반은 담당 팀과 위반 설명이 함께 나온다", () => {
    // 12/8은 B팀 차례인데 A팀 이OO
    const view = buildScheduleView(sampleInput, schedule({ "2026-12-08": { name: "이OO" } }));
    const row = rowOf(view.rows, "2026-12-08");
    expect(row.status).toBe("violation");
    expect(row.notes[0]).toBe("B팀 담당");
    expect(row.notes.join(" ")).toContain("B팀 차례인데 A팀");
  });

  it("한 줄에 위반이 둘 이상이면 모두 비고에 싣는다", () => {
    // 12/1은 A팀 화요일인데, 아직 입사 전(12/15 입사)인 B팀 조OO를 넣었다 → 근무 기간 위반 + 화요일 팀 위반
    const view = buildScheduleView(sampleInput, schedule({ "2026-12-01": { name: "조OO" } }));
    const row = rowOf(view.rows, "2026-12-01");
    expect(row.status).toBe("violation");
    expect(row.notes[0]).toBe("A팀 담당");
    expect(row.notes.join(" ")).toContain("근무 기간 밖");
    expect(row.notes.join(" ")).toContain("A팀 차례인데 B팀");
    expect(row.notes.length).toBe(3);
  });

  it("금요일에 유연근무자를 넣으면 그 줄이 위반이 된다", () => {
    const view = buildScheduleView(sampleInput, schedule({ "2026-12-11": { name: "강OO" } }));
    expect(rowOf(view.rows, "2026-12-11").status).toBe("violation");
    expect(rowOf(view.rows, "2026-12-11").notes.join(" ")).toContain("유연근무자는 금요일");
  });

  it("당번 칸이 아예 없으면 missing이다", () => {
    const view = buildScheduleView(
      sampleInput,
      sampleValidSchedule.filter((a) => a.date !== "2026-12-03"),
    );
    const row = rowOf(view.rows, "2026-12-03");
    expect(row.status).toBe("missing");
    expect(row.name).toBeNull();
    expect(row.notes.join(" ")).toContain("당번이 배정되지 않았습니다");
  });

  it("한 달 전체 규칙(횟수 차이)은 날짜 없이 따로 모으고, 전체 위반 건수에 센다", () => {
    const view = buildScheduleView(
      sampleInput,
      schedule({ "2026-12-14": { name: "김OO" }, "2026-12-21": { name: "김OO" } }),
    );
    expect(view.overallViolations).toHaveLength(1);
    expect(view.overallViolations[0].rule).toBe("balance");
    // 12/14·12/21은 김OO의 배정이지만 그 칸 자체는 규칙을 어기지 않았다
    expect(rowOf(view.rows, "2026-12-14").status).toBe("ok");
    expect(view.counts.violations).toBe(1);
  });
});

describe("배정 불가 날짜 (회색)", () => {
  it("이름이 없는 줄은 unassignable이고 이유가 비고에 나온다 (위반이 아니다)", () => {
    const view = buildScheduleView(
      sampleInput,
      schedule({ "2026-12-03": { name: null, unassignableReason: "후보가 없습니다" } }),
    );
    const row = rowOf(view.rows, "2026-12-03");
    expect(row).toMatchObject({ name: null, status: "unassignable", notes: ["후보가 없습니다"] });
    expect(view.counts).toMatchObject({ assigned: 21, unassignable: 1, violations: 0 });
  });

  it("화요일 팀 전원 부재인 날은 담당 팀 차례와 이유가 함께 나온다", () => {
    const list = schedule({
      "2026-12-08": { name: null, unassignableReason: "B팀 전원 부재 (이 화요일은 B팀 차례)" },
    });
    const row = rowOf(buildScheduleView(sampleInputTeamAbsent, list).rows, "2026-12-08");
    expect(row.status).toBe("unassignable");
    expect(row.notes).toEqual(["B팀 차례", "B팀 전원 부재 (이 화요일은 B팀 차례)"]);
  });

  it("이유가 비어 있으면 그 사실을 비고에 적는다", () => {
    const view = buildScheduleView(sampleInput, schedule({ "2026-12-03": { name: null } }));
    expect(rowOf(view.rows, "2026-12-03").notes).toEqual(["이유가 적혀 있지 않습니다"]);
  });
});

describe("지정자 직접 지정", () => {
  it("직접 지정한 칸은 manual이고 위반으로 세지 않는다", () => {
    // 12/8은 B팀 전원 부재. A팀 이OO를 직접 지정했다.
    const list = schedule({ "2026-12-08": { name: "이OO", manual: true } });
    const view = buildScheduleView(sampleInputTeamAbsent, list);
    const row = rowOf(view.rows, "2026-12-08");
    expect(row.status).toBe("manual");
    expect(row.notes).toEqual(["B팀 차례", "지정자 직접 지정"]);
    expect(view.rows.filter((r) => r.date === "2026-12-08" && r.status === "violation")).toEqual([]);
  });
});
