"use client";

// Design Ref: §2 ① 머리말, ② 입력칸 4개, ③ 입력 오류 안내, ④ 실행.
// Plan SC: 작업 9 (입력 화면) + 작업 11 ("당번표 만들기"가 서버의 AI "당번지정"을 부른다).
//
// 글을 읽고 오류를 찾는 일은 lib/input.ts가 한다. 이 컴포넌트는 입력값을 들고 있다가
// 그 결과를 보여 주고, 입력이 맞으면 서버(/api/schedule)에 당번표 초안을 요청한다.
// AI 키는 서버만 알고, 이 화면 코드에는 없다.
// 받은 당번표는 작업 12의 표(ScheduleTable)로 보여 준다. 직원별 근거 표는 작업 13에서 이어진다.
// 실패했을 때의 안내와 "다시 시도"는 lib/client-errors.ts가 정한다 (작업 17).

import { useRef, useState } from "react";
import { IssueList, PasteField } from "@/components/PasteField";
import { EvidenceTable } from "@/components/EvidenceTable";
import { ScheduleTable } from "@/components/ScheduleTable";
import { sampleRawInput } from "@/data/sample-text";
import { buildScheduleRequest } from "@/lib/candidates";
import {
  CLIENT_TIMEOUT_MS,
  UNEXPECTED_ERROR,
  describeFailure,
  describeThrown,
} from "@/lib/client-errors";
import { changeAssignment } from "@/lib/edit";
import { buildScheduleInput, type InputSection, type RawInput } from "@/lib/input";
import { TEAMS, type Assignment, type DateString, type ScheduleDraft, type ScheduleInput } from "@/lib/types";

const EMPTY_INPUT: RawInput = {
  month: "",
  employeesText: "",
  leavesText: "",
  holidaysText: "",
  previousText: "",
  firstTuesdayTeam: "A",
};

/** "당번표 만들기"의 진행 상태 */
type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      /** 이 당번표를 만들 때 쓴 입력 (표의 달력·규칙 검사에 필요하다) */
      input: ScheduleInput;
      /** AI가 돌려준 당번표 초안 (바꾸지 않는다. 어느 날이 원래 배정 불가였는지 알려면 필요하다) */
      draft: ScheduleDraft;
      /** 당번 지정자가 바꾼 결과까지 반영한 지금의 당번표 */
      assignments: Assignment[];
      /** "확정"을 눌렀는가 */
      confirmed: boolean;
    }
  | {
      status: "error";
      message: string;
      /** "다시 시도" 버튼을 보여 줄까 (기다리면 나아질 수 있는 실패만) */
      retryable: boolean;
    };

