import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CalendarCheck,
  Check,
  Clock3,
  Database,
  Eye,
  Linkedin,
  Menu,
  Mic,
  Minus,
  MonitorSmartphone,
  MousePointerClick,
  Plus,
  Ticket,
  Twitter,
  Users,
  X,
  Zap,
} from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import goblinLogo from "@/imports/ChatGPT_Image_May_15__2026__02_03_01_AM.png";
import founderPortrait from "@/imports/founder-portrait.jpg";

const NAV = [
  { label: "Home", href: "#top" },
  { label: "Docs", href: "/docs" },
  { label: "Studio", href: "/studio" },
];

// Eagerly start the dynamic Studio chunk so it's in cache the moment the
// user hovers/focuses the Studio link. By the time they actually click,
// the JS has already streamed in.
let studioPrefetched = false;
function prefetchStudio() {
  if (studioPrefetched) return;
  studioPrefetched = true;
  // Warm the heavy route chunk AND the Anam catalog (the avatars call alone is
  // ~3s) so both are cached by the time the Studio actually mounts.
  import("@/app/routes/Studio.tsx").catch(() => {
    studioPrefetched = false;
  });
  fetch("/api/avatars").catch(() => {});
  fetch("/api/voices").catch(() => {});
}

// Talk-page links for each deployed persona — single source of truth shared by
// the hero triptych and the use-case cards below, so the two can never drift.
const TALK_LINKS: Record<string, string> = {
  gabriel: "/p/e6db066d-80f1-49c6-96e9-a9c10af18397",
  mia: "/p/77b7e33a-c096-4bb4-b70f-bdc988cf8925",
  anne: "/p/6b4df3c2-c9ce-49e7-a95b-8816e8216586",
};

const AVATAR_REEL = [
  {
    code: "gabriel",
    name: "Gabriel",
    role: "Lead gen",
    video: "/avatars/gabriel.mp4",
    poster: "https://lab.anam.ai/persona_thumbnails/gabriel_table.png",
  },
  {
    code: "mia",
    name: "Mia",
    role: "Lab concierge",
    video: "/avatars/mia.mp4",
    poster: "https://lab.anam.ai/persona_thumbnails/mia_studio.png",
  },
  {
    code: "anne",
    name: "Anne",
    role: "Support",
    video: "/avatars/anne.mp4",
    poster: "https://lab.anam.ai/persona_thumbnails/anne_home.png",
  },
];

// Capability pills for the two marquee rows under the hero.
const TICKER_A = [
  { icon: Eye, label: "Screen vision" },
  { icon: Mic, label: "Real-time voice" },
  { icon: Zap, label: "Low-latency rendering" },
  { icon: MousePointerClick, label: "Computer use" },
  { icon: Users, label: "Lead capture" },
  { icon: Brain, label: "Persistent memory" },
];
const TICKER_B = [
  { icon: Database, label: "RAG knowledge" },
  { icon: Ticket, label: "Zendesk tickets" },
  { icon: CalendarCheck, label: "Calendar booking" },
  { icon: MonitorSmartphone, label: "Lives on your site" },
  { icon: Clock3, label: "Always on" },
  { icon: Brain, label: "Multi-modal context" },
];

const STEPS = [
  {
    n: "01",
    title: "Write the brief",
    body:
      "Describe who the persona is — how they speak, what they know, what they're allowed to do. Plain language in, character out.",
    points: ["Personality & voice", "Knowledge base (RAG)", "Guardrails"],
    image: "https://lab.anam.ai/persona_thumbnails/mia_studio.png",
  },
  {
    n: "02",
    title: "Forge it in the Studio",
    body:
      "Pick a face and a voice, wire up the tools they'll use on the job — helpdesk, CRM, calendar — and preview the conversation live.",
    points: ["Face & voice", "Zendesk · Notion · CRM tools", "Live preview"],
    image: "https://lab.anam.ai/persona_thumbnails/gabriel_table.png",
  },
  {
    n: "03",
    title: "Deploy & talk",
    body:
      "Every persona gets a shareable talk page. Visitors just start talking — leads and tickets land in your systems mid-conversation.",
    points: ["Shareable talk page", "Leads via transcripts", "No forms, no waitlist"],
    image: "https://lab.anam.ai/persona_thumbnails/anne_home.png",
  },
];

