"use client";

import { useState } from "react";
import { airlineCode } from "@/lib/airlines";

/**
 * Airline logo in a small white tile; falls back to the code ("D7") if there's no logo.
 * The tile is white even on the dark boarding pass, since most logos are drawn for white.
 */
export function AirlineLogo({ flightNo, size = 28 }: { flightNo: string; size?: number }) {
  const code = airlineCode(flightNo);
  const [failed, setFailed] = useState(false);

  const tile = "flex flex-none items-center justify-center overflow-hidden rounded-[7px] border border-line bg-white";
  if (!code || failed) {
    return (
      <span className={`${tile} font-mono font-semibold text-ink`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
        {code ?? "✈"}
      </span>
    );
  }
  return (
    <span className={tile} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny same-origin logo, cached by the service worker */}
      <img
        src={`/airline-logo/${code}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full object-contain p-[2px]"
      />
    </span>
  );
}
