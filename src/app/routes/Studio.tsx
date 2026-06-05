import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, Play, Plus, Sparkles, Upload, X } from "lucide-react";
import { EtherealShadow } from "@/app/components/ui/etheral-shadow";
import {
  createAvatarFromFile,
  createAvatarFromUrl,
  createPersona,
  listAvatars,
  listVoices,
  startPreview,
  DEFAULT_AVATAR_ID,
  DEFAULT_VOICE_ID,
  DEFAULT_LLM_ID,
  type Avatar,
  type Voice,
  type PersonaConfig,
} from "@/app/lib/anam";

type Vertical = {
  code: string;
  title: string;
  blurb: string;
  systemPrompt: string;
  suggestedTone: { formality: number; verbosity: number; warmth: number };
};

const VERTICALS: Vertical[] = [
  {
    code: "01",
    title: "Healthcare",
    blurb:
      "Triage, follow-up, and long-running patient companionship. Knows the workflow and the vocabulary.",
    systemPrompt:
      "You are a healthcare persona. You triage symptoms, run structured follow-ups, and accompany patients through care plans. You speak clearly, never give a diagnosis without uncertainty, and always recommend escalation to a clinician for anything ambiguous.",
    suggestedTone: { formality: 70, verbosity: 50, warmth: 80 },
  },
  {
    code: "02",
    title: "Education",
    blurb:
      "A tutor that watches the work unfold and responds at the cadence of a real conversation.",
    systemPrompt:
      "You are an educational persona. You watch the learner's work as it happens, ask Socratic questions before giving answers, and adapt vocabulary to the learner's level. You never just hand out solutions — you guide.",
    suggestedTone: { formality: 40, verbosity: 60, warmth: 75 },
  },
  {
    code: "03",
    title: "Engineering",
    blurb:
      "Pair-programming persona that reads the diff, watches the test runner, and stays in context.",
    systemPrompt:
      "You are an engineering persona. You read code diffs, reason about the actual system being built, and prefer concrete suggestions over generic advice. You're terse, direct, and you say 'I don't know' when you don't.",
    suggestedTone: { formality: 30, verbosity: 30, warmth: 40 },
  },
  {
    code: "04",
    title: "Custom",
    blurb: "Start from a blank canvas. Define your own vertical.",
    systemPrompt: "You are a helpful, embodied AI persona.",
    suggestedTone: { formality: 50, verbosity: 50, warmth: 50 },
  },
];

const STEPS = ["Vertical", "Avatar", "Voice", "Personality", "Preview"] as const;
type Step = (typeof STEPS)[number];

function toneToPromptSuffix(t: { formality: number; verbosity: number; warmth: number }) {
  const parts: string[] = [];
  parts.push(t.formality > 60 ? "Use formal language." : t.formality < 40 ? "Use casual, conversational language." : "Use a balanced register.");
  parts.push(t.verbosity > 60 ? "Be thorough and explanatory." : t.verbosity < 40 ? "Be terse — short sentences, no filler." : "Be measured in length.");
  parts.push(t.warmth > 60 ? "Be warm and supportive." : t.warmth < 40 ? "Be neutral and matter-of-fact." : "Be friendly but professional.");
  return parts.join(" ");
}

