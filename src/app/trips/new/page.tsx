import Link from "next/link";
import { NewTripForm } from "./NewTripForm";

export default function NewTripPage() {
  return (
    <main className="flex min-h-dvh flex-col gap-5 px-5 pt-[calc(12px+env(safe-area-inset-top))] pb-10">
      <Link href="/" className="self-start py-1 text-[15px] font-semibold">
        ‹ Trips
      </Link>
      <div className="flex flex-col gap-1">
        <span className="label">You&apos;ll be the owner</span>
        <h1 className="page-title">New trip</h1>
      </div>
      <NewTripForm />
    </main>
  );
}