export function ScheduleForm() {
  const [raw, setRaw] = useState<RawInput>(EMPTY_INPUT);
  // "당번표 만들기"를 한 번이라도 눌렀는가. 누르기 전에는 입력을 시작한 칸의 안내만 보여 준다.
  const [attempted, setAttempted] = useState(false);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  // 입력을 고치거나 다시 눌렀을 때, 먼저 보낸 요청의 늦은 답이 화면을 덮어쓰지 않게 하는 번호표
  const runId = useRef(0);
  // 지금 기다리는 요청. 입력을 고치면 더는 필요 없으니 중단한다.
  const abortRef = useRef<AbortController | null>(null);

  const result = buildScheduleInput(raw);
  const errorCount = result.issues.filter((issue) => issue.level === "error").length;
  const loading = run.status === "loading";

  const resetRun = () => {
    runId.current += 1;
    abortRef.current?.abort();
    setRun({ status: "idle" });
  };

  const update = (changes: Partial<RawInput>) => {
    setRaw((previous) => ({ ...previous, ...changes }));
    resetRun();
  };

  /** 이 구역에 입력을 시작했는가 */
  const started = (section: InputSection): boolean => {
    switch (section) {
      case "month":
        return raw.month !== "";
      case "employees":
        return raw.employeesText.trim() !== "";
      case "leaves":
        return raw.leavesText.trim() !== "";
      case "holidays":
        return raw.holidaysText.trim() !== "";
      case "previous":
        return raw.previousText.trim() !== "";
    }
  };

  /** 이 구역에 보여 줄 안내 */
  const issuesOf = (section: InputSection) =>
    result.issues.filter((issue) => issue.section === section && (attempted || started(section)));

  /** 서버에 당번표 초안을 요청한다. "당번표 만들기"와 "다시 시도"가 함께 쓴다. */
  const runSchedule = async () => {
    const input = result.input;
    if (!input) {
      resetRun();
      return;
    }

    const id = ++runId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // 서버가 끝내 답하지 않아도 "만드는 중…"에서 영영 못 벗어나지 않게, 정해진 시간이 지나면 포기한다
    const timer = setTimeout(
      () => controller.abort(new DOMException("서버가 시간 안에 답하지 않았습니다", "TimeoutError")),
      CLIENT_TIMEOUT_MS,
    );

    setRun({ status: "loading" });
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildScheduleRequest(input)),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (id !== runId.current) return; // 그 사이 입력을 고쳤거나 다시 눌렀다

      if (!response.ok) {
        setRun({ status: "error", ...describeFailure(response.status, body) });
        return;
      }
      const draft = body as ScheduleDraft | null;
      if (!draft || !Array.isArray(draft.assignments) || !Array.isArray(draft.descriptions)) {
        setRun({ status: "error", message: UNEXPECTED_ERROR, retryable: true });
        return;
      }

      // 표를 그릴 때 프로그램이 규칙대로 다시 검사한다 (PRD: AI는 초안, 프로그램이 확인)
      setRun({ status: "done", input, draft, assignments: draft.assignments, confirmed: false });
    } catch (error) {
      if (id === runId.current) setRun({ status: "error", ...describeThrown(error) });
    } finally {
      clearTimeout(timer);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    void runSchedule();
  };

  /** 당번 지정자가 날짜 하나의 당번자를 바꿨다. 확정된 뒤에는 바꿀 수 없다. */
  const handleAssignmentChange = (date: DateString, name: string | null) => {
    setRun((previous) =>
      previous.status === "done" && !previous.confirmed
        ? {
            ...previous,
            assignments: changeAssignment(previous.draft.assignments, previous.assignments, date, name),
          }
        : previous,
    );
  };

  const setConfirmed = (confirmed: boolean) => {
    setRun((previous) => (previous.status === "done" ? { ...previous, confirmed } : previous));
  };

  const loadSample = () => {
    setRaw(sampleRawInput);
    resetRun();
  };

  const clearAll = () => {
    setRaw(EMPTY_INPUT);
    setAttempted(false);
    resetRun();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      {/* ① 머리말 */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold">당번도우미</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            명단과 일정을 엑셀에서 복사해 붙여넣으면 한 달 치 당번표를 만들어 줍니다.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="month" className="text-sm font-semibold">
            대상 월 (필수)
          </label>
          <input
            id="month"
            type="month"
            value={raw.month}
            onChange={(event) => update({ month: event.target.value })}
            aria-invalid={issuesOf("month").length > 0}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <IssueList issues={issuesOf("month")} />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={loadSample}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          예시 데이터 불러오기
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          모두 지우기
        </button>
        <p className="self-center text-sm text-zinc-600 dark:text-zinc-400">
          예시 데이터는 가상의 이름(김OO 등)입니다. 실제 직원 정보는 넣지 마세요.
        </p>
      </div>

      {/* ② 입력칸 4개 */}
      <section className="flex flex-col gap-6" aria-label="입력칸">
        <PasteField
          id="employees"
          label="1. 직원 명단"
          required
          columns="이름 / 팀(A·B·C) / 유연근무(O·X) / 시작일(선택) / 종료일(선택). 날짜는 2026-12-15 형식입니다."
          example={"김OO\tA\tX\n박OO\tA\tO\n조OO\tB\tX\t2026-12-15"}
          value={raw.employeesText}
          onChange={(employeesText) => update({ employeesText })}
          issues={issuesOf("employees")}
          rows={8}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <PasteField
            id="leaves"
            label="2. 휴가·출장 일정"
            required={false}
            columns="이름 / 시작일 / 종료일 (하루면 종료일 생략). 사유는 적지 않습니다."
            example={"김OO\t2026-12-10\n이OO\t2026-12-14\t2026-12-15"}
            value={raw.leavesText}
            onChange={(leavesText) => update({ leavesText })}
            issues={issuesOf("leaves")}
          />
          <PasteField
            id="holidays"
            label="3. 공휴일"
            required={false}
            columns="줄마다 날짜 하나 (예: 2026-12-25)."
            example={"2026-12-25"}
            value={raw.holidaysText}
            onChange={(holidaysText) => update({ holidaysText })}
            issues={issuesOf("holidays")}
          />
        </div>

        <PasteField
          id="previous"
          label="4. 지난달 당번표"
          required={false}
          columns="날짜 / 이름. 넣으면 직원별 지난달 당번 횟수를 참고용으로 보여 줍니다 (이번 달 배정에는 쓰지 않습니다)."
          example={"2026-11-02\t김OO\n2026-11-03\t이OO"}
          value={raw.previousText}
          onChange={(previousText) => update({ previousText })}
          issues={issuesOf("previous")}
        />
      </section>

      {/* ④ 실행 */}
      <section className="flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">이번 달 첫 화요일 담당 팀</legend>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            공휴일이 아닌 첫 화요일을 맡을 팀입니다. 지난달 마지막 담당 팀의 다음 팀을 고르세요.
          </p>
          <div className="flex gap-4">
            {TEAMS.map((team) => (
              <label key={team} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="firstTuesdayTeam"
                  value={team}
                  checked={raw.firstTuesdayTeam === team}
                  onChange={() => update({ firstTuesdayTeam: team })}
                />
                {team}팀
              </label>
            ))}
          </div>
        </fieldset>

        {attempted && errorCount > 0 && (
          <p role="alert" className="font-semibold text-red-700 dark:text-red-400">
            고쳐야 할 곳이 {errorCount}군데 있습니다. 위의 빨간 안내를 확인해 주세요.
          </p>
        )}

        {run.status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-md border border-red-500 bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200"
          >
            <p className="font-semibold">{run.message}</p>
            {run.retryable && (
              <button
                type="button"
                onClick={() => void runSchedule()}
                className="rounded-md border border-red-700 px-3 py-1.5 text-sm font-semibold hover:bg-red-100 dark:border-red-300 dark:hover:bg-red-900"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="rounded-md bg-zinc-900 px-5 py-3 font-semibold text-white hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? "당번표를 만드는 중… (최대 1분)" : "당번표 만들기"}
          </button>
        </div>
      </section>

      {/* ⑤⑥ 당번표, ⑦ 근거 표 (입력이 맞아 AI에게서 초안을 받았을 때만) */}
      {run.status === "done" && (
        <>
          <ScheduleTable
            input={run.input}
            assignments={run.assignments}
            confirmed={run.confirmed}
            onChange={handleAssignmentChange}
            onConfirm={() => setConfirmed(true)}
            onUnconfirm={() => setConfirmed(false)}
          />
          <EvidenceTable
            input={run.input}
            assignments={run.assignments}
            descriptions={run.draft.descriptions}
          />
        </>
      )}
    </form>
  );
}
