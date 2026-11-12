"use client";

// Design Ref: §2 ⑥ 표 복사 버튼.
// Plan SC: 작업 15 (nice) — 확정한 당번표를 엑셀에 붙여넣을 수 있게 복사한다.
//
// 복사할 글은 lib/export.ts가 만든다. 브라우저가 클립보드 접근을 막거나 지원하지 않으면
// (예: 주소가 https가 아닌 경우) 글을 상자에 보여 줘서 직접 복사할 수 있게 한다.

import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

export function CopyScheduleButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          표 복사
        </button>
      </div>

      {state === "copied" && (
        <p role="status" className="text-sm text-green-800 dark:text-green-300">
          복사했습니다. 엑셀에서 칸을 고르고 붙여넣기(Ctrl+V)하세요. 이 글은 다음 달 &quot;지난달
          당번표&quot; 칸에도 그대로 붙여넣을 수 있습니다.
        </p>
      )}

      {state === "failed" && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
            자동으로 복사하지 못했습니다. 아래 글을 직접 선택해서 복사(Ctrl+C)해 주세요.
          </p>
          <textarea
            readOnly
            value={text}
            rows={8}
            aria-label="복사할 당번표 글"
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      )}
    </div>
  );
}
