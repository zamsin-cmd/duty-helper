import { describe, expect, it } from "vitest";
import { sampleEmployees, sampleInput } from "../data/sample";
import { sampleValidSchedule } from "../data/sample-schedule";
import { EXPORT_HEADER, scheduleToText } from "./export";
import { weekdayLabel } from "./format";
import { parsePreviousSchedule } from "./parse";
import type { Assignment } from "./types";

const lines = (text: string) => text.split("\n");

/** 정답지에서 날짜별로 칸을 바꾼 당번표 */
function schedule(changes: Record<string, Partial<Assignment>> = {}): Assignment[] {
  return sampleValidSchedule.map((a) => ({ ...a, ...(changes[a.date] ?? {}) }));
}

// 작업 15: 표 복사
describe("요일 (weekdayLabel)", () => {
  it("날짜의 요일을 한 글자로 알려 준다", () => {
    expect(weekdayLabel("2026-12-01")).toBe("화");
    expect(weekdayLabel("2026-12-05")).toBe("토");
    expect(weekdayLabel("2026-12-06")).toBe("일");
    expect(weekdayLabel("2026-12-07")).toBe("월");
  });
});

describe("복사할 글 (scheduleToText)", () => {
  const text = scheduleToText(sampleInput, sampleValidSchedule);

  it("제목 줄 + 근무일 22일 줄이고, 공휴일(12/25)은 없다", () => {
    expect(lines(text)).toHaveLength(23);
    expect(lines(text)[0]).toBe(EXPORT_HEADER);
    expect(text).not.toContain("2026-12-25");
  });

  it("제목 줄은 날짜 / 이름 / 요일 / 비고다 (탭으로 나뉜다)", () => {
    expect(EXPORT_HEADER).toBe("날짜\t이름\t요일\t비고");
  });

  it("한 줄은 날짜, 이름, 요일, 비고를 탭으로 이은 것이다", () => {
    expect(lines(text)[1]).toBe("2026-12-01\t김OO\t화\t");
    expect(lines(text)[5]).toBe("2026-12-07\t장OO\t월\t");
  });

  it("모든 줄이 정확히 네 칸이다 (엑셀에서 칸이 밀리지 않는다)", () => {
    for (const line of lines(text)) {
      expect(line.split("\t")).toHaveLength(4);
    }
  });

  it("날짜 순서이고 끝에 빈 줄이 없다", () => {
    const dates = lines(text).slice(1).map((l) => l.split("\t")[0]);
    expect(dates).toEqual([...dates].sort());
    expect(text.endsWith("\n")).toBe(false);
  });
});

describe("배정 불가·직접 지정·비정상 칸", () => {
  it("배정 불가 날짜는 이름을 비우고 비고에 이유를 적는다", () => {
    const text = scheduleToText(
      sampleInput,
      schedule({ "2026-12-03": { name: null, unassignableReason: "후보가 없습니다" } }),
    );
    expect(lines(text).find((l) => l.startsWith("2026-12-03"))).toBe("2026-12-03\t\t목\t후보가 없습니다");
  });

  it("지정자가 직접 지정한 칸은 비고에 그렇게 적는다", () => {
    const text = scheduleToText(sampleInput, schedule({ "2026-12-08": { name: "이OO", manual: true } }));
    expect(lines(text).find((l) => l.startsWith("2026-12-08"))).toBe("2026-12-08\t이OO\t화\t지정자 직접 지정");
  });

  it("규칙 위반 설명은 넣지 않는다", () => {
    // 김OO는 12/10 휴가인데 배정되어 규칙 위반이지만, 복사하는 글에는 위반 설명이 없다
    const text = scheduleToText(sampleInput, schedule({ "2026-12-10": { name: "김OO" } }));
    expect(lines(text).find((l) => l.startsWith("2026-12-10"))).toBe("2026-12-10\t김OO\t목\t");
    expect(text).not.toContain("휴가·출장일에는");
  });

  it("칸이 아예 없는 날도 한 줄은 나오고 이름과 비고가 비어 있다", () => {
    const list = sampleValidSchedule.filter((a) => a.date !== "2026-12-03");
    const text = scheduleToText(sampleInput, list);
    expect(lines(text).find((l) => l.startsWith("2026-12-03"))).toBe("2026-12-03\t\t목\t");
  });

  it("이유 안에 탭이나 줄바꿈이 있어도 한 줄·네 칸이 유지된다", () => {
    const text = scheduleToText(
      sampleInput,
      schedule({ "2026-12-03": { name: null, unassignableReason: "이유\t하나\n이유 둘" } }),
    );
    const line = lines(text).find((l) => l.startsWith("2026-12-03"));
    expect(line?.split("\t")).toEqual(["2026-12-03", "", "목", "이유 하나 이유 둘"]);
    expect(lines(text)).toHaveLength(23);
  });
});

describe("다음 달에 그대로 붙여넣을 수 있다 (입력칸 4번과 같은 형식)", () => {
  it("복사한 글을 다음 달 지난달 당번표로 읽으면 같은 당번표가 나오고 오류가 없다", () => {
    const text = scheduleToText(sampleInput, sampleValidSchedule);
    // 이번 달이 12월이므로 다음 달(2027-01) 입장에서 지난달이 2026-12다
    const parsed = parsePreviousSchedule(text, sampleEmployees, "2027-01");
    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toEqual(sampleValidSchedule.map(({ date, name }) => ({ date, name })));
  });

  it("배정 불가 날짜(이름 빈 줄)와 직접 지정 칸이 섞여 있어도 오류 없이 읽힌다", () => {
    const list = schedule({
      "2026-12-03": { name: null, unassignableReason: "후보가 없습니다" },
      "2026-12-08": { name: "이OO", manual: true },
    });
    const parsed = parsePreviousSchedule(scheduleToText(sampleInput, list), sampleEmployees, "2027-01");
    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toHaveLength(21); // 배정 불가 1일은 당번이 없던 날로 건너뛴다
    expect(parsed.items.find((d) => d.date === "2026-12-08")?.name).toBe("이OO");
  });
});
