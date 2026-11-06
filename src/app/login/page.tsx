// The login page (only reachable on the online version, where logins are switched on).
import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { APP_NAME } from "@/lib/app-info";
import { safeNext } from "@/lib/auth/gate";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-black px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">{APP_NAME}</h1>
      <p className="text-zinc-400">Log in with the username and password you were given.</p>
      {/* The page to return to comes from the address, read inside a loading boundary. */}
      <Suspense fallback={<LoginForm next="/" />}>
        <FormFor searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function FormFor({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  return <LoginForm next={safeNext(typeof params.next === "string" ? params.next : null)} />;
}
