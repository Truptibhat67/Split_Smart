import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/expenses(.*)",
  "/contacts(.*)",
  "/groups(.*)",
  "/person(.*)",
  "/settlements(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  const url = req.nextUrl;
  const pathname = url.pathname;

  if (!userId && isProtectedRoute(req)) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }

  // If the user is already signed in and is on a public/auth page,
  // send them straight to the dashboard.
  if (
    userId &&
    (pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))
  ) {
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
