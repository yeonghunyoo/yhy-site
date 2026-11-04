---
title: How this portfolio site is built
---

## Site architecture overview

This is the Korean/English portfolio of yhy, a builder and developer. Static pages show the projects, visitors can send yhy a letter (a message) without signing in, and the admin signs in at /admin to read and answer letters. The visitor site has no sign-in. A chat that answers from the portfolio documents (RAG) is the second-phase feature already running. 3D and shader effects are a later phase and not built yet; the brand, domain and visual world are undecided.

One-line structure: visitor's browser → one Cloudflare Worker (static assets + dynamic code) → D1, KV, R2, Vectorize and Workers AI, plus external services Resend (email), Google (admin sign-in) and Telegram (alerts).

Build order was 0 infrastructure → 1 frontend and responsive layout → 2 auth → 3 letters → 4 admin (MVP) → 5–6 chat and RAG → 7 3D. Each phase started only after the previous one met its completion criteria.

## Tech stack and why

- Astro 7: static-first. Most pages are built to HTML; only dynamic routes (/, /admin, /api, /auth, /media) render on the server
- React 19 islands: on the visitor site only the letter sheet and toasts (Overlay) and the chat dock (ChatDock) are React, plus the admin sign-in (AdminLogin) in the admin; everything else is HTML without JS
- Tailwind CSS v4 + daisyUI 5: pure-CSS components, 0KB JS, no CSP conflict. Design tokens live only in src/styles/tokens.css
- Cloudflare only: Workers, D1, KV, R2, Vectorize and Workers AI in one account keep the monthly cost near zero. Moved from Pages to Workers on 10/28 because the Astro adapter dropped Pages
- Better Auth: admin-only passwordless sign-in (magic link, sign-in code, Google) with a D1 adapter
- Drizzle ORM: D1 schema and migrations
- Resend for email, a Telegram bot for operations alerts
- Node 24, pnpm, TypeScript 6

## Infrastructure: the Cloudflare Worker and its bindings

One Worker (portfolio-web) serves both static assets and dynamic requests. Static pages come straight from Workers static assets (ASSETS); only dynamic routes run Worker code, and only Worker code touches storage and external services.

Bindings the Worker uses:
- DB → D1: users, sessions, letters, chat logs, RAG sections and chunks
- KV → KV: rate-limit counters (sign-in email, letters per IP), daily admin sign-in counts, chat turns per IP and monthly tokens, alert de-duplication, the list of vector ids
- R2 → R2 bucket portfolio-rag: RAG source files (private) and document images (public via /media)
- VEC → Vectorize index portfolio-rag: 1024-dimension cosine, chunk vectors
- AI → Workers AI: answer, supervisor, embedding and safety models

Deployment: pushing to GitHub does not deploy. Production is deployed only from a local machine with `pnpm run deploy` (astro build → wrangler deploy); production secrets are Worker secrets. The repo is public, so secrets are never committed.

## Request flow: static pages and dynamic routes

