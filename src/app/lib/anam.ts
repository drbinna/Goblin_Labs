import { createClient, AnamEvent } from "@anam-ai/js-sdk";

export type PersonaConfig = {
  name: string;
  avatarId: string;
  voiceId: string;
  systemPrompt: string;
  llmId?: string;
};

export async function fetchSessionToken(input: {
  personaId?: string;
  personaConfig?: PersonaConfig;
}): Promise<string> {
  const res = await fetch("/api/session-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`session-token failed: ${res.status}`);
  const data = await res.json();
  return data.sessionToken ?? data.token;
}

export async function createPersona(config: PersonaConfig): Promise<{ id: string }> {
  const res = await fetch("/api/personas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`create persona failed: ${res.status}`);
  return res.json();
}

export async function listVoices(): Promise<Array<{ id: string; name: string; description?: string }>> {
  const res = await fetch("/api/voices");
  if (!res.ok) throw new Error(`voices failed: ${res.status}`);
  const data = await res.json();
  return data.data ?? data ?? [];
}

export async function listAvatars(): Promise<Array<{ id: string; name: string; thumbnail?: string }>> {
  const res = await fetch("/api/avatars");
  if (!res.ok) throw new Error(`avatars failed: ${res.status}`);
  const data = await res.json();
  return data.data ?? data ?? [];
}

export async function startPreview(
  videoEl: HTMLVideoElement,
  config: PersonaConfig,
): Promise<{ stop: () => Promise<void>; talk: (s: string) => Promise<void> }> {
  const token = await fetchSessionToken({ personaConfig: config });
  const client = createClient(token);

  if (!videoEl.id) videoEl.id = `anam-preview-${Math.random().toString(36).slice(2)}`;

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
