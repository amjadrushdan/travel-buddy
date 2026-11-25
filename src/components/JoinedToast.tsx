"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shows "{name} joined {trip}" once after redeeming an invite, then clears ?joined from the URL. */
export function JoinedToast({ tripName }: { tripName: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const name = params.get("joined");
    if (!name) return;
    setText(`${name} joined ${tripName}`);
    router.replace(pathname, { scroll: false });
    const t = setTimeout(() => setText(null), 3000);
    return () => clearTimeout(t);
  }, [params, pathname, router, tripName]);

  if (!text) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-5 bottom-24 z-30 mx-auto max-w-[440px] lg:bottom-8 lg:left-[276px] rounded-sm bg-ink px-3.5 py-3 text-center text-sm font-medium text-bg"
    >
      {text}
    </div>
  );
}
