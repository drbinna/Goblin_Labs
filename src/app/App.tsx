import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight, Github, Twitter, Linkedin } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import heroShadow from "@/imports/hero-shadow.webp";
import goblinLogo from "@/imports/ChatGPT_Image_May_15__2026__02_03_01_AM.png";
import founderPortrait from "@/imports/founder-portrait.jpg";

const NAV = [
  { label: "Home", href: "#top" },
  { label: "Personas", href: "#personas" },
  { label: "Studio", href: "/studio" },
];

// Eagerly start the dynamic Studio chunk so it's in cache the moment the
// user hovers/focuses the Studio link. By the time they actually click,
// the JS has already streamed in.
let studioPrefetched = false;
function prefetchStudio() {
  if (studioPrefetched) return;
  studioPrefetched = true;
  import("@/app/routes/Studio.tsx").catch(() => {
    // Reset so a real navigation will retry.
    studioPrefetched = false;
  });
}

const VERTICALS = [
  {
    code: "01",
    title: "Healthcare",
    body:
      "Personas that triage, follow up, and accompany patients through long-running care plans, speaking the right language for the clinician and the patient.",
    video: "https://res.cloudinary.com/dbd6v9ove/video/upload/v1778831288/WhatsApp_Video_2026-05-15_at_00.44.54_n0pzen.mp4",
  },
  {
    code: "02",
    title: "Education",
    body:
      "Tutors that watch the work as it unfolds. They read the diagram, hear the question, and respond at the cadence of a real conversation.",
    video: "https://res.cloudinary.com/dbd6v9ove/video/upload/v1778831908/WhatsApp_Video_2026-05-15_at_00.57.18_tg2ipw.mp4",
  },
  {
    code: "03",
    title: "Engineering",
    body:
      "Pair-programming personas that read the diff, watch the test runner, and reason about the system you're actually building, not a generic snippet bot. They sit next to your IDE and stay in context across the whole session.",
    video: "https://res.cloudinary.com/dbd6v9ove/video/upload/v1778834806/WhatsApp_Video_2026-05-15_at_01.45.22_w4akle.mp4",
  },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] as const },
});

function GlassIcon({ children, label }: { children: ReactNode; label: string }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

// Defers a video until it nears the viewport: no src is attached (so no network
// fetch or decode) until the card scrolls close, and playback pauses when it
// leaves the screen. Keeps three autoplaying clips off the critical path.
function InViewVideo({ src, className }: { src: string; className?: string }) {
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
  const dim = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <a href="#top" className="flex items-center gap-2.5">
      <ImageWithFallback
        src={goblinLogo}
        alt="Goblin Labs gecko mark"
        className={`${dim} object-contain`}
      />
      <span className="text-[15px] font-semibold tracking-tight">Goblin Labs</span>
    </a>
  );
}

