---
title: This portfolio
summary: A portfolio that shows what I built, why, and how it turned out — instead of a list of tools. Building it is the first project.
stack: [Astro, React, Tailwind CSS, Cloudflare Workers, D1, KV, Better Auth, Resend]
order: 1
changelog:
  - date: '2026-10-28'
    text: Phase 1 — Korean/English pages, mobile-first layout
  - date: '2026-10-28'
    text: Moved from Cloudflare Pages to Workers, first deploy with the wrangler CLI
  - date: '2026-10-28'
    text: Wrote the design docs — overview, per-phase docs, and completion criteria
---

<!-- Draft: wording to be polished later. -->

## Problem

Most portfolios list tools and job titles. That list doesn't show what was built, why, or what changed because of it. I wanted to come across as a builder rather than a specialist, and had nowhere to show that.

## Approach

- Make the portfolio itself the first project, so building it becomes the content.
- Write the design docs before the code, and give every phase a completion bar it has to clear.
- Keep all infrastructure on Cloudflare (Workers, D1, KV) so the monthly cost stays near zero.
- Ship static HTML by default and use React islands only where interaction is needed, like sign-in and letters.
- Signed-in visitors can send me a letter directly; I read and reply from a small admin.

## Result

In progress. The design docs and infrastructure are done, and the first deploy is live. The changelog records what changes in each phase.
