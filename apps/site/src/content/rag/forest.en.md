---
title: Forest — Sound Mixing Focused & Meditation App
source: { file: forest.ko.pdf, hash: aae4694ced265f0fd21a4457d6b03515e54b0a816d80caf490361d81360e1af3, parser: pdf-unpdf, pages: 2 }
---

<!-- rag-translate: from=forest.ko.md sha=73fb8bb92b7542f8 model=@cf/google/gemma-4-26b-a4b-it — 자동 번역(pnpm rag:translate). 원문을 고치면 다시 돌린다. 손으로 고쳐 굳히려면 이 줄을 지운다 -->

<!-- page:1 -->

## Overview — A meditation app to create your own sound by mixing at desired ratios

Forest (2026.09 ~) is a sound mixing, focus & meditation app. It allows users to create their own unique sounds by mixing five natural sounds—waves, rain, wind, sand, and firewood—at desired ratios. It is intended to be played as background audio while sleeping or focusing.

This project is being developed simultaneously for iOS and Android natives, automatically generated based on user interviews and design prototypes using handoff-agent. There are four main screens: Onboarding, Home, Sound, and History.

![Forest Onboarding Screen — Sounds for a moment to breathe](/media/2651e564d5141a3a4cf8f1441069f7a0.jpg)

![Forest Home Screen — List of saved mixes](/media/e05dbbb809bb2ca41d4ff44eb57521c2.jpg)

![Forest Sound Adjustment Screen — Volume sliders for five sounds](/media/31899b5fae8eb962c71f12715f9ca1f2.jpg)

![Forest Playback Screen — Playing Evening Waves mix](/media/80877856fbc56a0ee61b9235b702ea0d.jpg)

## Features

- Sound Mixing: Overlapping and playing 5 layers (waves, rain, wind, sand, firewood) by adjusting each volume individually.
- Presets & Custom Mixes: 5 types of presets such as "Evening Waves" and "Forest Morning." Users can also save their own custom combinations.
- Sleep Timer: Automatic stop after 15 / 30 / 45 / 60 minutes.
- History & Statistics: Session history and consecutive usage days.
- SNS Login & Profile Sync: To be added.
- Subscription & In-App Purchase (IAP): To be added.

## Skills

Swift (SwiftUI), Kotlin (Compose), TypeScript, Hono, Cloudflare Workers, D1, R2, OpenAPI, handoff-agent

## Backend — Why these choices?

- hosting — Cloudflare Workers + Hono: Instead of building and operating a server directly, this is a serverless platform where code is executed immediately at edge locations worldwide upon deployment. Hono is a lightweight framework that allows for simple API development on top of it. I chose this because it eliminates server management overhead and is the most cost-effective for this scale of traffic.
- db — D1 (SQLite): Since it is a database that can be used directly within Workers, no separate connection settings are required. I chose this because the free tier is sufficient for this scale of traffic.
- storage — R2 (Audio Storage): There are no egress costs when downloading files. Based on AAC 256kbps · 90-second loops (approx. 2.75MB per file), the free 10GB tier can store about 3,700 extended audio tracks. I determined that the cost burden is virtually non-existent.
- auth — Custom JWT Authentication (Anonymous Login): Allows users to start using the app immediately via their device without a registration process. The goal is to allow users to access the app without any burden. I plan to implement synchronization so that user data can be migrated later when SNS login is added.

<!-- page:2 -->

## iOS · Android Side-by-Side

Both platforms were created simultaneously from the same handoff package.

iOS · SwiftUI

- Implemented 4 screens (Onboarding, Home, Sound, History) and overlay components such as playback screens, mix sheets, and settings sheets.
- Implemented a 5-track simultaneous mixing player based on AVAudioEngine.
- Implemented API communication, data models, and offline mockup fallback layers.
- Configured a dedicated theme system for design tokens such as colors, typography, and spacing.

Android · Jetpack Compose

- Implemented the same screen and component structure as iOS using Compose.
- Implemented the audio mix player.
- Implemented the API client and offline mockup fallback layer.
- Wrote app state ViewModels, 4 unit tests, and 1 navigation UI test.

The tool used to build this app is handoff-agent (a plugin that implements all three platforms at once).
