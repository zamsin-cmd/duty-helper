// Design Ref: §2 ② 입력칸, ③ 입력 오류 안내 — 붙여넣는 칸 하나와 그 칸의 안내.
// Plan SC: 작업 9 — 칸마다 열 순서와 예시 줄을 보여 주고, 잘못된 줄은 줄 번호와 함께 알린다.

import type { InputIssue } from "@/lib/input";

interface PasteFieldProps {
  id: string;
  label: string;
  /** 필수 입력칸이면 true, 비워도 되면 false */
  required: boolean;
  /** 열 순서 설명. 예: "이름 / 팀(A·B·C) / 유연근무(O·X)" */
  columns: string;
  /** 빈 칸에 흐리게 보여 줄 예시 줄 (칸 사이는 탭) */
  example: string;
  value: string;
  onChange: (value: string) => void;
  /** 이 칸에 보여 줄 안내들 */
  issues: InputIssue[];
  rows?: number;
}

/** 안내 목록: 오류는 빨간색, 참고는 노란색. 색만으로 구별하지 않도록 글자 표시도 붙인다. */
export function IssueList({ issues }: { issues: InputIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
      {issues.map((issue, index) => (
        <li
          key={`${issue.line ?? "all"}-${index}`}
          className={
            issue.level === "error"
              ? "text-red-700 dark:text-red-400"
              : "text-amber-700 dark:text-amber-400"
          }
        >
          <span className="font-semibold">{issue.level === "error" ? "오류" : "참고"}</span>{" "}
          {issue.line !== undefined ? `${issue.line}번째 줄: ` : ""}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function PasteField({
  id,
  label,
  required,
  columns,
  example,
  value,
  onChange,
  issues,
  rows = 6,
}: PasteFieldProps) {
  const hasError = issues.some((issue) => issue.level === "error");
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}{" "}
        <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
          ({required ? "필수" : "선택"})
        </span>
      </label>
      <p id={`${id}-hint`} className="text-sm text-zinc-600 dark:text-zinc-400">
        {columns}
      </p>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={example}
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        aria-invalid={hasError}
        className={`w-full resize-y rounded-md border bg-white p-3 font-mono text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 ${
          hasError ? "border-red-500" : "border-zinc-300 dark:border-zinc-700"
        }`}
      />
      <IssueList issues={issues} />
    </div>
  );
}
