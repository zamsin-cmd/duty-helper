// Design Ref: §7 서버 API — 받은 값과 AI 답을 Zod로 검사하는 형식.
// Plan SC: 작업 10 (요청 검사) / 작업 11 (AI 답 검사)에서 쓴다.
//
// 요청 모양은 DESIGN §7 "보내는 것"을 따른다: 대상 월, 평일 목록, 날짜별 후보 명단,
// 배정 불가 날짜, 직원 목록(이름·팀·유연근무), 균형 대상 직원 목록.
// 규칙 문장은 서버가 정해서 AI에 보내므로 요청에는 없다.

import { z } from "zod";
import { isValidDate } from "./parse";
import { TEAMS } from "./types";

// 항목이 빠졌거나 종류가 다를 때의 기본 안내도 한국어로 나오게 한다.
// (아래에서 직접 정한 문구는 그대로 쓰이고, 정하지 않은 문구만 한국어 기본 문구가 된다.)
z.config(z.locales.ko());

const dateSchema = z.string().refine(isValidDate, "날짜(YYYY-MM-DD)가 올바르지 않습니다");

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "대상 월(YYYY-MM)이 올바르지 않습니다");

const nameSchema = z.string().min(1, "이름이 비어 있습니다").max(30, "이름이 너무 깁니다");

// ───────────── 요청 (화면 → 서버) ─────────────

export const scheduleRequestSchema = z
  .object({
    month: monthSchema,
    /** 당번을 설 수 있는 날(평일에서 공휴일을 뺀 날) */
    weekdays: z.array(dateSchema).min(1, "근무일이 하나도 없습니다").max(31),
    /** 날짜별로 그날 배정할 수 있는 사람(후보 명단) */
    candidates: z.record(dateSchema, z.array(nameSchema).max(100)),
    /** 후보가 없어 미리 "배정 불가"로 정한 날과 이유 */
    unassignable: z
      .array(z.object({ date: dateSchema, reason: z.string().min(1).max(100) }))
      .max(31),
    employees: z
      .array(
        z.object({
          name: nameSchema,
          team: z.enum(TEAMS, "팀은 A, B, C 중 하나여야 합니다"),
          flexWork: z.boolean(),
        }),
      )
      .min(1, "직원이 한 명도 없습니다")
      .max(100),
    /** 총 횟수 차이를 맞출 직원(비교 제외 직원을 뺀 것) */
    balanceTargets: z.array(nameSchema).max(100),
    /** 다시 맞추기(nice)에서 바꾸지 말아야 할 배정 */
    fixedAssignments: z
      .array(z.object({ date: dateSchema, name: nameSchema }))
      .max(31)
      .optional(),
  })
  .superRefine((request, ctx) => {
    const names = new Set(request.employees.map((employee) => employee.name));
    const weekdays = new Set(request.weekdays);
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if (names.size !== request.employees.length) {
      issue(["employees"], "같은 이름의 직원이 둘 이상 있습니다");
    }
    request.weekdays.forEach((date, index) => {
      if (!date.startsWith(`${request.month}-`)) {
        issue(["weekdays", index], `대상 월(${request.month}) 밖의 날짜입니다: ${date}`);
      }
    });
    if (new Set(request.balanceTargets).size !== request.balanceTargets.length) {
      issue(["balanceTargets"], "같은 이름이 여러 번 들어 있습니다");
    }
    for (const [date, candidates] of Object.entries(request.candidates)) {
      if (new Set(candidates).size !== candidates.length) {
        issue(["candidates", date], `같은 이름이 여러 번 들어 있습니다: ${date}`);
      }
      if (!weekdays.has(date)) issue(["candidates", date], `근무일이 아닌 날짜입니다: ${date}`);
      for (const name of candidates) {
        if (!names.has(name)) issue(["candidates", date], `명단에 없는 이름입니다: ${name}`);
      }
    }
    request.unassignable.forEach((item, index) => {
      if (!weekdays.has(item.date)) {
        issue(["unassignable", index, "date"], `근무일이 아닌 날짜입니다: ${item.date}`);
      }
    });
    request.balanceTargets.forEach((name, index) => {
      if (!names.has(name)) issue(["balanceTargets", index], `명단에 없는 이름입니다: ${name}`);
    });
    request.fixedAssignments?.forEach((fixed, index) => {
      if (!weekdays.has(fixed.date)) {
        issue(["fixedAssignments", index, "date"], `근무일이 아닌 날짜입니다: ${fixed.date}`);
      }
      if (!names.has(fixed.name)) {
        issue(["fixedAssignments", index, "name"], `명단에 없는 이름입니다: ${fixed.name}`);
      }
    });
  });

/** 화면이 서버에 보내는 요청 */
export type ScheduleRequest = z.infer<typeof scheduleRequestSchema>;

// ───────────── AI 답 (AI → 서버) ─────────────

/** 직원별 설명: 한 문장, 50자 이내, 숫자와 날짜 금지 (PRD 5번 must ②). */
const descriptionSchema = z
  .string()
  .max(50, "설명은 50자 이내여야 합니다")
  .refine((text) => !/\d/.test(text), "설명에는 숫자와 날짜를 쓸 수 없습니다");

/** AI가 돌려주는 당번표 초안. 이름이 null인 날은 "배정 불가 날짜"이고 이유가 꼭 있어야 한다. */
export const scheduleDraftSchema = z.object({
  assignments: z.array(
    z
      .object({
        date: dateSchema,
        name: nameSchema.nullable(),
        unassignableReason: z.string().max(100).optional(),
      })
      .refine((a) => a.name !== null || (a.unassignableReason?.length ?? 0) > 0, {
        message: "배정 불가 날짜에는 이유가 있어야 합니다",
        path: ["unassignableReason"],
      }),
  ),
  descriptions: z.array(z.object({ name: nameSchema, text: descriptionSchema })),
});
