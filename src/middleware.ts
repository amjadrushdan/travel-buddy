import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static files, the service worker, the manifest and generated icons: they must load
    // without a session (the worker installs before anyone has typed their name).
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon/|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
