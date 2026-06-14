import { createClient, AnamEvent } from "@anam-ai/js-sdk";

export type PersonaConfig = {
  name: string;
  avatarId: string;
  voiceId: string;
  systemPrompt: string;
  llmId: string;
  avatarModel?: string;
};

export const DEFAULT_LLM_ID = "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7";
export const DEFAULT_AVATAR_ID = "30fa96d0-26c4-4e55-94a0-517025942e18";
export const DEFAULT_VOICE_ID = "6bfbe25a-979d-40f3-a92b-5394170af54b";
// Pin the stable flagship model. Unpinned sessions fall back to a default that
// can be a slower-to-initialize / early-access model. cara-3 is GA + low-latency.
export const DEFAULT_AVATAR_MODEL = "cara-3";

// Personas that should drive the on-screen lead-capture form. For these, the
// session mint gets an inline `prefill_contact` client tool plus form-fill
// instructions appended to the prompt, so the avatar fills the form by voice.
// Anam honors inline tool definitions on persona-referenced AND ephemeral mints
// (verified against the live API), so this needs no pre-created tool, no Anam
// key here, and no mutation of the stored persona. Gabriel is not a stored Anam
// persona anyway — his session is minted from a rebuilt config — so attaching
// tools to a persona record was never an option for him.
export const LEAD_GEN_PERSONA_IDS = new Set<string>([
  "e6db066d-80f1-49c6-96e9-a9c10af18397", // Gabriel — Lead Gen (homepage CTA)
]);

// Inline client-tool definition Anam attaches at session-mint time. The browser
// handler that receives the call is registered in streamToken() via onPrefill.
const PREFILL_TOOL = {
  type: "client",
  name: "prefill_contact",
  description:
    "Fill the on-screen contact form (top-right of the visitor's screen) with details the visitor has shared, so they can confirm by tapping Send instead of you reading their email back aloud. Call as soon as you have any of name, email, or company — one field at a time — and again whenever a value changes.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "The visitor's name, if given" },
      email: { type: "string", description: "The visitor's email address, as you understood it" },
      company: { type: "string", description: "Their company or organization, if mentioned" },
    },
    required: [],
  },
  awaitResult: true,
} as const;

// Appended to a lead-gen persona's prompt so the avatar fills the form live,
// one field at a time, and draws the visitor's eye to it — the demo moment.
const FILL_ADDENDUM = `

There is a short contact form at the TOP-RIGHT of the visitor's screen — name, email, company, and a Send button. As you learn each detail, call prefill_contact IMMEDIATELY with just that one field, ONE AT A TIME (name first, then email, then company), so the visitor watches the form fill itself in live as you speak. The first time you fill something, draw their eye to it: "watch the top-right — I'll fill this in for you as we talk." NEVER spell an email back out loud — say "I've popped that into the form at the top right, give it a check and tap Send." Spoken emails get mis-heard; the form does not.`;