const USE_CASES = [
  {
    code: "gabriel",
    name: "Gabriel",
    tag: "Sales",
    chip: "Most deployed",
    time: "Live now",
    title: "Lead generation",
    body:
      "Talks to prospects like a person, not a form. He learns what they need, captures the lead into the CRM mid-conversation, and books the meeting before the call ends — name, email, need, time, done.",
    poster: "https://lab.anam.ai/persona_thumbnails/gabriel_table.png",
    wide: true,
  },
  {
    code: "anne",
    name: "Anne",
    tag: "Support",
    chip: null,
    time: "Live now",
    title: "Customer support",
    body:
      "Hears the problem, opens the ticket, checks on existing ones, and leaves the notes your team actually needs. Patient with people, precise with systems.",
    poster: "https://lab.anam.ai/persona_thumbnails/anne_home.png",
    wide: false,
  },
  {
    code: "mia",
    name: "Mia",
    tag: "Concierge",
    chip: null,
    time: "Live now",
    title: "Front door",
    body:
      "The lab's own front door. Ask her what Goblin Labs builds, how the Persona Studio works, or what it takes to deploy a persona of your own.",
    poster: "https://lab.anam.ai/persona_thumbnails/mia_studio.png",
    wide: false,
  },
];

const VERTICALS = [
  {
    name: "Healthcare",
    body: "Personas that triage, follow up, and accompany patients through long-running care plans.",
  },
  {
    name: "Education",
    body: "Tutors that watch the work as it unfolds and respond at the cadence of a real conversation.",
  },
  {
    name: "Engineering",
    body: "Pair-programming personas that read the diff, watch the test runner, and stay in context.",
  },
];

const FAQS = [
  {
    q: "What exactly is a persona?",
    a: "A real-time embodied agent — a face and a voice rendered live, backed by a language model, your knowledge base, and tools. You talk to it the way you'd talk to a person on a video call, and it can act while it talks: open tickets, capture leads, book meetings.",
  },
  {
    q: "How do leads get captured without a form?",
    a: "In conversation. The persona learns the visitor's name, need, and contact details naturally while talking, writes them into your CRM mid-conversation, and every session leaves a full transcript so nothing is lost.",
  },
  {
    q: "What is Zek'thar?",
    a: "Our first shipped model — an alien field observer that lives on macOS. It sees your screen, talks with you in real time, and acts on your behalf. It's the proof of the three hard problems we've solved: low-latency avatar rendering, persistent multi-modal context, and reliable computer use.",
  },
  {
    q: "Does it need my microphone?",
    a: "Yes — a live conversation needs your voice. Your browser asks for microphone access when you start a session, and only for the duration of the call. No signup is required to talk to any deployed persona.",
  },
  {
    q: "Can I build my own persona?",
    a: "That's what the Studio is for. Write a brief, pick a face and voice, attach knowledge and tools, and deploy to a shareable talk page — the same pipeline that built Gabriel, Mia, and Anne.",
  },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] as const },
});

// Defers a video until it nears the viewport: no src is attached (so no network
// fetch or decode) until the card scrolls close, and playback pauses when it
// leaves the screen. Keeps three autoplaying clips off the critical path.
function InViewVideo({ src, className, poster }: { src: string; className?: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={active ? src : undefined}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      controls={false}
      disablePictureInPicture
      onEnded={(e) => {
        const el = e.currentTarget;
        el.currentTime = 0;
        void el.play();
      }}
      className={className}
    />
  );
}

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <a href="#top" className="flex items-center gap-2.5">
      <ImageWithFallback src={goblinLogo} alt="Goblin Labs gecko mark" className={`${dim} object-contain`} />
      <span className="text-[15px] font-semibold tracking-tight">Goblin Labs</span>
    </a>
  );
}

// Pill section label with hairline dashes either side — the connective tissue
// between sections in this layout.
function SectionBadge({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className="h-px w-12 border-t border-dashed border-white/15 sm:w-20" />
      <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] tracking-[0.08em] text-white/55">
        {children}
      </span>
      <span className="h-px w-12 border-t border-dashed border-white/15 sm:w-20" />
    </div>
  );
}

