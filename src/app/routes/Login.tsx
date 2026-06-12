import { SignIn } from "@clerk/clerk-react";
import { Link, useSearchParams } from "react-router";

// Clerk appearance tuned to the lab's look: near-black ground, soft borders,
// white primary actions, Inter for UI. The card chrome is stripped so the
// component sits flush on our own panel.
const appearance = {
  variables: {
    colorPrimary: "#fafafa",
    // Text rendered ON the white primary button — without this Clerk picks
    // white-on-white ("CONTINUE" was invisible).
    colorTextOnPrimaryBackground: "#0a0a0a",
    colorBackground: "#0a0a0a",
    colorInputBackground: "#111111",
    colorInputText: "#fafafa",
    colorText: "#fafafa",
    colorTextSecondary: "#9a9a9a",
    colorDanger: "#ef4444",
    borderRadius: "0.75rem",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full",
    card: "bg-transparent shadow-none border-0 p-0 w-full",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    // Dark buttons carry white text. Clerk styles the inner text/arrow nodes
    // directly, so target them too (with !important to beat Clerk's CSS).
    socialButtonsBlockButton:
      "border border-border/60 bg-background !text-[#fafafa] hover:bg-foreground/5",
    socialButtonsBlockButtonText: "!text-[#fafafa]",
    socialButtonsBlockButtonArrow: "!text-[#fafafa]",
    // White primary button carries dark text.
    formButtonPrimary:
      "bg-foreground !text-[#0a0a0a] hover:bg-foreground/90 text-[12px] font-semibold uppercase tracking-[0.14em]",
    buttonArrowIcon: "!text-[#0a0a0a]",
    footerActionLink: "text-foreground hover:text-foreground/80",
    formFieldInput: "border-border/60",
  },
} as const;

export default function Login() {
  const [params] = useSearchParams();
  const redirect = params.get("redirect") ?? "/studio";

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="text-[14px] font-semibold tracking-tight">
          Goblin Labs
        </Link>
        <Link
          to="/"
          className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          Back to lab
        </Link>
      </header>

      <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col items-center justify-center px-6 py-24">
        <div className="mb-8 text-center">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Goblin Labs
          </div>
          <h1 className="mt-3 text-[2rem] leading-tight tracking-tight">
            Build personas.{" "}
            <span className="font-serif-italic">Deploy anywhere.</span>
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Sign in to deploy the personas you build and manage them from one
            place.
          </p>
        </div>

        <div className="w-full rounded-2xl border border-border/60 bg-background/60 p-6">
          <SignIn
            routing="path"
            path="/login"
            forceRedirectUrl={redirect}
            signUpForceRedirectUrl={redirect}
            appearance={appearance}
          />
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Visitors talking to your deployed personas never need an account —
          this sign-in is for builders.
        </p>
      </main>
    </div>
  );
}
