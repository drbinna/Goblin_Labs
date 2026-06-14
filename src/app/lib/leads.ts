// Client-side lead capture. A stable anonymous visitor id lives in
// localStorage; visits are fire-and-forget, contact submits surface errors so
// the card can react.

const VISITOR_KEY = "gl_visitor_id";

export function getVisitorId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    // private mode / storage blocked — still capture, just not stable
    return crypto.randomUUID();
  }
}

type Utm = Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;

function attribution(): { referrer?: string; utm?: Utm; userAgent?: string } {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const utm: Utm = {};
  for (const k of ["source", "medium", "campaign", "term", "content"] as const) {
    const v = q.get(`utm_${k}`);
    if (v) utm[k] = v;
  }
  return {
    referrer: document.referrer || undefined,
    utm: Object.keys(utm).length ? utm : undefined,
    userAgent: navigator.userAgent,
  };
}

// Fire when a visitor lands on a persona page. Never throws — capturing a
// landing must never interfere with the page rendering.
export function captureVisit(personaId: string): void {
  try {
    const body = JSON.stringify({
      event: "visit",
      visitorId: getVisitorId(),
      personaId,
      ...attribution(),
    });
    // keepalive lets this survive a fast navigation away (the bounce case).
    fetch("/api/lead-capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body,
    }).catch(() => {});
  } catch {
    /* no-op */
  }
}

export type ContactFields = { name?: string; email: string; company?: string; need?: string };

// Submit typed contact details. Throws on failure so the UI can show an error.
export async function captureContact(
  personaId: string,
  fields: ContactFields,
): Promise<{ ok: boolean; emailValid: boolean; syncedToNotion: boolean }> {
  const res = await fetch("/api/lead-capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "contact",
      visitorId: getVisitorId(),
      personaId,
      ...fields,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`lead-capture ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}