function TickerPill({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return (
    <span className="mx-1.5 inline-flex shrink-0 items-center gap-2 rounded-full border border-dashed border-white/12 bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-white/60">
      <Icon className="h-3.5 w-3.5 text-[#22A03A]" />
      {label}
    </span>
  );
}

function TickerRow({ items, reverse = false }: { items: typeof TICKER_A; reverse?: boolean }) {
  // Content is duplicated so the -50% translate loops seamlessly.
  return (
    <div className="ticker-mask relative overflow-hidden py-1">
      <div className={`flex w-max ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}>
        {[0, 1].map((half) => (
          <div key={half} aria-hidden={half === 1} className="flex">
            {items.map((t) => (
              <TickerPill key={`${half}-${t.label}`} icon={t.icon} label={t.label} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqItem({ i, q, a, open, onToggle }: { i: number; q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="font-mono text-[11px] text-white/30">{String(i + 1).padStart(3, "0")}</span>
        <span className="flex-1 text-[15px] font-medium">{q}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/60">
          {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div className="mx-4 mb-4 rounded-lg border border-white/[0.06] bg-white/[0.03] px-5 py-4 text-[14px] leading-relaxed text-white/65">
          {a}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div id="top" className="min-h-screen w-full bg-background text-foreground">
      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-dashed border-white/10 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-3 sm:px-6 md:px-10">
          <Logo />
          <nav className="hidden items-center gap-6 text-[13px] text-muted-foreground md:flex">
            {NAV.map((n) => {
              const isStudio = n.href === "/studio";
              return (
                <a
                  key={n.label}
                  href={n.href}
                  className="transition-colors hover:text-foreground"
                  onMouseEnter={isStudio ? prefetchStudio : undefined}
                  onFocus={isStudio ? prefetchStudio : undefined}
                  onTouchStart={isStudio ? prefetchStudio : undefined}
                >
                  {n.label}
                </a>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 sm:flex">
              <a
                href="https://x.com/UseGoblin"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="https://www.linkedin.com/company/goblinlabs1/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
            <a
              href="https://zekthar-landing.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full bg-[#22A03A] px-4 py-2 text-[12px] font-semibold text-black transition-opacity hover:opacity-90 sm:inline-flex"
            >
              Try Zek'thar
            </a>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-white/15 text-foreground/80 md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="border-t border-dashed border-white/10 bg-background/95 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
            <nav className="flex flex-col">
              {NAV.map((n) => (
                <a
                  key={n.label}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  onTouchStart={n.href === "/studio" ? prefetchStudio : undefined}
                  className="rounded-lg px-3 py-3 text-[15px] text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  {n.label}
                </a>
              ))}
              <a
                href="https://zekthar-landing.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 rounded-lg bg-[#22A03A] px-3 py-3 text-center text-[14px] font-semibold text-black"
              >
                Try Zek'thar
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-32 sm:px-6 sm:pt-40 md:pt-44">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-b from-transparent via-background/60 to-background" />

        <div className="relative z-10 mx-auto max-w-[1100px] text-center">
          <motion.div {...fadeUp(0)}>
            <SectionBadge>The next decade of agents</SectionBadge>
          </motion.div>

          <motion.h1 {...fadeUp(0.1)} className="mt-8 text-balance leading-[1.04]">
            <span className="block text-[clamp(2.25rem,6vw,4.75rem)] font-medium tracking-[-0.03em]">
              Agents that look like
            </span>
            <span className="font-serif-italic block text-[clamp(2.75rem,7.5vw,6rem)] leading-[1.1]">
              people.
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.25)}
            className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]"
          >
            Embodied, real-time agents that watch you and act alongside you.
            Building this takes three hard problems — low-latency avatar
            rendering, persistent multi-modal context, and reliable computer
            use. At Goblin Labs, we have cracked all three.
          </motion.p>

          <motion.div {...fadeUp(0.4)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <motion.a
              href={TALK_LINKS.mia}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-full bg-[#22A03A] px-7 py-3 text-[13px] font-semibold text-black"
            >
              Talk to a persona
              <ArrowRight className="h-4 w-4" />
            </motion.a>
            <motion.a
              href="/studio"
              onMouseEnter={prefetchStudio}
              onFocus={prefetchStudio}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-white/25 px-7 py-3 text-[13px] font-medium text-white/85 transition-colors hover:border-white/50"
            >
              Open the Studio
            </motion.a>
          </motion.div>

          {/* Launch badges */}
          <motion.div {...fadeUp(0.5)} className="mt-10 flex flex-wrap items-center justify-center gap-3 opacity-90">
            <a
              href="https://www.producthunt.com/products/goblin-labs-ai-personas?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-goblin-labs-ai-personas"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <img
                alt="Goblin Labs — AI personas - Frontier lab for building and deploying AI personas | Product Hunt"
                width={210}
                height={45}
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1166179&theme=dark&t=1780903902092"
              />
            </a>
            <a
              href="https://news.ycombinator.com/from?site=usegoblin.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
              aria-label="Join the discussion on Hacker News"
            >
              <svg width={210} height={45} viewBox="0 0 250 54" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Join the discussion on Hacker News">
                <rect x="0.5" y="0.5" width="249" height="53" rx="10" fill="#0B0B0B" stroke="#2A2A2A" />
                <rect x="11" y="9" width="36" height="36" rx="7" fill="#FF6600" />
                <text x="29" y="38" textAnchor="middle" fontFamily="Verdana, Geneva, sans-serif" fontSize="30" fontWeight="700" fill="#FFFFFF">Y</text>
                <text x="59" y="22" fontFamily="Helvetica, Arial, sans-serif" fontSize="8.5" fontWeight="600" letterSpacing="1.1" fill="#8A8A8A">JOIN THE DISCUSSION ON</text>
                <text x="58.5" y="41" fontFamily="Helvetica, Arial, sans-serif" fontSize="19" fontWeight="700" fill="#F5F4F0">Hacker News</text>
              </svg>
            </a>
          </motion.div>
        </div>

        {/* Capability ticker */}
        <motion.div {...fadeUp(0.55)} className="relative z-10 mx-auto mt-14 max-w-[1280px] space-y-2.5">
          <TickerRow items={TICKER_A} />
          <TickerRow items={TICKER_B} reverse />
        </motion.div>

        {/* Hero media panel — the three avatars rendered live, in one frame */}
        <motion.div {...fadeUp(0.6)} className="relative z-10 mx-auto mt-12 max-w-[1160px]">
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-2 sm:p-3">
            <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-2xl sm:grid-cols-3 sm:gap-2">
              {AVATAR_REEL.map((v, i) => (
                <a
                  key={v.code}
                  href={TALK_LINKS[v.code]}
                  aria-label={`Talk to ${v.name}, ${v.role}`}
                  className={`group relative block overflow-hidden rounded-xl bg-white/[0.03] ${i > 0 ? "hidden sm:block" : ""}`}
                >
                  <div className="aspect-[4/5] w-full">
                    <InViewVideo
                      key={v.video}
                      src={v.video}
                      poster={v.poster}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
                    <div>
                      <div className="text-[14px] font-medium">{v.name}</div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">{v.role}</div>
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/70 backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#22A03A]" />
                      Talk now
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/35">
            Gabriel, Mia, and Anne — rendered live in the lab. Click one and have a conversation, no signup.
          </p>
        </motion.div>
      </section>

      {/* Zek'thar — what we've built */}
      <section id="built" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1160px]">
          <motion.div {...fadeUp(0)}>
            <SectionBadge>What we've built</SectionBadge>
          </motion.div>
          <motion.h2
            {...fadeUp(0.1)}
            className="mt-6 text-balance text-center text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-[-0.025em]"
          >
            Meet <span className="font-serif-italic">Zek'thar.</span>
          </motion.h2>
          <motion.p {...fadeUp(0.2)} className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-white/55">
            Our first shipped model — an alien field observer that sees, talks,
            and acts on macOS in real time.
          </motion.p>

          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-12">
            {/* Field log 1 */}
            <motion.div {...fadeUp(0.15)} className="md:col-span-3">
              <div className="h-full rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-2">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src="https://www.youtube.com/embed/g_MuD10zfJ8?autoplay=1&mute=1&loop=1&playlist=g_MuD10zfJ8&controls=1&modestbranding=1&rel=0&playsinline=1"
                    title="Zek'thar, alien field observer on macOS"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
                <div className="px-3 py-3">
                  <div className="text-[13px] font-medium">Field log 001</div>
                  <div className="text-[11px] text-white/40">Zek'thar observes macOS</div>
                </div>
              </div>
            </motion.div>

            {/* Center copy + CTA panel */}
            <motion.div {...fadeUp(0.25)} className="md:col-span-6">
              <div className="flex h-full flex-col gap-4">
                <a
                  href="https://zekthar-landing.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-8 py-14 transition-colors hover:bg-white/[0.04]"
                >
                  <span className="inline-flex items-center gap-2 text-[clamp(1.25rem,2.5vw,1.75rem)] font-medium tracking-tight">
                    Try Zek'thar
                    <ArrowUpRight className="h-5 w-5 opacity-50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                </a>
                <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-6">
                  <div className="text-[14px] font-medium">Sees. Talks. Acts.</div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                    Zek'thar watches your screen, holds a real-time conversation
                    about what's on it, and drives the machine on your behalf —
                    the three problems, solved in one character.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {["Screen vision", "Real-time voice", "Computer use"].map((s) => (
                    <div
                      key={s}
                      className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-3 py-3 text-center text-[11px] uppercase tracking-[0.1em] text-white/50"
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Field log 2 */}
            <motion.div {...fadeUp(0.35)} className="md:col-span-3">
              <div className="h-full rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-2">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src="https://www.youtube.com/embed/YRdXL9UkWbM?autoplay=1&mute=1&loop=1&playlist=YRdXL9UkWbM&controls=1&modestbranding=1&rel=0&playsinline=1"
                    title="Zek'thar, second field log"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
                <div className="px-3 py-3">
                  <div className="text-[13px] font-medium">Field log 002</div>
                  <div className="text-[11px] text-white/40">Second observation run</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1160px]">
          <motion.div {...fadeUp(0)}>
            <SectionBadge>How it works</SectionBadge>
          </motion.div>
          <motion.h2
            {...fadeUp(0.1)}
            className="mt-6 text-balance text-center text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-[-0.025em]"
          >
            Deploy a persona <span className="font-serif-italic">in minutes.</span>
          </motion.h2>
          <motion.p {...fadeUp(0.2)} className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-white/55">
            Three steps from a written brief to a face your visitors can talk to.
          </motion.p>

          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                {...fadeUp(0.1 + i * 0.1)}
                className="flex flex-col rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-2"
              >
                <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-white/[0.03]">
                  <img
                    src={s.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top opacity-90"
                  />
                </div>
                <div className="flex flex-1 flex-col px-4 pb-5 pt-4">
                  <div className="font-mono text-[11px] text-[#22A03A]">#{s.n}</div>
                  <div className="mt-1.5 text-[17px] font-medium tracking-tight">{s.title}</div>
                  <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-white/55">{s.body}</p>
                  <ul className="mt-4 space-y-1.5 border-t border-dashed border-white/10 pt-4">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-[12.5px] text-white/60">
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#22A03A]" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div {...fadeUp(0.3)} className="mt-8 flex justify-center">
            <a
              href="/studio"
              onMouseEnter={prefetchStudio}
              onFocus={prefetchStudio}
              className="group inline-flex items-center gap-2 rounded-full border border-dashed border-[#22A03A]/50 px-6 py-2.5 text-[13px] font-medium text-[#22A03A] transition-colors hover:border-[#22A03A]"
            >
              Ready to build?
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Use cases — personas already on the job */}
      <section id="personas" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1160px]">
          <motion.div {...fadeUp(0)}>
            <SectionBadge>Use cases</SectionBadge>
          </motion.div>
          <motion.h2
            {...fadeUp(0.1)}
            className="mt-6 text-balance text-center text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-[-0.025em]"
          >
            Personas already <span className="font-serif-italic">on the job.</span>
          </motion.h2>
          <motion.p {...fadeUp(0.2)} className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-white/55">
            Built and deployed with the exact pipeline you get in the Studio.
            No demo video, no waitlist — click one and talk right now.
          </motion.p>

          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {USE_CASES.map((u, i) => (
              <motion.a
                key={u.code}
                href={TALK_LINKS[u.code]}
                {...fadeUp(0.1 + i * 0.08)}
                className={`group flex flex-col overflow-hidden rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-2 transition-colors hover:bg-white/[0.04] sm:flex-row ${
                  u.wide ? "lg:col-span-2" : ""
                }`}
              >
                <div className={`relative shrink-0 overflow-hidden rounded-xl bg-white/[0.03] ${u.wide ? "sm:w-[42%]" : "sm:w-[45%]"}`}>
                  <div className="aspect-[4/3] h-full w-full sm:aspect-auto sm:min-h-[240px]">
                    <img
                      src={u.poster}
                      alt={`${u.name} — ${u.title} persona`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                  <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/75 backdrop-blur">
                    {u.tag}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-4 pb-4 pt-4 sm:px-6 sm:py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[17px] font-medium tracking-tight">
                      {u.title} <span className="text-white/40">· {u.name}</span>
                    </div>
                    {u.chip && (
                      <span className="whitespace-nowrap rounded-full bg-[#22A03A]/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#22A03A]">
                        {u.chip}
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 flex-1 text-[13.5px] leading-relaxed text-white/55">{u.body}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-dashed border-white/10 pt-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/45">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#22A03A]" />
                      {u.time}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/80">
                      Talk to {u.name}
                      <ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </span>
                  </div>
                </div>
              </motion.a>
            ))}
          </div>

          {/* Verticals */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {VERTICALS.map((v, i) => (
              <motion.div
                key={v.name}
                {...fadeUp(0.15 + i * 0.08)}
                className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-5"
              >
                <div className="text-[11px] uppercase tracking-[0.16em] text-[#22A03A]">Coming to</div>
                <div className="mt-1.5 text-[16px] font-medium tracking-tight">{v.name}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/50">{v.body}</p>
              </motion.div>
            ))}
          </div>

          <p className="mt-10 text-center text-[11px] leading-relaxed text-white/35">
            Live sessions run on real-time avatar synthesis — your browser will
            ask for microphone access when you start a conversation.
          </p>
        </div>
      </section>

      {/* Founder — field notes */}
      <section id="team" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1000px]">
          <motion.div {...fadeUp(0)}>
            <SectionBadge>Field notes</SectionBadge>
          </motion.div>
          <motion.h2
            {...fadeUp(0.1)}
            className="mt-6 text-balance text-center text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-[-0.025em]"
          >
            Meet the <span className="font-serif-italic">founder.</span>
          </motion.h2>

          <div className="mt-12 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-6 sm:p-10">
            <div className="grid grid-cols-12 gap-8">
              <aside className="col-span-12 flex flex-col items-center text-center md:col-span-3 md:items-start md:text-left">
                <div className="w-36 overflow-hidden rounded-xl border border-dashed border-white/15 p-1 sm:w-44 md:w-full">
                  <div className="aspect-square w-full overflow-hidden rounded-lg">
                    <ImageWithFallback src={founderPortrait} alt="Founder portrait" className="h-full w-full object-cover" />
                  </div>
                </div>
                <div className="mt-5">
                  <div className="font-serif-italic text-[1.9rem] leading-none">Obi</div>
                  <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/40">Founder, Goblin Labs</div>
                </div>
              </aside>

              <article
                className="col-span-12 space-y-5 text-[16px] leading-[1.7] text-foreground/90 sm:text-[17px] md:col-span-9"
                style={{ fontFamily: "Instrument Serif, serif" }}
              >
                {[
                  "I came to the United States on a scholarship to study computer science. The expected path, for someone from where I come from, was to get the degree, get the job, and stay quiet. The work that interested me was somewhere else.",
                  "I learned to write before I learned to ship. Years of essays, arguments and poetry taught me how to take something dense and make it land, a skill I'd later realise is the most undervalued one in software. AI products live or die on how well their makers can articulate what they are; this knowledge requires a deep understanding of the model ecosystem and how models work together.",
                  "The first thing I tried to build was a personal AI tutor to help me study. The second was a voice agent with low enough latency to feel like it was real-time. Both failed. But the lesson was that I'd been building before I'd done the research.",
                  "After that, every project started with a longer read. Voice agents, hackathon projects, Skiyu, the skill marketplace I just shipped, each got sharper because failures became more specific.",
                ].map((p, i) => (
                  <motion.p key={i} {...fadeUp(i * 0.05)}>{p}</motion.p>
                ))}

                <motion.p {...fadeUp(0.2)}>
                  Then I built Zek'thar. And the thing that hit me halfway through
                  was bigger than the project:{" "}
                  <span className="bg-[#22A03A] px-1.5 py-0.5 font-sans text-[0.85em] not-italic text-black">
                    we already have the tools to build AGI. What we don't have are
                    the tools to put them together.
                  </span>{" "}
                  That gap is the thesis.
                </motion.p>

                <motion.p {...fadeUp(0.25)}>
                  Goblin Labs is the lab built around that thesis. We're starting
                  with real-time AI personas, characters that see your screen,
                  talk with you, and act alongside you. Zek'thar is the first.
                </motion.p>

                <motion.p {...fadeUp(0.3)} className="text-white/50">
                  Inside me, there's a kid from the same place I was who hasn't
                  yet been told that the path can be drawn differently. If we
                  build well, they'll see it.
                </motion.p>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[760px]">
          <motion.div {...fadeUp(0)}>
            <SectionBadge>FAQ</SectionBadge>
          </motion.div>
          <motion.h2
            {...fadeUp(0.1)}
            className="mt-6 text-balance text-center text-[clamp(1.9rem,4vw,3rem)] font-medium tracking-[-0.025em]"
          >
            Frequently asked <span className="font-serif-italic">questions.</span>
          </motion.h2>
          <motion.p {...fadeUp(0.2)} className="mx-auto mt-4 max-w-md text-center text-[14px] text-white/55">
            Can't find what you're looking for?{" "}
            <a href={TALK_LINKS.mia} className="text-white underline underline-offset-4 hover:text-[#22A03A]">
              Ask Mia out loud
            </a>
            .
          </motion.p>

          <motion.div {...fadeUp(0.25)} className="mt-10 space-y-3">
            {FAQS.map((f, i) => (
              <FaqItem
                key={f.q}
                i={i}
                q={f.q}
                a={f.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden px-4 py-24 sm:px-6 md:py-36">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/30 to-background" />
        <div className="relative z-10 mx-auto max-w-[860px] text-center">
          <motion.div {...fadeUp(0)} className="mx-auto mb-7 w-fit">
            <ImageWithFallback src={goblinLogo} alt="" className="h-14 w-14 object-contain" />
          </motion.div>
          <motion.h2 {...fadeUp(0.1)} className="text-balance leading-[1.05]">
            <span className="block text-[clamp(1.9rem,4.5vw,3.5rem)] font-medium tracking-[-0.025em]">
              Start the
            </span>
            <span className="font-serif-italic block text-[clamp(2.4rem,6vw,4.75rem)] leading-[1.15]">
              conversation.
            </span>
          </motion.h2>
          <motion.p {...fadeUp(0.2)} className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/55">
            Our models live on your Mac. They see your screen, talk with you,
            and act on your behalf.
          </motion.p>
          <motion.div {...fadeUp(0.3)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://zekthar-landing.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-[#22A03A] px-8 py-3.5 text-[13px] font-semibold text-black"
            >
              Try for free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href={TALK_LINKS.mia}
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-white/25 px-8 py-3.5 text-[13px] font-medium text-white/85 transition-colors hover:border-white/50"
            >
              Talk to Mia first
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dashed border-white/10 px-4 py-10 sm:px-6 md:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-4 text-[13px] text-white/45 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden text-white/20 md:inline">•</span>
            <span className="hidden md:inline">© 2026 · Real-time AI personas</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://x.com/UseGoblin" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">X</a>
            <a href="https://www.linkedin.com/company/goblinlabs1/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">LinkedIn</a>
            <a href="#" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="#" className="transition-colors hover:text-foreground">Terms</a>
            <a href="#" className="transition-colors hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
