"use client";

import { useActionState } from "react";
import { createTrip, type CreateTripState } from "./actions";

const input = "rounded-sm border border-line bg-surface p-3.5 text-base outline-none focus:border-ink";

export function NewTripForm() {
  const [state, action, pending] = useActionState<CreateTripState, FormData>(createTrip, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Trip name</span>
        <input name="name" required maxLength={80} placeholder="Japan '26" className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Destination</span>
        <input name="destination" placeholder="Tokyo · Osaka" className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted">Starts</span>
          <input name="start_date" type="date" className={`${input} min-w-0 font-mono`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted">Ends</span>
          <input name="end_date" type="date" className={`${input} min-w-0 font-mono`} />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="text-[13px] text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="mt-2 rounded-sm bg-ink p-[15px] text-base font-semibold text-white">
        {pending ? "Creating…" : "Create trip"}
      </button>
    </form>
  );
}
