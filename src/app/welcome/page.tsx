import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { WelcomeForm } from "./WelcomeForm";

export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-6 px-6 pt-[calc(24px+env(safe-area-inset-top))] pb-10">
      <Logo />
      <div className="mt-10 flex flex-col gap-2.5">
        <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.03em] text-balance">One place for the whole trip.</h1>
        <p className="text-[15px] text-pretty text-muted">
          Flights, plan, stays and notes — shared with everyone going, readable offline. No account needed.
        </p>
      </div>
      <Suspense>
        <WelcomeForm />
      </Suspense>
    </main>
  );
}