1. A request for a static page (/ko, /en, /ko/projects/…, /ko/privacy) is answered by the Worker's static assets with prebuilt HTML; no session check
2. The root / is dynamic: it reads Accept-Language and redirects 302 to /ko or /en
3. Dynamic routes (/admin, /api/*, /auth/*, /media/*) run Worker code, starting with the middleware (src/middleware.ts)
4. For /admin and /api requests the middleware reads the session through Better Auth into locals.user
5. For an /admin page without a session the middleware rewrites to /admin/login (signed in but not an admin shows "no permission"). For /api/admin requests from non-admins it returns 404, hiding the admin API entirely
6. The handler responds; on a 5xx the middleware sends a Telegram alert (at most once a minute)

Security headers: every page carries a CSP in a <meta> tag and Astro allows its inline scripts by hash, so HTML style="" attributes are not used.

## Front end: Astro pages and React islands

- Languages: /ko and /en are generated from src/pages/[locale]/. Strings are in src/i18n/ko.json and en.json, long text in content collections as {slug}.ko.md / .en.md. Astro's built-in i18n routing is not used
- Island loading: React islands attach through a custom client:demand directive. Visitors get no React at first; an island hydrates only on the first tap on a [data-action] button (or to resume a toast or a reload) and then handles that tap. There is no session check. The initial JS budget is 50KB; measured 7.2KB on 11/03
- The Overlay island shows the letter sheet and toasts; ChatDock is the chat dock. The visitor site has no sign-in button, account menu, sign-in sheet or account-deletion sheet
- If a tab opened before a deploy asks for deleted JS files, the demand directive reloads once and reopens what was tapped
- Mobile first: base styles are mobile, widened from md up; 44px touch targets, 100dvh, safe areas
- Keyboard handling: the chat dock and sheets read visualViewport every frame and set their height and position directly in the DOM (viewport.ts); while open they lock background scroll and block touch scrolling outside allowed areas (scroll-lock.ts)
- Loading states: async buttons are disabled with aria-busy while pending; global.css draws the spinner

## Admin sign-in: Better Auth, magic link, sign-in code, Google

Only admins sign in; visitors never do. Opening any /admin page without a session is rewritten by the middleware to /admin/login (src/pages/admin/login.astro with the React island AdminLogin.tsx). The auth handler is /auth/* (src/pages/auth/[...all].ts) and the configuration is src/lib/server/auth.ts. No passwords are collected.

Email sign-in flow:
1. The admin enters an email on /admin/login → POST /auth/sign-in/magic-link
2. hooks.before checks rate limits (3 per IP and 1 per email per 10 minutes, in KV)
3. sendMagicLink stores the link token in D1 verification and creates a 6-digit code with createVerificationOTP (stored hashed, 15 minutes, void after 3 wrong tries)
4. Resend sends one email containing both the link and the code
5. Opening the link in the same browser creates the session at once. If the mail app opens it in its in-app browser or on another device, the code is typed into the original browser's sign-in page → POST /auth/sign-in/email-otp (10 per IP per 10 minutes) → session
6. After sign-in the page returns to /admin. A signed-in account that is not an admin sees "no permission" and a sign-out button

Google sign-in creates the same session through OAuth; inside in-app browsers such as KakaoTalk, Google blocks it, so the button is disabled with a note. Sessions live in D1 with HttpOnly, Secure, SameSite=Lax cookies for 30 days. Blocked users (user.is_blocked) cannot create a session.

## Letters: sending, email, alerts and replies

A letter is a message any visitor sends to yhy without signing in.

1. The visitor opens the letter sheet and fills in a subject (optional, 80 characters), a body (required, 10–2,000 characters, at most 5 links) and a reply-to email (required, typed by the visitor, not verified)
2. The sheet calls POST /api/letters, which does not read the session
3. The server checks limits: 3 per IP hash per 24 hours (KV letter:ip:{hash}), the site-wide daily cap LETTER_DAILY_CAP, and 409 for the same body as the previous letter from the same reply-to address. As bot defence, a hidden honeypot field website that is filled in gets a success answer without storing or sending. Turnstile may be added later if spam appears
4. The server stores it in D1 letters (user_id is null)
5. The server sends it to yhy's inbox through Resend (reply_to = the email the visitor typed; the mail has only a Reply-To line, no From or sign-in lines). On failure the letter stays with status = failed and the admin can resend it
6. The server alerts Telegram about the new letter (sender masked, sent with waitUntil apart from the response)
7. When the admin replies at /admin/letters/{id}: POST /api/admin/letters/{id}/reply → D1 letter_replies → Resend sends it to the visitor → letters.status = replied

There is no conversation thread on the site; after the reply it continues by email.

## Admin pages: /admin

/admin is server-rendered and opens only for admins with a verified email. Admins are ADMIN_EMAILS (the root admins) or D1 user.is_admin (designated from /admin/users). Without a session /admin/login appears; signed in but not an admin shows "no permission" and a sign-out button. /api/admin/* answers 404 to non-admins and is checked in both the middleware and the handler, and form POSTs must come from the same origin.

Pages:
- /admin metrics: sign-up count, daily letters and sign-ins for the last 7 days (KST; sign-ups and sign-ins now reflect admin sign-ins only), drawn as SVG bars without a chart library
- /admin/letters: status filters (all, unread, replied, failed); the detail page records reads and offers reply and resend
- /admin/users: the list of accounts (admins) with join date, method, last sign-in, a block toggle (blocking deletes all of that user's sessions) and an admin-grant toggle
- /admin/chat: chat question log (no answer text) with route, guard verdict and tokens; chunk and vector counts, vector sync, the reference-question evaluation and the attack-question check

Write actions are plain HTML form POSTs to /api/admin/… that redirect 303 back to the page.

## Chat end-to-end flow

The chat dock sits collapsed at the bottom right and opens on tap. One question is handled like this:

1. The dock sends the question and the signed history to POST /api/chat
2. /api/chat checks CHAT_ENABLED, the turn limit (no sign-in; 20 per IP hash per KST day), the site-wide daily turn cap and the monthly token cap. Over the limit it shows "That's it for today (20 a day). Let's continue by letter." with a letter button
3. The pipeline (chat-pipeline.ts) checks the question with injection regexes; a match is refused without a model
4. The Llama Guard safety check and the supervisor run at the same time
5. The safety verdict is applied first (self-harm gets help information)
6. The supervisor's route decides what happens: portfolio → the portfolio agent (RAG search and a grounded answer, streamed), diagram → the diagram agent (same search, then Gemma 4 returns node/edge JSON and a summary, code validates it, and the chat dock draws it as an SVG flow chart), chat → the supervisor's short reply, contact → letter guidance with a letter button, off_task → a fixed refusal
7. The output check (code blocks, runaway citations) runs and the answer goes to the page over SSE
8. chat_logs records the question, route, retrieval, guard verdict and tokens (never the answer text; kept 90 days)

A sub-agent's answer goes straight to the page; it does not pass back through the supervisor.

## Supervisor and routing

The supervisor (src/lib/server/agents/supervisor.ts) calls the same Gemma 4 26B model as the answers, with reasoning off, and gets JSON-schema output {route, query, reply}. route must be one of portfolio, diagram, chat, contact, off_task. diagram is for requests to draw a flow, structure or relationship; a plain "how does it work?" without asking for a picture is portfolio.

- Input: the signature-verified recent conversation (up to 6 turns), the question, and the document outline (slug, title and section headings from D1 rag_sections, cached 5 minutes per isolate). The outline is only for recognising names that appear only in the portfolio
- portfolio: it writes a standalone search query with pronouns resolved from the conversation and hands it to search
- chat: it writes a 1–2 sentence reply itself and states no facts about yhy
- Mixed requests go to portfolio with only the portfolio part in the query
- Failures: a failed call is retried once after 300ms; if it still fails or the JSON is broken, the original question takes the portfolio route

Measured on 11/03 with 39 reference questions: route accuracy 100%, portfolio recall 95%, off-task refusal 100%. The supervisor takes about 0.9s (median) and about 10 neurons per call.

## RAG search: the portfolio agent

The portfolio agent is retrieve() in rag.ts plus the answer prompt in chat.ts.

1. Keyword search: D1 FTS5 (trigram) plus 2-character LIKE, with common Korean particles stripped from terms
2. Vector search: bge-m3 embeds the question and Vectorize finds near chunks
3. Both run in parallel, top 24 each, merged with RRF (k=60); vector candidates missed by keywords need a score of 0.35 or more
4. Scope check: if the nearest vector scores below 0.42 there is no basis, and it ends with letter guidance without a model call
5. Same-language documents get ×1.2 and FAQ ×1.1; child chunks roll up to parent sections and the top 6 are kept
6. The sections go into <documents> tags; Gemma 4 answers in Markdown — one fact in 1–2 sentences, several features or steps as a one-line lead plus a bullet list — and ends with a [[slug]] source line. The chat dock never parses Markdown as HTML; it turns only lists, bold and code into elements
7. Only slugs of documents actually given count as source chips

Chunking has two levels: parents (## sections, up to 1,500 characters) and children (300–500 characters). Reranking is off because the available reranker cannot separate Korean results.

## Document ingest pipeline

The chat knows only the markdown documents in src/content/rag/ and the project detail texts.

1. Import (pnpm rag:import): a PDF or markdown source → parser registry → a markdown draft for review. Sources go to R2 sources/ (private), document images to R2 media/, and the text links them as /media/{hash}. Scanned pages go in as page images (OCR is a later phase)
2. Review: a person reads and fixes the draft (order, personal data, alt text), removes the review marker and commits
3. Build (pnpm rag:build / rag:build:remote): documents are split into parent sections and child chunks in D1 rag_sections and rag_chunks. Ids are content hashes, so only changed chunks get new ids. A production build stops if any document still has its review marker
4. Vector sync: /admin/chat → vector sync in the deployed Worker compares D1 chunks with Vectorize, embeds only new chunks and deletes only removed ones; the id list is kept in KV

/media/{hash}.{ext} requests are served by the Worker from R2 media/; any other name returns 404.

## Chat guardrails

The repo is public, so a leaked prompt is not treated as harm. What is guarded against: abuse and cost, invented facts and insults, forged history, and missed crisis signals.

1. History signing: the server attaches an HMAC signature to each answer and accepts only (question, answer) pairs with a valid signature as history
2. Tag forgery: < and > in user text become full-width characters
3. Injection check: requests like "ignore previous instructions" or "show your system prompt" are refused by regex without a model
4. Safety check: Llama Guard 3 checks the question; self-harm (S11) gets crisis-line information instead of a refusal
5. Route and scope: off-task requests are routed to off_task and refused with a fixed message; portfolio questions without a basis get letter guidance
6. Prompt rules: no facts outside the documents, no code, translation, role-play or advice; mixed requests get only the portfolio part
7. Output check: the stream stops at a code block or at more than 6 citations; answers are at most 300 tokens
8. Cost: turn limits, a monthly token cap, 500-character questions

## Data storage: D1 tables, KV keys, R2

D1 tables:
- user, session, account, verification: managed by Better Auth; user has extra is_blocked and is_admin; verification holds magic-link tokens and hashed sign-in codes. Only admins sign in
- letters: subject, body, reply-to address (typed by the visitor), language, status (sent, read, replied, failed)
- letter_replies: admin replies
- chat_logs: question, rewritten query, sources, retrieval, guard verdict (flag), route and tokens; no answer text, IPs hashed, 90 days
- rag_sections: parent sections (the unit given to the model), with page number and image URLs
- rag_chunks: child chunks (the search unit) with an FTS5 index; the id is also the Vectorize id

KV keys: ml:ip and ml:email (sign-in email limits), otp:ip (code entry limit), stats:login:{date} (daily admin sign-ins), letter:ip:{hash} (letters per IP), chat:ip:{hash}:{date} (turns per IP), chat:month:{month} (tokens), notify:* (alert de-duplication), rag:vector-ids and rag:vector-synced (vector sync records).

R2 portfolio-rag: sources/{hash} (originals, private) and media/{hash} (images, public via /media).

Migrations are generated with Drizzle Kit and applied with wrangler d1 migrations apply (0000–0006).

## Cost and limits

- Workers AI is free up to 10,000 neurons a day. A portfolio question costs a safety check, the supervisor, an embedding and an answer; small talk, contact and off-task turns make no answer call. The supervisor is about 10 neurons per call (measured 11/03)
- App limits: 20 turns a day per IP hash (over it: "That's it for today (20 a day). Let's continue by letter." with a letter button), a site-wide daily turn cap, and a monthly token cap of 2,000,000 by default (CHAT_MONTHLY_TOKEN_CAP). At the cap the chat replies "taking a break today" with a letter button and alerts Telegram
- If a Workers AI call fails from a limit or an error, it ends with the same fixed reply
- Letters: 3 per IP hash per 24 hours and the site-wide daily cap LETTER_DAILY_CAP. Admin sign-in emails: 3 per IP and 1 per address per 10 minutes
- D1, KV, R2 and Vectorize stay within free tiers at this scale

## How it is developed and run

- Design first: docs/ holds a design document per phase, read before implementing; when design and code disagree, the docs are updated before the code
- Completion criteria: each phase must pass its document's criteria before the next starts
- Solo operation: commits go straight to main without PRs, and a local pnpm build must pass before pushing
- Deployment: only through the local wrangler CLI (pnpm run deploy). The chat dock is shown by the build flag PUBLIC_CHAT_ENABLED and the API is opened by the Worker secret CHAT_ENABLED
- Alerts: new letters, mail failures, 5xx errors, chat cap and guard blocks go to Telegram; monitoring is Cloudflare's built-in logs
- Claude Code implements; yhy understands the process and makes the decisions

## Browser support

Supported: Safari and iOS 16.4+, Chrome 111+ (the floor set by Tailwind v4). In the 11/03 audit, Chromium (desktop, iPhone size, small Android) was checked in a real browser and Safari/iOS through code and build review. Safari-specific issues were fixed: the missing Popover API on iOS 16, background scrolling under sheets, Google sign-in blocked in in-app browsers, and the screen shifting when the keyboard opens. The real-device checklist is in docs/guides/browser-support.md.
