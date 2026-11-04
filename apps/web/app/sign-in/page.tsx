import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { safeReturnPath } from "@/lib/cognito";
import { missingWebAuthSettings } from "@/lib/web-auth-config";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[]; returnTo?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p className="px-6 py-16 text-sm text-muted-foreground">Loading sign-in…</p>}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInContent({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[]; returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "";
  const returnTo = safeReturnPath(typeof params.returnTo === "string" ? params.returnTo : undefined);
  const missing = missingWebAuthSettings(process.env);
  const configured = missing.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-xs">
      <p className="text-xs font-semibold tracking-wide text-primary">MedStock</p>
      <h1>Sign in</h1>
      {reason === "expired" ? (
        <p className="leading-7 text-muted-foreground" role="status">
          Your session expired. Sign in again to continue.
        </p>
      ) : null}
      {reason === "callback" ? (
        <p className="leading-7 text-muted-foreground" role="alert">
          Sign-in did not finish. Start again from MedStock.
        </p>
      ) : null}
      {configured ? (
        <>
          <p className="leading-7 text-muted-foreground">
            You will continue at the Cognito sign-in page. MedStock stores the session in an HttpOnly cookie and
            does not keep the access token in the browser.
          </p>
          <Button asChild className="w-fit">
            <Link href={`/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Continue to sign in</Link>
          </Button>
        </>
      ) : (
        <section className="space-y-3">
          <p className="leading-7 text-muted-foreground">
            Cognito is not configured for this web app, so sign-in cannot start. Add these server environment
            variables and restart Next.js. Do not put a client secret in a public variable.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {missing.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        Back to MedStock
      </Link>
      </section>
    </main>
  );
}
