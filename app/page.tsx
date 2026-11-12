import { ScheduleForm } from "@/components/ScheduleForm";

// Design Ref: §2 — 화면은 1개(/)이며 위에서 아래로 입력 → 당번표 → 근거 표 순서로 쌓인다.
// 지금은 입력 부분(작업 9)만 있다. 이 페이지는 서버 컴포넌트이고, 입력·클릭이 필요한 부분은
// 클라이언트 컴포넌트(ScheduleForm)가 맡는다.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <ScheduleForm />
    </main>
  );
}
