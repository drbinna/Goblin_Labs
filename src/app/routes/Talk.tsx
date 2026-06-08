import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router";
import { Loader2, Mic, PhoneOff, Sparkles } from "lucide-react";
import {
  startPreview,
  getPersona,
  type SessionHandle,
  type DeployedPersona,
} from "@/app/lib/anam";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";

export default function Talk() {
  const { id } = useParams<{ id: string }>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [persona, setPersona] = useState<DeployedPersona | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<SessionHandle | null>(null);

  const name = persona?.name ?? "Persona";

  // Resolve the persona (name + config) up front so "Start" is instant.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPersona(id)
      .then((p) => {
        if (!cancelled && p) setPersona(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Tear the session down on unmount.
  useEffect(() => {
    return () => {
      handleRef.current?.stop().catch(() => {});
    };
  }, []);

  async function start() {
    if (!id || !videoRef.current) return;
    setErr(null);
    setPhase("connecting");
    try {
      // Ensure we have the persona's config (in case the mount fetch is still in flight).
      let p = persona;
      if (!p) {
        p = await getPersona(id);
        if (p) setPersona(p);
      }
      if (!p) throw new Error("This persona could not be found.");
      handleRef.current = await startPreview(videoRef.current, p.config);
      setPhase("live");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setPhase("error");
    }
  }

  async function end() {
    await handleRef.current?.stop().catch(() => {});
    handleRef.current = null;
    setPhase("ended");
  }

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-[14px] text-muted-foreground">No persona specified.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="text-[14px] font-semibold tracking-tight">
          Goblin Labs
        </Link>
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {phase === "live" ? "Live" : "Persona"}
        </span>
      </header>

      {/* Stage */}
      <main className="flex min-h-screen items-center justify-center px-4 py-20">
        <div className="relative aspect-[3/4] w-full max-w-[460px] overflow-hidden rounded-3xl border border-border/60 bg-black shadow-2xl">
          <video
            ref={videoRef}
            id="anam-talk-stage"
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Pre-start / connecting / ended overlays */}
          {phase !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 px-6 text-center backdrop-blur-sm">
              <div className="text-[1.6rem] font-medium tracking-tight">{name}</div>

              {phase === "idle" && (
                <>
                  <p className="max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
                    A real-time persona from Goblin Labs. It sees and hears you,
                    and talks back. Your mic stays on while the call is live.
                  </p>
                  <button
                    onClick={start}
                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-background"
                  >
                    <Sparkles className="h-4 w-4" />
                    Start conversation
                  </button>
                  <p className="text-[11px] text-muted-foreground">
                    Allow microphone access when prompted.
                  </p>
                </>
              )}

              {phase === "connecting" && (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                </div>
              )}

              {phase === "ended" && (
                <button
                  onClick={start}
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-background"
                >
                  Start again
                </button>
              )}

              {phase === "error" && (
                <>
                  <div className="max-w-[300px] rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
                    {err ?? "Couldn't start the session."}
                  </div>
                  <button
                    onClick={start}
                    className="mt-1 inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-background"
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
          )}

          {/* Live controls */}
          {phase === "live" && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-12">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white backdrop-blur">
                <Mic className="h-3.5 w-3.5" /> Listening
              </span>
              <button
                onClick={end}
                aria-label="End conversation"
                className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white"
              >
                <PhoneOff className="h-4 w-4" /> End
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="absolute inset-x-0 bottom-0 z-10 px-5 py-4 text-center text-[11px] text-muted-foreground">
        Built with Goblin Labs · real-time AI personas
      </footer>
    </div>
  );
}
