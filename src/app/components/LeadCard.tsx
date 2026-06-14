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

  useEffect(() => {
    if (!prefill || sent) return;
    if (!touched.current.name && prefill.name) setName(prefill.name);
    if (!touched.current.email && prefill.email) setEmail(prefill.email);
    if (!touched.current.company && prefill.company) setCompany(prefill.company);
  }, [prefill, sent]);

  const emailOk = EMAIL_RE.test(email.trim());

  async function submit() {
    if (!emailOk || sending) return;
    setSending(true);
    setError(null);
    try {
      await captureContact(personaId, {
        name: name.trim() || undefined,
        email: email.trim(),
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
    "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-[13px] outline-none transition-colors focus:border-foreground/40";

  return (
    <div
      className={`rounded-2xl border border-border/60 bg-background/80 p-5 backdrop-blur ${className}`}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Leave your details
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Drop your email and {personaName ?? "we"} will follow up — no need to spell it out loud.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        <input
          className={inputCls}
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => {
            touched.current.name = true;
            setName(e.target.value);
          }}
          autoComplete="name"
        />
        <input
          className={inputCls}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            touched.current.email = true;
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
          className={inputCls}
          placeholder="Company (optional)"
          value={company}
          onChange={(e) => {
            touched.current.company = true;
            setCompany(e.target.value);
          }}
          autoComplete="organization"
        />
      </div>

      {error && (
        <p className="mt-3 text-[12px] text-destructive">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={!emailOk || sending}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-background disabled:opacity-40"
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
