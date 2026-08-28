import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
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