export default function App() {
  return (
    <div id="top" className="min-h-screen w-full bg-background text-foreground">
      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6 sm:py-4 md:px-12">
          <Logo />
          <nav className="hidden items-center gap-3 text-[13px] text-muted-foreground md:flex">
            {NAV.map((n, i) => {
              const isStudio = n.href === "/studio";
              return (
                <span key={n.label} className="flex items-center gap-3">
                  <a
                    href={n.href}
                    className="transition-colors hover:text-foreground"
                    onMouseEnter={isStudio ? prefetchStudio : undefined}
                    onFocus={isStudio ? prefetchStudio : undefined}
                    onTouchStart={isStudio ? prefetchStudio : undefined}
                  >
                    {n.label}
                  </a>
                  {i < NAV.length - 1 && <span className="text-foreground/30">•</span>}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <GlassIcon label="Twitter"><Twitter className="h-4 w-4" /></GlassIcon>
            <GlassIcon label="LinkedIn"><Linkedin className="h-4 w-4" /></GlassIcon>
            <GlassIcon label="GitHub"><Github className="h-4 w-4" /></GlassIcon>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 hero-shadow"
          style={{ backgroundImage: `url(${heroShadow})` }}
        />
        <div className="pointer-events-none absolute inset-0 bg-background/30" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-background to-transparent" />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-[1100px] flex-col items-center justify-center px-6 pb-12 pt-28 text-center sm:pt-36 md:px-10 md:pt-56">
          <motion.div {...fadeUp(0)} className="mb-8">
            <a
              href="https://www.producthunt.com/products/goblin-labs-ai-personas?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-goblin-labs-ai-personas"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <img
                alt="Goblin Labs — AI personas - Frontier lab for building and deploying AI personas | Product Hunt"
                width={250}
                height={54}
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1166179&theme=light&t=1780903902092"
              />
            </a>
          </motion.div>

          <motion.h1
            {...fadeUp(0.1)}
            className="text-balance text-[clamp(2.25rem,7vw,6rem)] font-medium leading-[1.05] tracking-[-0.03em]"
          >
            The next decade of agents will look more like{" "}
            <span className="font-serif-italic">people</span>.
          </motion.h1>

          <motion.p
            {...fadeUp(0.25)}
            className="mt-6 max-w-2xl text-[15px] leading-relaxed sm:text-[16px] md:text-[17px]"
            style={{ color: "var(--hero-subtitle)" }}
          >
            Embodied, real-time agents that watch you and act alongside you.
            Building this requires solving three things: low-latency
            avatar rendering, persistent multi-modal context, and reliable
            computer use. At Goblin Labs, we have cracked all three.
          </motion.p>

          <motion.div {...fadeUp(0.4)} className="mt-10">
            <motion.a
              href="https://zekthar-landing.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-background"
            >
              Get a feel of our first model
              <ArrowRight className="h-4 w-4" />
            </motion.a>
          </motion.div>

        </div>
      </section>

      {/* Personas / What we're working on now */}
      <section id="personas" className="border-t border-border/40 px-6 py-16 sm:py-20 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1200px]">
          <motion.h2
            {...fadeUp(0)}
            className="mx-auto max-w-3xl text-balance text-center text-[clamp(2rem,4.5vw,4rem)] font-medium tracking-[-0.025em]"
          >
            Persona libraries, built for{" "}
            <span className="font-serif-italic">specific</span> verticals
            <span className="font-serif-italic font-normal">
              {" "}that live on your screen.
            </span>
          </motion.h2>
          <motion.p
            {...fadeUp(0.2)}
            className="mx-auto mt-6 max-w-2xl text-center text-[16px] leading-relaxed text-muted-foreground"
          >
            A generalist persona is a demo. A persona that knows the workflow,
            the vocabulary, and the failure modes of a specific field is a tool.
            We're starting with three.
          </motion.p>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {VERTICALS.map((v, i) => (
              <motion.div
                key={v.code}
                {...fadeUp(0.1 + i * 0.1)}
                className="liquid-glass group flex flex-col rounded-2xl p-7"
              >
                <div className="flex items-center justify-end text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  <ArrowUpRight className="h-4 w-4 opacity-50 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="mt-4 aspect-[4/5] w-full overflow-hidden rounded-xl bg-foreground/[0.03]">
                  {v.video ? (
                    <InViewVideo
                      key={v.video}
                      src={v.video}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Persona recording · soon
                    </div>
                  )}
                </div>
                <div className="mt-6 text-[1.5rem] font-medium tracking-tight">
                  {v.title}
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {v.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What we have built */}
      <section id="built" className="relative border-t border-border/40 px-6 py-16 sm:py-20 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1200px]">
          <motion.h2
            {...fadeUp(0)}
            className="text-balance text-center text-[clamp(2.25rem,5vw,4.5rem)] font-medium tracking-[-0.025em]"
          >
            What we have <span className="font-serif-italic">built</span>.
          </motion.h2>
          <motion.p
            {...fadeUp(0.2)}
            className="mx-auto mt-6 max-w-2xl text-center text-[16px] leading-relaxed text-muted-foreground"
          >
            Recently, we shipped Zek'thar, an alien field observer that can see,
            talk, and act on macOS.
          </motion.p>

          <div className="mx-auto mt-12 flex w-full max-w-[820px] flex-col items-center justify-center gap-6 sm:flex-row sm:items-stretch md:mt-16">
            {[
              { id: "g_MuD10zfJ8", title: "Zek'thar, alien field observer on macOS" },
              { id: "YRdXL9UkWbM", title: "Zek'thar, second field log" },
            ].map((v, i) => (
              <motion.div
                key={v.id}
                {...fadeUp(0.3 + i * 0.1)}
                className="liquid-glass relative w-full max-w-[280px] overflow-hidden rounded-3xl sm:max-w-[380px]"
              >
                <div className="relative aspect-[9/16] w-full bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=1&modestbranding=1&rel=0&playsinline=1`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            {...fadeUp(0.5)}
            className="mx-auto mt-10 flex items-center justify-center"
          >
            <a
              href="#"
              className="group inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.18em] text-foreground"
            >
              Try Zek'thar
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Team, founder essay */}
      <section id="team" className="border-t border-border/40 px-6 py-16 sm:py-20 md:px-12 md:py-40">
        <div className="mx-auto max-w-[1100px]">
          <motion.h2
            {...fadeUp(0)}
            className="mx-auto max-w-3xl text-balance text-center text-[clamp(2rem,4.5vw,3.75rem)] font-medium tracking-[-0.025em]"
          >
            Meet The <span className="font-serif-italic">Founder</span>
          </motion.h2>

          <div className="mx-auto mt-12 grid max-w-[920px] grid-cols-12 gap-8 md:mt-16">
            <aside className="col-span-12 flex flex-col items-center text-center md:col-span-3 md:items-start md:text-left">
              <div className="liquid-glass w-40 overflow-hidden rounded-xl p-1 sm:w-48 md:w-full">
                <div className="aspect-square w-full overflow-hidden rounded-lg">
                  <ImageWithFallback
                    src={founderPortrait}
                    alt="Founder portrait"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="mt-5">
                <div className="font-serif-italic text-[2rem] leading-none">
                  Obi
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Founder, Goblin Labs
                </div>
              </div>
            </aside>

            <article
              className="col-span-12 space-y-5 text-[16px] leading-[1.7] text-foreground/90 sm:text-[17px] md:col-span-9 md:space-y-6 md:text-[18px]"
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
                <span className="bg-foreground px-1.5 py-0.5 font-sans text-[0.85em] not-italic text-background">
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

              <motion.p {...fadeUp(0.3)} className="text-muted-foreground">
                Inside me, there's a kid from the same place I was who hasn't
                yet been told that the path can be drawn differently. If we
                build well, they'll see it.
              </motion.p>
            </article>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-border/40 px-6 py-20 sm:py-28 md:px-12 md:py-44">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/40 to-background" />
        <div className="relative z-10 mx-auto max-w-[900px] text-center">
          <motion.div {...fadeUp(0)} className="mx-auto mb-8 w-fit">
            <ImageWithFallback
              src={goblinLogo}
              alt=""
              className="h-16 w-16 object-contain"
            />
          </motion.div>
          <motion.h2
            {...fadeUp(0.1)}
            className="text-balance text-[clamp(2.25rem,5vw,4.5rem)] font-medium tracking-[-0.025em]"
          >
            Start the <span className="font-serif-italic">conversation</span>.
          </motion.h2>
          <motion.p
            {...fadeUp(0.2)}
            className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground"
          >
            Our models live on your Mac. Sees your screen, talks with you, and
            acts on your behalf.
          </motion.p>
          <motion.div {...fadeUp(0.3)} className="mt-10 flex items-center justify-center">
            <a
              href="https://zekthar-landing.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-background"
            >
              Try for free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-6 py-10 md:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-4 text-[13px] text-muted-foreground md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden text-foreground/30 md:inline">•</span>
            <span className="hidden md:inline">© 2026 · Real-time AI personas</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="#" className="transition-colors hover:text-foreground">Terms</a>
            <a href="#" className="transition-colors hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
