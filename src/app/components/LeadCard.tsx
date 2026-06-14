import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { captureContact } from "@/app/lib/leads";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Prefill = { name?: string; email?: string; company?: string };

/**
 * Reliable, typed lead capture that runs alongside the voice conversation.
 * The email is typed and validated here — it never has to be spoken back and
 * re-transcribed, which is what broke capture in the live sessions.
 *
 * `prefill` is the hook for avatar-assisted capture: once a CLIENT tool is
 * attached to the persona, the tool handler can pass inferred values in and the
 * visitor just confirms. The card is fully functional without it.
 */
export default function LeadCard({
  personaId,
  personaName,
  prefill,
  className = "",
}: {
  personaId: string;
  personaName?: string;
  prefill?: Prefill;
  className?: string;
}) {
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [company, setCompany] = useState(prefill?.company ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which fields the visitor has edited. Gabriel's prefills update only
  // untouched fields, so his late corrections land but typed input is never
  // stomped.
  const touched = useRef({ name: false, email: false, company: false });

  // Fields Gabriel is actively "typing" into right now (drives the glow + badge).
  const [filling, setFilling] = useState<{ name?: boolean; email?: boolean; company?: boolean }>({});
  const timers = useRef<Record<string, ReturnType<typeof setInterval> | null>>({});
  const setters = { name: setName, email: setEmail, company: setCompany } as const;

  function stopFill(field: "name" | "email" | "company") {
    const t = timers.current[field];
    if (t) {
      clearInterval(t);
      timers.current[field] = null;
    }
  }

  // Type `target` into a field character-by-character so the visitor watches
  // the form fill itself live, instead of values teleporting in. This is the
  // demo moment: Gabriel says a detail, the field fills as he speaks.
  function typeInto(field: "name" | "email" | "company", target: string) {
    stopFill(field);
    setFilling((f) => ({ ...f, [field]: true }));
    setters[field]("");
    let i = 0;
    timers.current[field] = setInterval(() => {
      i += 1;
      setters[field](target.slice(0, i));
      if (i >= target.length) {
        stopFill(field);
        setFilling((f) => ({ ...f, [field]: false }));
      }
    }, 45);
  }

  // The visitor taking over a field cancels any in-flight animation there.
  function takeOver(field: "name" | "email" | "company") {
    touched.current[field] = true;
    stopFill(field);
    setFilling((f) => ({ ...f, [field]: false }));
  }

  useEffect(() => {
    if (!prefill || sent) return;
    if (!touched.current.name && prefill.name && prefill.name !== name) typeInto("name", prefill.name);
    if (!touched.current.email && prefill.email && prefill.email !== email) typeInto("email", prefill.email);
    if (!touched.current.company && prefill.company && prefill.company !== company) typeInto("company", prefill.company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, sent]);

  // Clear any running animation if the card unmounts mid-fill.
  useEffect(() => () => Object.keys(timers.current).forEach((k) => stopFill(k as "name")), []);

  const emailOk = EMAIL_RE.test(email.trim());
  const hasAnything = !!(name.trim() || email.trim() || company.trim());
  const anyFilling = !!(filling.name || filling.email || filling.company);

  async function submit() {
    if (sending || !hasAnything) return;
    setSending(true);
    setError(null);
    try {
      await captureContact(personaId, {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
      });
      setSent(true);
      toast.success("Got it — thanks! We'll be in touch.");
    } catch {
      setError("Couldn't save that. Mind trying again?");
      toast.error("Couldn't save that. Mind trying again?");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div
        className={`rounded-2xl border border-border/60 bg-background/80 p-5 backdrop-blur ${className}`}
      >
        <div className="flex items-center gap-2 text-[14px] font-medium">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="h-3.5 w-3.5" />
          </span>
          You&apos;re on the list
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Thanks{name ? `, ${name.split(" ")[0]}` : ""} — Obi will follow up at{" "}
          <span className="text-foreground">{email.trim()}</span>. Keep chatting with{" "}
          {personaName ?? "the persona"} if you like.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] outline-none transition-all focus:border-foreground/40";
  // Glow applied to a field while Gabriel is typing into it.
  const fillCls = "border-foreground/50 ring-2 ring-foreground/30 bg-foreground/[0.04]";

  return (
    <div
      className={`rounded-2xl border border-border/60 bg-background/80 p-5 backdrop-blur ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Leave your details
        </div>
        {anyFilling && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground" />
            </span>
            {(personaName ?? "Gabriel").split(" ")[0]} is filling this in…
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Drop your email and {personaName ?? "we"} will follow up — no need to spell it out loud.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        <input
          className={`${inputCls} ${filling.name ? fillCls : ""}`}
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => {
            takeOver("name");
            setName(e.target.value);
          }}
          autoComplete="name"
        />
        <input
          className={`${inputCls} ${filling.email ? fillCls : ""}`}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            takeOver("email");
            setError(null);
            setEmail(e.target.value);
          }}
          type="email"
          autoComplete="email"
          inputMode="email"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <input
          className={`${inputCls} ${filling.company ? fillCls : ""}`}
          placeholder="Company (optional)"
          value={company}
          onChange={(e) => {
            takeOver("company");
            setCompany(e.target.value);
          }}
          autoComplete="organization"
        />
      </div>

      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}
      {!error && email.trim() && !emailOk && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          That email looks off — we&apos;ll still save it, but double-check it if you want a reply.
        </p>
      )}

      <button
        onClick={() => {
          if (sending) return;
          if (!hasAnything) {
            setError("Add your email (or name) first.");
            return;
          }
          submit();
        }}
        disabled={sending}
        aria-disabled={!hasAnything}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-all ${
          hasAnything && !sending
            ? "cursor-pointer bg-foreground text-background shadow-sm hover:opacity-90"
            : sending
              ? "cursor-wait bg-foreground text-background opacity-80"
              : "cursor-pointer bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {sending ? "Sending" : "Send"}
      </button>
    </div>
  );
}
