// Design Ref: §2 ⑤ 당번표, ⑥ 검사 요약 — 당번표를 날짜별 표로 보여 주고, 당번자를 직접 바꾸고, 확정한다.
// Plan SC: 작업 12 (표와 색) + 작업 14 (직접 변경·확정) + 작업 15 (확정한 표 복사).
//
// 어느 칸을 어떤 상태로 보여 줄지는 lib/schedule-view.ts가 정한다. 이 컴포넌트는 그대로 그리기만 한다.
// 당번자를 바꾸는 규칙은 lib/edit.ts, 바뀐 뒤의 검사는 화면이 다시 그려질 때마다 프로그램이 한다.
// 색만으로 구별하지 않도록 상태를 글자로도 함께 적는다 (규칙 위반 / 배정 불가 / 직접 지정).

import { CopyScheduleButton } from "@/components/CopyScheduleButton";
import { scheduleToText } from "@/lib/export";
import { shortDate } from "@/lib/format";
import { buildScheduleView, type RowStatus } from "@/lib/schedule-view";
import type { Assignment, DateString, ScheduleInput } from "@/lib/types";

interface ScheduleTableProps {
  input: ScheduleInput;
  assignments: Assignment[];
  /** 확정된 당번표인가. 확정되면 당번자를 바꿀 수 없다. */
  confirmed: boolean;
  /** 당번자를 바꿨을 때. name이 null이면 그 날을 배정 불가로 비운다. */
  onChange: (date: DateString, name: string | null) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
}

/** 줄 상태별 배경·글자 색 */
const ROW_STYLES: Record<RowStatus, string> = {
  ok: "",
  violation: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  missing: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  unassignable: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
  manual: "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
};

/** 줄 상태별 글자 표시. 정상이면 없다. */
const STATUS_BADGES: Record<RowStatus, string | null> = {
  ok: null,
  violation: "규칙 위반",
  missing: "배정 없음",
  unassignable: "배정 불가",
  manual: "직접 지정",
};

export function ScheduleTable({
  input,
  assignments,
  confirmed,
  onChange,
  onConfirm,
  onUnconfirm,
}: ScheduleTableProps) {
  const view = buildScheduleView(input, assignments);
  const [year, month] = input.month.split("-");
  // 드롭다운에는 전 직원을 보여 준다 (배정 불가 날짜에도 누구든 직접 지정할 수 있게, PRD 5번)
  const employeeNames = input.employees.map((employee) => employee.name);

  return (
    <section aria-labelledby="schedule-heading" className="flex flex-col gap-3">
      <h2 id="schedule-heading" className="border-l-4 border-brand pl-3 text-xl font-bold">
        당번표 {confirmed ? "(확정)" : "초안"} ({year}년 {Number(month)}월)
      </h2>

      {/* ⑥ 검사 요약과 확정 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm" role="status">
          배정 {view.counts.assigned}일 · 배정 불가 {view.counts.unassignable}일 ·{" "}
          <span
            className={
              view.counts.violations > 0 ? "font-semibold text-red-700 dark:text-red-400" : undefined
            }
          >
            규칙 위반 {view.counts.violations}건
          </span>
        </p>
        {confirmed ? (
          <button
            type="button"
            onClick={onUnconfirm}
            className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            확정 취소
          </button>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 dark:text-zinc-900"
          >
            확정
          </button>
        )}
      </div>

      {confirmed ? (
        <p
          role="status"
          className={`rounded-md border p-3 text-sm ${
            view.counts.violations > 0
              ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
              : "border-green-600 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
          }`}
        >
          {view.counts.violations > 0
            ? `규칙 위반 ${view.counts.violations}건이 남은 채로 확정되었습니다. 고치려면 "확정 취소"를 누르세요.`
            : "규칙 위반 없이 확정되었습니다."}
        </p>
      ) : (
        view.counts.violations > 0 && (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            규칙 위반이 남아 있습니다. 당번자를 바꿔 고치거나, 그대로 확정할 수도 있습니다 (확정할 때 경고만 합니다).
          </p>
        )
      )}

      {/* 확정한 당번표만 복사할 수 있다 (PRD 이용 흐름: 확정 → 표 복사) */}
      {confirmed && <CopyScheduleButton text={scheduleToText(input, assignments)} />}

      {/* ⑤ 당번표 */}
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead className="bg-brand-soft">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">날짜</th>
              <th scope="col" className="px-3 py-2 font-semibold">요일</th>
              <th scope="col" className="px-3 py-2 font-semibold">당번자</th>
              <th scope="col" className="px-3 py-2 font-semibold">비고</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const badge = STATUS_BADGES[row.status];
              // 칸에 명단에 없는 이름이 있으면(예: 두 명이 겹친 경우) 그 글자도 선택지로 보여 준다
              const extraName = row.name !== null && !employeeNames.includes(row.name) ? row.name : null;
              return (
                <tr
                  key={row.date}
                  className={`border-t border-zinc-200 align-top dark:border-zinc-800 ${ROW_STYLES[row.status]}`}
                >
                  <td className="whitespace-nowrap px-3 py-2">{shortDate(row.date)}</td>
                  <td className="px-3 py-2">{row.weekday}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <select
                      value={row.name ?? ""}
                      disabled={confirmed}
                      onChange={(event) => onChange(row.date, event.target.value || null)}
                      aria-label={`${shortDate(row.date)} ${row.weekday}요일 당번자`}
                      className="rounded border border-zinc-300 bg-white px-2 py-1 font-medium text-zinc-900 disabled:opacity-70 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">{row.status === "missing" ? "— 선택" : "— 배정 불가"}</option>
                      {extraName !== null && <option value={extraName}>{extraName}</option>}
                      {employeeNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    {badge && (
                      <span className="ml-2 rounded border border-current px-1.5 py-0.5 text-xs">
                        {badge}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.notes.length > 0 && (
                      <ul className="flex flex-col gap-0.5">
                        {row.notes.map((note, index) => (
                          <li key={index}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        당번자 칸에서 직원을 고르면 바로 규칙을 다시 검사합니다. 빨간색은 규칙 위반, 회색은 배정 불가 날짜,
        파란색은 배정 불가 날짜에 지정자가 직접 지정한 칸입니다.
      </p>

      {/* 날짜가 없는 한 달 전체 규칙 위반 (총 횟수 차이 등) */}
      {view.overallViolations.length > 0 && (
        <div className="rounded-md border border-red-500 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          <p className="font-semibold">한 달 전체 규칙 위반</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {view.overallViolations.map((violation, index) => (
              <li key={index}>{violation.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
