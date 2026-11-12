import { ScheduleForm } from "@/components/ScheduleForm";

// Design Ref: §2 — 화면은 1개(/)이며 위에서 아래로 입력 → 당번표 → 근거 표 순서로 쌓인다.
// 디자인: 흰 머리줄 → 짙은 남색 소개 띠(이용 3단계 타일) → 연회색 바탕 위 흰 카드.
// 이 페이지는 서버 컴포넌트이고, 입력·클릭이 필요한 부분은 클라이언트 컴포넌트(ScheduleForm)가 맡는다.

const STEPS = [
  { no: "1", title: "붙여넣기", text: "엑셀의 명단·휴가·공휴일을 복사해 붙여넣기" },
  { no: "2", title: "당번표 만들기", text: "AI \"당번지정\"이 규칙에 맞춰 초안 작성" },
  { no: "3", title: "확인·확정", text: "위반 확인, 직접 수정, 확정 후 엑셀로 복사" },
];

export default function Home() {
  return (
    <>
      {/* 머리줄 */}
      <div className="border-b border-zinc-200 bg-card dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-lg font-bold text-white dark:text-zinc-900"
          >
            당
          </span>
          <span className="text-lg font-bold tracking-tight">당번도우미</span>
          <span className="ml-auto hidden text-sm text-zinc-500 sm:inline">당번 지정자를 위한 한 달 당번표 도구</span>
        </div>
      </div>

      {/* 소개 띠 */}
      <section aria-label="소개" className="bg-brand text-white dark:text-zinc-900">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-bold sm:text-3xl">한 달 당번표, 붙여넣으면 초안까지</h1>
          <p className="mt-2 text-sm opacity-90 sm:text-base">
            명단과 일정을 엑셀에서 복사해 붙여넣으면 한 달 치 당번표와 배정 근거를 만들어 줍니다.
          </p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.no} className="flex items-start gap-3 rounded-lg bg-white/10 p-4 dark:bg-black/10">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-brand dark:bg-zinc-900 dark:text-white">
                  {step.no}
                </span>
                <span>
                  <span className="block font-semibold">{step.title}</span>
                  <span className="block text-sm opacity-90">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 본문 */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <ScheduleForm />
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        당번도우미 · 입력한 내용은 저장되지 않으며, 새로고침하면 사라집니다.
      </footer>
    </>
  );
}
