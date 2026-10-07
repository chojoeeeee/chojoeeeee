import { NextResponse, type NextRequest } from "next/server";
import { adminAccess } from "@/lib/admin-auth";

/** Keeps everything under /admin away from ordinary visitors. */
export function proxy(req: NextRequest) {
  const access = adminAccess({ password: process.env.ADMIN_PASSWORD, nodeEnv: process.env.NODE_ENV, authorization: req.headers.get("authorization") });
  if (access === "allow") return NextResponse.next();
  if (access === "hidden") return new NextResponse("Not Found", { status: 404 });
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"' } });
}

export const config = { matcher: ["/admin/:path*"] };
