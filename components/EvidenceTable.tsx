// Design Ref: §2 ⑦ 근거 표 — 직원별로 왜 이렇게 배정되었는지 숫자와 설명으로 보여 준다.
// Plan SC: 작업 13 — 이번 달 횟수 / 화요일 팀 순번 / 지난달 횟수 / 비교 제외 사유 / 설명.
//
// 숫자는 프로그램이 당번표에서 직접 센 값이고, 설명만 AI가 쓴 글이다 (lib/evidence-view.ts).
// 글자 만들기는 그쪽에서 하고, 이 컴포넌트는 그대로 그리기만 한다.

import { buildEvidenceView } from "@/lib/evidence-view";
import type { Assignment, ScheduleInput } from "@/lib/types";

interface EvidenceTableProps {
  input: ScheduleInput;
  assignments: Assignment[];
  /** AI가 쓴 직원별 설명 */
  descriptions: { name: string; text: string }[];
}

export function EvidenceTable({ input, assignments, descriptions }: EvidenceTableProps) {
  const rows = buildEvidenceView(input, assignments, descriptions);

  return (
    <section aria-labelledby="evidence-heading" className="flex flex-col gap-3">
      <h2 id="evidence-heading" className="text-xl font-bold">
        배정 근거
      </h2>

      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-900">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">이름</th>
              <th scope="col" className="px-3 py-2 font-semibold">이번 달</th>
              <th scope="col" className="px-3 py-2 font-semibold">화요일 팀 순번</th>
              <th scope="col" className="px-3 py-2 font-semibold">지난달</th>
              <th scope="col" className="px-3 py-2 font-semibold">비교 제외</th>
              <th scope="col" className="px-3 py-2 font-semibold">설명</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                  {row.name}
                </th>
                <td className="whitespace-nowrap px-3 py-2">{row.countText}</td>
                <td className="px-3 py-2">{row.tuesdayText}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.previousText}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {row.excluded ? (
                    <span className="rounded border border-current px-1.5 py-0.5 text-xs">
                      {row.excludedText}
                    </span>
                  ) : (
                    row.excludedText
                  )}
                </td>
                <td className="px-3 py-2">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        횟수와 날짜는 프로그램이 당번표에서 직접 센 값이고, 설명만 AI가 쓴 글입니다. 지난달 횟수는
        참고용이며 이번 달 배정에는 쓰지 않았습니다. &quot;비교 제외&quot; 직원(달 중간 입사·퇴사,
        장기 휴가)은 총 횟수 차이(최대 2회) 계산에서 빠집니다.
      </p>
    </section>
  );
}
