import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { politiqueCsp } from "@/lib/csp";
import { getSupabaseUrl } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = politiqueCsp(nonce, getSupabaseUrl(), process.env.NODE_ENV === "development");
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // `wasm` : le binaire d'OpenCV.js (/vendor/opencv/opencv_js.wasm) est un
    // actif statique au même titre que le JavaScript qui le charge. Sans cette
    // exclusion, le middleware le redirige vers /login et la bibliothèque ne
    // s'initialise jamais.
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml|js|wasm)$).*)",
  ],
};
