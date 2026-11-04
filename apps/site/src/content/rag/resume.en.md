---
title: Yeonghun Yoo's Resume
source: { file: resume.ko.pdf, hash: 6d2a773d708f5296b660fa7245cbce238af30a4bc0144074e479e26a5dd7908a, parser: pdf-unpdf, pages: 3 }
---

<!-- rag-translate: from=resume.ko.md sha=5a6836611229a05d model=@cf/google/gemma-4-26b-a4b-it — 자동 번역(pnpm rag:translate). 원문을 고치면 다시 돌린다. 손으로 고쳐 굳히려면 이 줄을 지운다 -->

<!-- page:1 -->

## Introduction — Yeonghun Yoo, Software Engineer · iOS · Builder

While I have primarily focused on iOS native app development, I do not confine myself to a specific platform or role. When I encounter recurring problems while working, I build tools to solve them myself. I leave repetitive tasks to tools so I can focus on improving the service.

Recently, I solved the inefficiencies experienced while developing iOS and Android separately through a plugin called handoff-agent, and I am currently building a service called Forest using that tool.

Total experience is 4 years and 6 months (as of November 2026).

## Working Principles

Principle 1 — Annoyance is the starting point of an idea. When I feel that a repetitive task is bothersome, I use that sensation as a starting point for automation ideas. Since the human brain cannot actually multitask, I try to offload repetitive work through automation as much as possible.

Principle 2 — Speak with evidence. Showing rather than telling reduces misunderstandings. I provide formatted API communication logs, communicate UI issues through images or videos, and discuss designs using sample data in advance.

## Skills & Contact

Skill: Swift, Kotlin (Compose), Dart, Flutter, TypeScript, Python, RxSwift, Fastlane

Contact: yeonghun.yoo@gmail.com · GitHub github.com/yeonghunyoo

## Built: handoff-agent

I build tools, and then I build services with those tools.

handoff-agent (Claude Code plugin · 2026.09 ~) is a Claude Code plugin that creates iOS, Android, and backend simultaneously using a single Claude Design handoff package. Pipeline: 1 Design Handoff → Simultaneous implementation of iOS, Android, and backend.

- input: Claude Design output → refine: layout tree (JSON) → interview: spec document · options table → iOS · Android · backend → verify: inspection report · Merge
- Refined Claude Design prototype output into a layout tree (JSON) structure — reduced implementation agent tokens by 39% (measured 8 times each for iOS and Android)
- Established a specification documentation process based on front-end + back-end infrastructure interview results — provides options in a table based on interviews regarding pricing, features, and expected user scale
- Three builder agents that implement each platform based on the above outputs — simultaneous generation of iOS, Android, and backend
- Interview-based backend infrastructure decision structure and report-based consistency check process — sensitive information (certificates, keys) is entered directly by the user

## Built: Forest

Forest (Sound mixing focus & meditation app · 2026.09 ~) is a meditation app that allows users to create their own sounds by mixing five natural sounds—waves, rain, wind, sand, and firewood—at desired ratios. I am currently developing iOS and Android native versions simultaneously using handoff-agent.

- Simultaneous iOS and Android native development using handoff-agent — SwiftUI · Jetpack Compose, using the same screen and component configurations
- Cloudflare Workers + Hono · D1 · R2 backend — near-zero cost at this scale without the burden of server management
- 5-track simultaneous mixing player based on AVAudioEngine — volume per layer · presets · sleep timer

<!-- page:2 -->

![Forest onboarding screen — Sounds for a moment to breathe](/media/2651e564d5141a3a4cf8f1441069f7a0.jpg)

![Forest home screen — List of saved mixes](/media/e05dbbb809bb2ca41d4ff44eb57521c2.jpg)

![Forest sound adjustment screen — Volume sliders for five sounds](/media/31899b5fae8eb962c71f12715f9ca1f2.jpg)

![Forest playback screen — Playing Evening Waves mix](/media/80877856fbc56a0ee61b9235b702ea0d.jpg)

## Built: nuvo

nuvo (Private Photo Service · 2026.11 ~) is a private photo service that gathers scattered photos in one place to view and build memories with family and friends. Service https://nuvo.yeonghun-yoo.workers.dev · Code github.com/yeonghunyoo/yhy-site/tree/main/apps/nuvo

- View local PC folders directly without uploading (usable without login) + upload to nuvo storage — integrated timeline that merges duplicate photos into a single entry
- Space: Upload with family/friends via invitation links, roles · export · ownership transfer, real-time feed (WebSocket)
- Photo processing in browser Web Worker — SHA-256 · EXIF · thumbnails · similar duplicate cleanup (dHash) · HEIC decoding
- Single Cloudflare Worker (Hono API · R2 · Durable Object) + Hyperdrive → Postgres, Drizzle ORM
- Landing shader and 3D time tunnel (React Three Fiber), dark · light themes

## Experience: Clush · Dispatched to a semiconductor company, 2026.09 ~ Present

Project: Building in-house agents and RAG pipelines for a semiconductor company

Since September 14, 2026, Yeonghun Yoo has been dispatched to a semiconductor company (client) as part of Clush to build in-house agents and RAG pipelines.

- Responsibilities: Chat agents, advancing RAG data pipelines

## Experience: Tripaid · iOS Native, 2025.10 ~ 2026.09

Helmidak AI Chat Health Consultation Service (App Store) — iOS native app development and architecture/DX advancement

Refining iOS UI/UX and synchronizing services across platforms

- Inspected the iOS environment, which had stagnated compared to Android, and improved overall UI/UX
- Ensured consistency across platforms
- Improved view maintainability through design componentization and tokenization

Implementing common network interceptors and token automation

- Separated response and error handling into an interceptor layer to remove redundancy
- Automated authentication token injection and renewal
- Improved debugging efficiency with custom logging

Minimizing design workload using Claude Design

- Shared direction across teams using design samples
- Converted design and translation results into native resources for rapid delivery

## Experience: holich, 2023.04 – 2025.02 · 1 year 11 months

Let's Bee Philippine food delivery service (2024.07 – 2025.01 · Flutter)

- Implemented UI/UX for User and Partner (merchant) apps
- Integrated translation automation processes into feature development

(Former) Let's Bee Clark area delivery service (2023.06 – 2024.11 · iOS) — UI/UX improvements and 5 feature additions

- Resolved shopping cart synchronization issues
- Implemented scroll position caching between tabs
- Added password recovery feature
- Handled Apple account deletion (token revoke)
- Unified SNS sign-up information

MyCONECT Contactless Hotel Service Platform (2023.04 – 2024.12 · iOS)

- Face and ID recognition-based identity verification
- Hourly reservation feature using horizontal stack charts

## Experience: Alpha Igloo, 2020.11 – 2022.03 · 1 year 5 months

Saju-based baby naming service · Native iOS app maintenance

- UI/UX improvements and content additions — added 'Today's Zodiac Horoscope' and 'Tarot New Year Horoscope' content
