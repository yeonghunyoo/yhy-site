---
title: Forest
summary: A meditation app that mixes five nature sounds — waves, rain, wind, sand and a wood fire — into your own blend.
short: A meditation app that mixes five nature sounds
metric: { value: 5, label: tracks mixed at once }
period: 2026.09 ~
stack: [SwiftUI, Jetpack Compose, AVAudioEngine, Cloudflare Workers, Hono, D1, R2]
order: 2
images:
  - { src: ./forest/01-onboarding.jpg, alt: "Forest onboarding — sounds for a moment to breathe" }
  - { src: ./forest/02-home.jpg, alt: "Forest home — saved mixes" }
  - { src: ./forest/03-mixer.jpg, alt: "Forest mixer — volume sliders for the five sounds" }
  - { src: ./forest/04-player.jpg, alt: "Forest player — the Evening Waves mix playing" }
---

## What

A focus and meditation app where you mix five nature sounds in whatever proportions you like.

## Approach

- Native iOS and Android built at the same time with handoff-agent — SwiftUI and Jetpack Compose, same screens and components
- Cloudflare Workers + Hono, D1 and R2 backend — no servers to manage, and close to zero cost at this scale
- A five-track mixing player on AVAudioEngine — per-layer volume, presets and a sleep timer

## Result

In development.
