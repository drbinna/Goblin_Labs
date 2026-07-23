<p align="center">
  <img src="public/favicon-192.png" width="96" height="96" alt="Goblin Labs" />
</p>

<h1 align="center">Goblin Labs</h1>

**The next decade of agents will look more like people.**

Goblin Labs is an AI research lab building embodied, real-time AI personas —
agents that see your screen, talk with you, and act alongside you. We're
solving three hard problems: low-latency avatar rendering, persistent
multi-modal context, and reliable computer use.

This repo is the lab's homepage, live at **[usegoblin.xyz](https://www.usegoblin.xyz)**.

## The builds

| Persona | What it is | Status |
|---|---|---|
| **[Kara](https://kara.usegoblin.xyz)** | A design partner you talk to. Describe the site you want and she designs and publishes a finished page while you're still on the call. | **Live** — [repo](https://github.com/usegoblin-xyz/Kara-3) |
| **[Zek'thar](https://zekthar-landing.vercel.app/)** | Our first shipped model: an alien field observer on macOS that sees your screen, talks in real time, and acts on your behalf. | Shipped |
| **[Pulse](https://usegoblin-xyz.github.io/pulse/)** | The agent on your screen that fills the forms, finds the buttons, and walks you through the web's most stubborn sites. | In development — [repo](https://github.com/usegoblin-xyz/pulse) |
| **Gabriel, Mia & Anne** | Studio-built personas rendered live on the homepage — Anne runs the support desk with tools attached. Click one and say hello, no signup needed. | Live on the site |

The **Studio** is the pipeline behind the smaller personas: write a brief,
pick a face and voice, attach knowledge and tools, deploy to a shareable talk
page.

## Verticals

Persona libraries tailored to specific industries: **healthcare** (triage,
follow-up, long-running care plans), **education** (tutors that watch the work
as it unfolds), and **engineering** (pair-programmers that read the diff and
stay in context across the session).

## Development

Vite · React · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion —
deployed on Vercel (`vercel.json`, serverless functions in `api/`).

```bash
npm install
npm run dev
```

## License

© 2026 Goblin Labs
