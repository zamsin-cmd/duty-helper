import { describe, expect, it } from "vitest";
import { loadingLabel } from "./elapsed";

describe("기다리는 시간 표시 (loadingLabel)", () => {
  it("경과 초와 최대 시간을 함께 보여 준다", () => {
    expect(loadingLabel(0)).toBe("당번표를 만드는 중… 0초 / 최대 60초");
    expect(loadingLabel(12)).toBe("당번표를 만드는 중… 12초 / 최대 60초");
  });
  it("소수점과 음수는 정리한다", () => {
    expect(loadingLabel(12.9)).toContain("12초");
    expect(loadingLabel(-3)).toContain("0초");
  });
  it("최대 시간에 닿으면 안내를 바꾼다", () => {
    expect(loadingLabel(60)).toBe("당번표를 만드는 중… 60초째, 곧 끝납니다");
    expect(loadingLabel(75)).toContain("75초째");
  });
});