export async function fetchSessionToken(input: {
  personaId?: string;
  personaConfig?: PersonaConfig;
  // Forwarded to Anam's token mint as the session's clientLabel — lets us map
  // an Anam session (and its transcript) back to the visitor/lead that owns it.
  clientLabel?: string;
}): Promise<string> {
  const res = await fetch("/api/session-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`session-token ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  return data.sessionToken ?? data.token;
}

export async function createPersona(config: PersonaConfig): Promise<{ id: string }> {
  const t0 = performance.now();
  const res = await fetch("/api/personas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`create persona failed: ${res.status}`);
  const data = await res.json();
  console.info("[anam] createPersona (ms):", Math.round(performance.now() - t0));
  return data;
}

export type BatchCreateResult = { ok: boolean; id?: string; name?: string; error?: string };

// Create up to 20 personas in one request. Results come back in submission
// order; check each item's `ok` — a 207 means some succeeded and some failed.
export async function createPersonas(configs: PersonaConfig[]): Promise<BatchCreateResult[]> {
  const res = await fetch("/api/personas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ batch: configs }),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 207) {
    throw new Error(`batch create ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  return data.results ?? [];
}

// Record ownership for a set of freshly created personas in one call.
export async function savePersonasMine(
  personas: { anamPersonaId: string; name: string; vertical?: string }[],
): Promise<void> {
  const res = await fetch("/api/personas-mine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ personas }),
  });
  if (!res.ok) throw new Error(`save ownership failed: ${res.status}`);
}

export type Voice = {
  id: string;
  name: string;
  description?: string;
  sampleUrl?: string;
  gender?: string;
  country?: string;
  tags?: string[];
};

export type Avatar = {
  id: string;
  name: string;
  variant?: string;
  imageUrl?: string;
  videoUrl?: string;
};

export async function listVoices(): Promise<Voice[]> {
  const res = await fetch("/api/voices");
  if (!res.ok) throw new Error(`voices failed: ${res.status}`);
  const data = await res.json();
  const items = data.data ?? data ?? [];
  return items.map((v: any) => ({
    id: v.id,
    name: v.displayName ?? v.name ?? v.id,
    description: v.description,
    sampleUrl: v.sampleUrl ?? v.previewSampleUrl,
    gender: v.gender,
    country: v.country,
    tags: v.displayTags,
  }));
}

export async function createAvatarFromFile(
  displayName: string,
  file: File,
): Promise<Avatar> {
  const form = new FormData();
  form.append("displayName", displayName);
  form.append("imageFile", file);
  const res = await fetch("/api/avatars", { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`create avatar ${res.status}: ${text.slice(0, 300)}`);
  const a = JSON.parse(text);
  return {
    id: a.id,
    name: a.displayName ?? a.name ?? a.id,
    variant: a.variantName,
    imageUrl: a.imageUrl,
    videoUrl: a.videoUrl,
  };
}

export async function createAvatarFromUrl(
  displayName: string,
  imageUrl: string,
): Promise<Avatar> {
  const res = await fetch("/api/avatars", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, imageUrl }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`create avatar ${res.status}: ${text.slice(0, 300)}`);
  const a = JSON.parse(text);
  return {
    id: a.id,
    name: a.displayName ?? a.name ?? a.id,
    variant: a.variantName,
    imageUrl: a.imageUrl,
    videoUrl: a.videoUrl,
  };
}

export async function listAvatars(): Promise<Avatar[]> {
  const res = await fetch("/api/avatars");
  if (!res.ok) throw new Error(`avatars failed: ${res.status}`);
  const data = await res.json();
  const items = data.data ?? data ?? [];
  return items.map((a: any) => ({
    id: a.id,
    name: a.displayName ?? a.name ?? a.id,
    variant: a.variantName,
    imageUrl: a.imageUrl,
    videoUrl: a.videoUrl,
  }));
}

export type SessionHandle = {
  stop: () => Promise<void>;
  talk: (s: string) => Promise<void>;
};

// Arguments Gabriel passes to the prefill_contact client tool.
export type PrefillArgs = { name?: string; email?: string; company?: string };
type StreamOpts = { onPrefill?: (args: PrefillArgs) => void };

// Shared streaming logic. Given a session token, attaches the Anam client to a
// <video> element and resolves once the first frame plays.
async function streamToken(
  videoEl: HTMLVideoElement,
  token: string,
  opts: StreamOpts = {},
): Promise<SessionHandle> {
  const client = createClient(token);

  if (!videoEl.id) videoEl.id = `anam-stage-${Math.random().toString(36).slice(2)}`;

  // Client-side tool handler. The persona calls prefill_contact; we surface the
  // arguments to the page so the on-screen form fills and the visitor confirms
  // by tapping — no spoken email read-back, which is what triggered the echo
  // loop. Must be registered before streamToVideoElement() or early calls are
  // missed. Cast: registerToolCallHandler may be absent from older SDK types.
  if (opts.onPrefill) {
    try {
      (client as any).registerToolCallHandler?.("prefill_contact", {
        onStart: async (payload: any) => {
          try {
            opts.onPrefill!((payload?.arguments ?? {}) as PrefillArgs);
          } catch {
            /* never let a UI prefill break the session */
          }
          return "The contact form was pre-filled for the visitor to confirm.";
        },
      });
    } catch (e) {
      console.warn("[anam] could not register prefill_contact handler", e);
    }
  }

  const ready = new Promise<void>((resolve) => {
    client.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => resolve());
  });

  await client.streamToVideoElement(videoEl.id);
  await ready;

  return {
    stop: async () => {
      await client.stopStreaming();
    },
    talk: async (s: string) => {
      await client.talk(s);
    },
  };
}

export type SessionTimings = { tokenMs: number; firstFrameMs: number; totalMs: number };

// Talk pages: stream a deployed persona by reference (stateful — attached
// tools load this way). Falls back to the rebuilt ephemeral config if the
// reference mint fails.
export async function startTalk(
  videoEl: HTMLVideoElement,
  personaId: string,
  fallbackConfig: PersonaConfig,
  clientLabel?: string,
  onPrefill?: (args: PrefillArgs) => void,
): Promise<SessionHandle & { timings: SessionTimings }> {
  const t0 = performance.now();
  // Lead-gen personas get the prefill_contact client tool attached inline at
  // mint time, plus the form-fill instructions appended to their prompt. Inline
  // tools are honored on both the persona-referenced mint and the ephemeral
  // fallback, so the avatar can fill the form with no pre-created tool and no
  // change to the stored persona.
  const leadGen = LEAD_GEN_PERSONA_IDS.has(personaId);
  const extra = leadGen
    ? { systemPrompt: `${fallbackConfig.systemPrompt}${FILL_ADDENDUM}`, tools: [PREFILL_TOOL] }
    : {};
  let token: string;
  try {
    token = await fetchSessionToken({
      personaConfig: { personaId, ...extra } as unknown as PersonaConfig,
      clientLabel,
    });
  } catch (e) {
    // Fallback keeps the link alive. With inline tools it is no longer a
    // tool-less session: the prefill helper rides along on the ephemeral config
    // too. Surface the failure so a "wrong persona behavior" report stays
    // diagnosable.
    console.warn(
      `[anam] stateful mint failed for persona ${personaId}; falling back to ephemeral config`,
      e,
    );
    token = await fetchSessionToken({
      personaConfig: { ...fallbackConfig, ...extra } as unknown as PersonaConfig,
      clientLabel,
    });
  }
  const t1 = performance.now();
  const handle = await streamToken(videoEl, token, { onPrefill });
  const t2 = performance.now();
  const timings: SessionTimings = {
    tokenMs: Math.round(t1 - t0),
    firstFrameMs: Math.round(t2 - t1),
    totalMs: Math.round(t2 - t0),
  };
  console.info("[anam] talk timings (ms):", timings);
  return { ...handle, timings };
}

// Studio: stream an ad-hoc persona built from the current builder config.
// Returns timing breakdown so we can see exactly where the wait is spent.
export async function startPreview(
  videoEl: HTMLVideoElement,
  config: PersonaConfig,
): Promise<SessionHandle & { timings: SessionTimings }> {
  const t0 = performance.now();
  const token = await fetchSessionToken({ personaConfig: config });
  const t1 = performance.now();
  const handle = await streamToken(videoEl, token);
  const t2 = performance.now();
  const timings: SessionTimings = {
    tokenMs: Math.round(t1 - t0),
    firstFrameMs: Math.round(t2 - t1),
    totalMs: Math.round(t2 - t0),
  };
  console.info("[anam] preview timings (ms):", timings);
  return { ...handle, timings };
}

// Public talk page: a deployed persona, resolved to a full config we can mint a
// session token with. Anam removed the legacy "session token by personaId" path,
// so we fetch the stored persona and rebuild its personaConfig.
export type DeployedPersona = { id: string; name: string; config: PersonaConfig };

export async function getPersona(id: string): Promise<DeployedPersona | null> {
  // no-store: a persona link must always reflect the persona as it exists now,
  // never a cached body that could belong to an older (or wrong) revision.
  const res = await fetch(`/api/personas?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const p = await res.json().catch(() => null);
  if (!p || !p.id) return null;
  // Identity checks — fail loudly rather than render the wrong persona:
  // 1) the upstream record must be the one this link asked for;
  if (p.id !== id) {
    console.error(`[anam] persona id mismatch: link asked for ${id}, upstream returned ${p.id}`);
    return null;
  }
  // 2) face and voice define the persona's identity; if either is missing we
  //    refuse to silently substitute a default (that is how a link ends up
  //    showing the wrong persona). Only the LLM id may fall back.
  const avatarId = p.avatar?.id;
  const voiceId = p.voice?.id;
  if (!avatarId || !voiceId) {
    console.error(`[anam] persona ${id} is missing ${!avatarId ? "avatar" : "voice"}; refusing to render with defaults`);
    return null;
  }
  return {
    id: p.id,
    name: p.name ?? "Persona",
    config: {
      name: p.name ?? "Persona",
      // GET /personas/:id returns avatar/voice as objects and the prompt under `brain`.
      avatarId,
      voiceId,
      llmId: p.llmId ?? DEFAULT_LLM_ID,
      avatarModel: p.avatarModel ?? p.avatar?.model ?? DEFAULT_AVATAR_MODEL,
      systemPrompt: p.brain?.systemPrompt ?? "You are a helpful, embodied AI persona.",
    },
  };
}
