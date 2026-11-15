import { Suspense } from "react";
import Link from "next/link";
import { demoModeEnabled } from "@medstock/shared-types";
import { Button } from "@/components/ui/button";
import { safeReturnPath } from "@/lib/cognito";
import { missingDemoSettings } from "@/lib/demo-mode";
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
  const demo = demoModeEnabled(process.env);
  const missing = demo ? missingDemoSettings(process.env) : missingWebAuthSettings(process.env);
  const configured = missing.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
      {demo ? (
        <p className="mb-4 rounded-md bg-warning/20 px-3 py-2 text-center text-xs font-semibold tracking-wide" role="status">
          DEMO ENVIRONMENT — SAMPLE DATA ONLY
        </p>
      ) : null}
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-xs">
      <p className="text-xs font-semibold tracking-wide text-primary">MedStock</p>
      <h1>{demo ? "Demo entry" : "Sign in"}</h1>
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
      {demo && configured ? (
        <>
          <p className="leading-7 text-muted-foreground">
            Choose a sample workspace. MedStock maps the choice to a fixed demo identity on the server. The browser
            cannot assign a role or organization. This is sample data, not a customer account.
          </p>
          <div className="flex flex-col gap-2">
            <DemoChoice persona="retailer" label="Continue as retailer" />
            <DemoChoice persona="distributor" label="Continue as distributor" />
            <DemoChoice persona="administrator" label="Continue as platform administrator" />
          </div>
        </>
      ) : null}
      {!demo && configured ? (
        <>
          <p className="leading-7 text-muted-foreground">
            You will continue at the Cognito sign-in page. MedStock stores the session in an HttpOnly cookie and
            does not keep the access token in the browser.
          </p>
          <Button asChild className="w-fit">
            <Link href={`/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Continue to sign in</Link>
          </Button>
        </>
      ) : null}
      {!configured ? (
        <section className="space-y-3">
          <p className="leading-7 text-muted-foreground">
            {demo
              ? "Demo sign-in is enabled, but the server settings are incomplete. Add these server environment variables and restart Next.js. Do not expose the secrets to the browser."
              : "Cognito is not configured for this web app, so sign-in cannot start. Add these server environment variables and restart Next.js. Do not put a client secret in a public variable."}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {missing.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        Back to MedStock
      </Link>
      </section>
    </main>
  );
}

function DemoChoice({ persona, label }: { persona: string; label: string }) {
  return (
    <form action="/api/auth/demo" method="post">
      <input type="hidden" name="persona" value={persona} />
      <Button type="submit" className="w-full">
        {label}
      </Button>
    </form>
  );
}
