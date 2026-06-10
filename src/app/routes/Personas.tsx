import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth, UserButton, useUser } from "@clerk/clerk-react";
import { ArrowRight, Copy, Check, Loader2 } from "lucide-react";

type PersonaRow = {
  anamPersonaId: string;
  name: string;
  vertical: string | null;
  createdAt: string;
};

export default function Personas() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [rows, setRows] = useState<PersonaRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/personas-mine", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const data = await res.json();
        setRows(data.personas ?? []);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  async function copyLink(id: string) {
    const url = `${window.location.origin}/p/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch {}
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-5 md:px-8">
          <Link to="/" className="text-[14px] font-semibold tracking-tight">
            Goblin Labs
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/studio"
              className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              Studio
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-28 md:px-8">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {user?.primaryEmailAddress?.emailAddress ?? "Your account"}
          </div>
          <h1 className="mt-2 text-[2rem] tracking-tight">
            My <span className="font-serif-italic">personas</span>
          </h1>
        </div>

        {!isLoaded ? null : !isSignedIn ? (
          <div className="rounded-xl border border-border/60 p-6 text-[13px] text-muted-foreground">
            You're not signed in.{" "}
            <Link to="/login?redirect=/personas" className="text-foreground underline">
              Sign in
            </Link>{" "}
            to see your personas.
          </div>
        ) : err ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-[13px] text-destructive">
            {err}
          </div>
        ) : rows === null ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border/60 p-6">
            <p className="text-[13px] text-muted-foreground">
              Nothing deployed yet. Build one in the Studio and hit Deploy — it
              will show up here with its share link.
            </p>
            <Link
              to="/studio"
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.16em] text-foreground"
            >
              Open Studio <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((p) => (
              <li
                key={p.anamPersonaId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px]">{p.name}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {p.vertical ?? "persona"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => copyLink(p.anamPersonaId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-[12px] hover:bg-foreground/5"
                  >
                    {copied === p.anamPersonaId ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied === p.anamPersonaId ? "Copied" : "Copy link"}
                  </button>
                  <a
                    href={`/p/${p.anamPersonaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[12px] font-semibold text-background"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