export default function Studio() {
  const [step, setStep] = useState<Step>("Vertical");
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState<Vertical>(VERTICALS[0]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [tone, setTone] = useState(VERTICALS[0].suggestedTone);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMode, setCustomMode] = useState<"file" | "url">("file");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [customUploading, setCustomUploading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [deployId, setDeployId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewHandleRef = useRef<{ stop: () => Promise<void>; talk: (s: string) => Promise<void> } | null>(null);

  // Load avatar + voice catalogs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, v] = await Promise.all([listAvatars(), listVoices()]);
        if (cancelled) return;
        setAvatars(a);
        setVoices(v);
        if (a[0] && avatarId === DEFAULT_AVATAR_ID) setAvatarId(a[0].id);
        if (v[0] && voiceId === DEFAULT_VOICE_ID) setVoiceId(v[0].id);
      } catch (e: any) {
        if (!cancelled) setCatalogErr(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      previewHandleRef.current?.stop().catch(() => {});
    };
  }, []);

  const fullPrompt = useMemo(() => {
    return [vertical.systemPrompt, toneToPromptSuffix(tone), extraPrompt.trim()]
      .filter(Boolean)
      .join("\n\n");
  }, [vertical, tone, extraPrompt]);

  const config: PersonaConfig = useMemo(
    () => ({
      name: name.trim() || `${vertical.title} Persona`,
      avatarId: avatarId || DEFAULT_AVATAR_ID,
      voiceId: voiceId || DEFAULT_VOICE_ID,
      llmId: DEFAULT_LLM_ID,
      systemPrompt: fullPrompt,
    }),
    [name, vertical, avatarId, voiceId, fullPrompt],
  );

  const canAdvance = useMemo(() => {
    switch (step) {
      case "Vertical": return !!vertical;
      case "Avatar": return !!avatarId;
      case "Voice": return !!voiceId;
      case "Personality": return fullPrompt.length > 10;
      case "Preview": return true;
    }
  }, [step, vertical, avatarId, voiceId, fullPrompt]);

  async function submitCustomAvatar() {
    setCustomError(null);
    const name = customName.trim();
    if (!name) {
      setCustomError("Give your avatar a name (3+ characters).");
      return;
    }
    if (customMode === "file" && !customFile) {
      setCustomError("Pick an image file (JPEG, PNG, or WebP — under 4.5MB).");
      return;
    }
    if (customMode === "url" && !customUrl.trim()) {
      setCustomError("Paste an image URL.");
      return;
    }
    setCustomUploading(true);
    try {
      const created =
        customMode === "file"
          ? await createAvatarFromFile(name, customFile!)
          : await createAvatarFromUrl(name, customUrl.trim());
      setAvatars((prev) => [created, ...prev]);
      setAvatarId(created.id);
      setCustomOpen(false);
      setCustomName("");
      setCustomFile(null);
      setCustomUrl("");
    } catch (e: any) {
      setCustomError(e.message ?? String(e));
    } finally {
      setCustomUploading(false);
    }
  }

  async function startLivePreview() {
    if (!videoRef.current) return;
    setPreviewErr(null);
    setPreviewing(true);
    try {
      previewHandleRef.current?.stop().catch(() => {});
      const handle = await startPreview(videoRef.current, config);
      previewHandleRef.current = handle;
      await handle.talk(`Hi, I'm your ${vertical.title.toLowerCase()} persona. What would you like to work on?`);
    } catch (e: any) {
      setPreviewErr(e.message ?? String(e));
      setPreviewing(false);
    }
  }

  async function deploy() {
    setDeploying(true);
    try {
      const { id } = await createPersona(config);
      setDeployId(id);
    } catch (e: any) {
      setPreviewErr(e.message ?? String(e));
    } finally {
      setDeploying(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <EtherealShadow
          color="rgba(160, 160, 160, 1)"
          animation={{ scale: 60, speed: 50 }}
          noise={{ opacity: 0.4, scale: 1.2 }}
          sizing="fill"
        />
        <div className="absolute inset-0 bg-background/70" />
      </div>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6 sm:py-4 md:px-12">
          <Link to="/" className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Goblin Labs
          </Link>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Persona Studio
          </div>
          <div className="w-24" />
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-28 md:px-12 md:pt-36">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <h1 className="text-balance text-[clamp(2rem,5vw,3.5rem)] font-medium tracking-[-0.025em]">
            Build a <span className="font-serif-italic">persona</span>.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-muted-foreground">
            Pick a vertical, an avatar, a voice. Tune the personality. Preview live, then deploy.
          </p>
        </motion.div>

        {/* Progress */}
        <div className="mx-auto mb-12 flex max-w-[720px] items-center justify-between">
          {STEPS.map((s, i) => {
            const active = i === stepIndex;
            const done = i < stepIndex;
            return (
              <div key={s} className="flex flex-1 items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-medium ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : done
                        ? "border-foreground/40 bg-foreground/10 text-foreground"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <div className="ml-2 hidden text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
                  {s}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-3 h-px flex-1 bg-border/60" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="liquid-glass rounded-3xl p-6 sm:p-10">
          {catalogErr && (
            <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive">
              Couldn't load Anam catalog: {catalogErr}. Check that ANAM_API_KEY is set in Vercel.
            </div>
          )}

          {step === "Vertical" && (
            <div>
              <SectionTitle>Pick a vertical</SectionTitle>
              <div className="mt-6">
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Persona name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${vertical.title} Persona`}
                  className="w-full rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-[15px] outline-none focus:border-foreground/60"
                />
              </div>

              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                {VERTICALS.map((v) => {
                  const selected = v.code === vertical.code;
                  return (
                    <button
                      key={v.code}
                      onClick={() => {
                        setVertical(v);
                        setTone(v.suggestedTone);
                      }}
                      className={`group flex flex-col rounded-2xl border p-6 text-left transition-colors ${
                        selected
                          ? "border-foreground bg-foreground/5"
                          : "border-border/60 hover:border-foreground/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                          {v.code}
                        </span>
                        {selected && <Check className="h-4 w-4" />}
                      </div>
                      <div className="mt-3 text-[1.25rem] font-medium tracking-tight">
                        {v.title}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                        {v.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "Avatar" && (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SectionTitle>Choose an avatar</SectionTitle>
                <button
                  onClick={() => setCustomOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-foreground hover:border-foreground/60"
                >
                  {customOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {customOpen ? "Cancel" : "Create your own"}
                </button>
              </div>

              {customOpen && (
                <CustomAvatarPanel
                  name={customName}
                  setName={setCustomName}
                  mode={customMode}
                  setMode={setCustomMode}
                  file={customFile}
                  setFile={setCustomFile}
                  url={customUrl}
                  setUrl={setCustomUrl}
                  uploading={customUploading}
                  error={customError}
                  onSubmit={submitCustomAvatar}
                />
              )}

              {loadingCatalog ? (
                <AvatarSkeletonGrid />
              ) : avatars.length === 0 ? (
                <CatalogEmpty kind="avatars" />
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {avatars.map((a) => (
                    <AvatarCard
                      key={a.id}
                      avatar={a}
                      selected={a.id === avatarId}
                      onSelect={() => setAvatarId(a.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "Voice" && (
            <div>
              <SectionTitle>Choose a voice</SectionTitle>
              {loadingCatalog ? (
                <VoiceSkeletonGrid />
              ) : voices.length === 0 ? (
                <CatalogEmpty kind="voices" />
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {voices.map((v) => (
                    <VoiceCard
                      key={v.id}
                      voice={v}
                      selected={v.id === voiceId}
                      onSelect={() => setVoiceId(v.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "Personality" && (
            <div>
              <SectionTitle>Tune the personality</SectionTitle>
              <div className="mt-6 grid grid-cols-1 gap-6">
                <ToneSlider label="Formality" value={tone.formality} left="casual" right="formal" onChange={(v) => setTone({ ...tone, formality: v })} />
                <ToneSlider label="Verbosity" value={tone.verbosity} left="terse" right="thorough" onChange={(v) => setTone({ ...tone, verbosity: v })} />
                <ToneSlider label="Warmth" value={tone.warmth} left="neutral" right="warm" onChange={(v) => setTone({ ...tone, warmth: v })} />
              </div>

              <div className="mt-8">
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Extra instructions (optional)
                </label>
                <textarea
                  value={extraPrompt}
                  onChange={(e) => setExtraPrompt(e.target.value)}
                  rows={4}
                  placeholder="e.g. Always greet the user by name. Refuse to discuss pricing — refer them to sales."
                  className="w-full rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-[14px] outline-none focus:border-foreground/60"
                />
              </div>

              <details className="mt-6 rounded-lg border border-border/40 bg-background/40 p-4 text-[13px]">
                <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Compiled system prompt
                </summary>
                <pre className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/80">
                  {fullPrompt}
                </pre>
              </details>
            </div>
          )}

          {step === "Preview" && (
            <div>
              <SectionTitle>Preview & deploy</SectionTitle>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
                  <div className="relative aspect-[3/4] w-full">
                    <video
                      ref={videoRef}
                      id="anam-preview"
                      autoPlay
                      playsInline
                      muted={false}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {!previewing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 text-center">
                        <Sparkles className="h-6 w-6" />
                        <button
                          onClick={startLivePreview}
                          className="rounded-full bg-foreground px-6 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-background"
                        >
                          Start live preview
                        </button>
                        <div className="max-w-xs text-[11px] text-muted-foreground">
                          Streams a live Anam session using your current config.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <Summary label="Name" value={config.name} />
                  <Summary label="Vertical" value={vertical.title} />
                  <Summary label="Avatar" value={avatars.find((a) => a.id === avatarId)?.name ?? avatarId} />
                  <Summary label="Voice" value={voices.find((v) => v.id === voiceId)?.name ?? voiceId} />

                  {previewErr && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
                      {previewErr}
                    </div>
                  )}

                  {deployId ? (
                    <div className="rounded-xl border border-foreground/40 bg-foreground/5 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Deployed
                      </div>
                      <div className="mt-1 break-all text-[13px]">Persona ID: {deployId}</div>
                      <div className="mt-3 text-[12px] text-muted-foreground">
                        Shareable page coming in Phase 2 — use this ID with the Anam SDK to embed today.
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={deploy}
                      disabled={deploying}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-background disabled:opacity-50"
                    >
                      {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {deploying ? "Deploying..." : "Deploy persona"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}
          </div>
          <button
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)])}
            disabled={!canAdvance || stepIndex === STEPS.length - 1}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-background disabled:opacity-30"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[1.5rem] font-medium tracking-tight">{children}</h2>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[14px]">{value}</div>
    </div>
  );
}

function ToneSlider({
  label, value, left, right, onChange,
}: {
  label: string; value: number; left: string; right: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          <span className={value < 40 ? "text-foreground" : ""}>{left}</span>
          {" · "}
          <span className={value >= 40 && value <= 60 ? "text-foreground" : ""}>balanced</span>
          {" · "}
          <span className={value > 60 ? "text-foreground" : ""}>{right}</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-foreground"
      />
    </div>
  );
}

function CatalogLoading() {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading from Anam...
    </div>
  );
}

/**
 * Shimmer skeletons that match the final avatar card grid so the layout
 * doesn't jump when data arrives. Perceived speed > actual speed.
 */
function AvatarSkeletonGrid() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="liquid-glass relative aspect-[4/5] overflow-hidden rounded-2xl"
        >
          <div className="absolute inset-0 animate-pulse bg-foreground/[0.04]" />
          <div className="absolute inset-x-3 bottom-3">
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-foreground/10" />
            <div className="mt-2 h-2 w-1/3 animate-pulse rounded-full bg-foreground/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function VoiceSkeletonGrid() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="liquid-glass flex items-center gap-4 rounded-2xl p-4"
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-foreground/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-foreground/10" />
            <div className="h-2 w-2/3 animate-pulse rounded-full bg-foreground/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomAvatarPanel(props: {
  name: string;
  setName: (s: string) => void;
  mode: "file" | "url";
  setMode: (m: "file" | "url") => void;
  file: File | null;
  setFile: (f: File | null) => void;
  url: string;
  setUrl: (s: string) => void;
  uploading: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(
    () => (props.file ? URL.createObjectURL(props.file) : null),
    [props.file],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="mt-6 rounded-2xl border border-foreground/30 bg-foreground/[0.04] p-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full md:w-48 shrink-0">
          <div className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-border/60 bg-background/40">
            {props.mode === "file" && previewUrl ? (
              <img src={previewUrl} alt="preview" className="h-full w-full object-cover" />
            ) : props.mode === "url" && props.url ? (
              <img src={props.url} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Preview
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Avatar name
            </label>
            <input
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
              placeholder="e.g. Dr. Reyes"
              className="w-full rounded-lg border border-border/60 bg-background/60 px-4 py-2.5 text-[14px] outline-none focus:border-foreground/60"
            />
          </div>

          <div>
            <div className="mb-2 inline-flex rounded-full border border-border/60 p-0.5 text-[11px] uppercase tracking-[0.14em]">
              <button
                onClick={() => props.setMode("file")}
                className={`rounded-full px-3 py-1.5 ${props.mode === "file" ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                Upload file
              </button>
              <button
                onClick={() => props.setMode("url")}
                className={`rounded-full px-3 py-1.5 ${props.mode === "url" ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                Image URL
              </button>
            </div>

            {props.mode === "file" ? (
              <div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => props.setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-6 text-[13px] text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                >
                  <Upload className="h-4 w-4" />
                  {props.file ? props.file.name : "Drop or pick an image (JPEG, PNG, WebP · max 4.5MB)"}
                </button>
              </div>
            ) : (
              <input
                value={props.url}
                onChange={(e) => props.setUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full rounded-lg border border-border/60 bg-background/60 px-4 py-2.5 text-[14px] outline-none focus:border-foreground/60"
              />
            )}
          </div>

          {props.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">
              {props.error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="max-w-md text-[11.5px] text-muted-foreground">
              Tip: use a clear, front-facing portrait against a clean background for the best result.
            </p>
            <button
              onClick={props.onSubmit}
              disabled={props.uploading}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-background disabled:opacity-50"
            >
              {props.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {props.uploading ? "Creating..." : "Create avatar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarCard({
  avatar, selected, onSelect,
}: {
  avatar: Avatar; selected: boolean; onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => {
        const v = videoRef.current;
        if (v) void v.play().catch(() => {});
      }}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          v.currentTime = 0;
        }
      }}
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-colors ${
        selected ? "border-foreground" : "border-border/60 hover:border-foreground/40"
      }`}
    >
      <div className="relative aspect-[3/4] w-full bg-foreground/[0.04]">
        {avatar.imageUrl ? (
          <img
            src={avatar.imageUrl}
            alt={avatar.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            No preview
          </div>
        )}
        {avatar.videoUrl && (
          <video
            ref={videoRef}
            src={avatar.videoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
        )}
        {selected && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]">
        <div className="min-w-0 text-left">
          <div className="truncate font-medium">{avatar.name}</div>
          {avatar.variant && (
            <div className="truncate text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
              {avatar.variant}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function VoiceCard({
  voice, selected, onSelect,
}: {
  voice: Voice; selected: boolean; onSelect: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (!voice.sampleUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(voice.sampleUrl);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      void audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  return (
    <button
      onClick={onSelect}
      className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${
        selected ? "border-foreground bg-foreground/5" : "border-border/60 hover:border-foreground/40"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium">{voice.name}</span>
          {voice.gender && (
            <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
              {voice.gender.toLowerCase()}
            </span>
          )}
          {voice.country && (
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              {voice.country}
            </span>
          )}
        </div>
        {voice.description && (
          <div className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{voice.description}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {voice.sampleUrl && (
          <span
            role="button"
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 hover:border-foreground/60"
          >
            <Play className={`h-3.5 w-3.5 ${playing ? "opacity-50" : ""}`} />
          </span>
        )}
        {selected && <Check className="mt-1 h-4 w-4" />}
      </div>
    </button>
  );
}

function CatalogEmpty({ kind }: { kind: string }) {
  return (
    <div className="mt-6 rounded-lg border border-border/40 bg-background/40 p-6 text-center text-[13px] text-muted-foreground">
      No {kind} returned from Anam. Confirm <code>ANAM_API_KEY</code> is set in Vercel and the account has access.
    </div>
  );
}
