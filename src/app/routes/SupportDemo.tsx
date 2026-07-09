import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth, UserButton } from "@clerk/clerk-react";
import { createClient, AnamEvent } from "@anam-ai/js-sdk";
import { Loader2, PhoneOff, Sparkles, Wrench, Check, Trash2 } from "lucide-react";

const ANNE_ID = "6b4df3c2-c9ce-49e7-a95b-8816e8216586";

type ToolEvent = { id: string; name: string; status: "running" | "done" | "failed"; ms?: number; at: number };
async function fetchSessionTokenForAnne(): Promise<string> {
  // Stateful persona: tools attached to Anne load automatically.
  const res = await fetch("/api/session-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ personaConfig: { personaId: ANNE_ID } }),
  });
  if (!res.ok) throw new Error(`session token failed: ${res.status}`);
  const data = await res.json();
  return data.sessionToken ?? data.token;
}

export default function SupportDemo() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ended" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<any>(null);
  const seenRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    return () => {
      clientRef.current?.stopStreaming?.().catch?.(() => {});
    };
  }, []);

  async function start() {
    if (!videoRef.current) return;
    setErr(null);
    setPhase("connecting");
    try {
      const token = await fetchSessionTokenForAnne();
      const client = createClient(token);
      clientRef.current = client;

      // Tool-call lifecycle → live feed (register before streaming).
      client.addListener(AnamEvent.TOOL_CALL_STARTED, (e: any) => {
        setToolEvents((prev) => [
          { id: e.toolCallId ?? `${e.toolName}-${Date.now()}`, name: e.toolName, status: "running", at: Date.now() },
          ...prev,
        ]);
      });
      client.addListener(AnamEvent.TOOL_CALL_COMPLETED, (e: any) => {
        setToolEvents((prev) =>
          prev.map((t) =>
            t.name === e.toolName && t.status === "running"
              ? { ...t, status: "done", ms: e.executionTime }
              : t,
          ),
        );
      });
      const ready = new Promise<void>((resolve) => {
        client.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => resolve());
      });

      if (!videoRef.current.id) videoRef.current.id = "anne-demo-stage";
      await client.streamToVideoElement(videoRef.current.id);
      await ready;
      setPhase("live");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setPhase("error");
    }
  }

  async function end() {
    await clientRef.current?.stopStreaming?.().catch?.(() => {});
    clientRef.current = null;
    setPhase("ended");
  }

  async function runSetup(teardown = false) {
    setSettingUp(true);
    setSetupMsg(null);
    try {
      const token = await getToken();
      const r = await fetch(`/api/anne-tools-setup${teardown ? "?mode=teardown" : ""}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setSetupMsg(r.ok ? `Ready: ${d.steps?.join(" · ")}` : `Setup failed: ${d.error}`);
    } catch (e: any) {
      setSetupMsg(`Setup failed: ${e?.message ?? e}`);
    } finally {
      setSettingUp(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-5 md:px-8">
          <Link to="/" className="text-[14px] font-semibold tracking-tight">
            Goblin Labs
          </Link>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Support demo · Anne × Zendesk
          </div>
          <div className="flex w-24 justify-end">{isSignedIn ? <UserButton /> : <Link to="/login?redirect=/demo/support" className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">Sign in</Link>}</div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] gap-6 px-5 pb-16 pt-24 md:grid-cols-[minmax(0,1fr)_400px] md:px-8">
        {/* Stage */}
        <div className="relative aspect-[3/4] w-full max-w-[520px] justify-self-center overflow-hidden rounded-3xl border border-border/60 bg-black md:aspect-auto md:min-h-[640px]">
          <video ref={videoRef} id="anne-demo-stage" autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          {phase !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 px-6 text-center backdrop-blur-sm">
              <div className="text-[1.5rem] font-medium tracking-tight">Anne · Support</div>
              {phase === "connecting" ? (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                </div>
              ) : phase === "error" ? (
                <>
                  <div className="max-w-[320px] rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">{err}</div>
                  <button onClick={start} className="rounded-full bg-foreground px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-background">Try again</button>
                </>
              ) : (
                <>
                  <p className="max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
                    Report a problem, ask about an existing ticket, or give her an update, then watch the panel as she works your Zendesk.
                  </p>
                  <button onClick={start} className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-background">
                    <Sparkles className="h-4 w-4" /> Start conversation
                  </button>
                </>
              )}
            </div>
          )}
          {phase === "live" && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent pb-5 pt-12">
              <button onClick={end} className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white">
                <PhoneOff className="h-4 w-4" /> End
              </button>
            </div>
          )}
        </div>

        {/* Activity rail */}
        <aside className="flex flex-col gap-5">
          <section className="rounded-2xl border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Anne's actions</h2>
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <ul className="mt-3 flex max-h-[220px] flex-col gap-2 overflow-y-auto">
              {toolEvents.length === 0 ? (
                <li className="text-[12px] text-muted-foreground">Tool calls will appear here live as Anne works.</li>
              ) : (
                toolEvents.map((t) => (
                  <li key={t.id + t.at} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
                    <span className="font-mono text-[12px]">{t.name}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {t.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : t.status === "done" ? <Check className="h-3 w-3" /> : "failed"}
                      {t.ms ? `${t.ms}ms` : t.status}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>


          {isSignedIn && (
            <section className="rounded-2xl border border-dashed border-border/60 p-4">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">One-time wiring</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                Wire up before recording; tear down after. Keep your Zendesk dashboard open in another tab and you'll see changes land there live.
              </p>
              <button onClick={() => runSetup(false)} disabled={settingUp} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-[12px] hover:bg-foreground/5 disabled:opacity-50">
                {settingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />} Wire up Anne × Zendesk
              </button>
              <button onClick={() => runSetup(true)} disabled={settingUp} className="ml-2 mt-3 inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-[12px] text-destructive hover:bg-destructive/5 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Tear down
              </button>
              {setupMsg && <div className="mt-2 break-words text-[11px] text-muted-foreground">{setupMsg}</div>}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
