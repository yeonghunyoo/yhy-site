---
title: nuvo
summary: A private photo service that gathers scattered photos in one place and builds them up together with family and friends.
short: A private photo service that gathers scattered photos in one place
metric: { value: 2, label: 'sources in one timeline · this PC + nuvo' }
period: 2026.11 ~
stack: [React, Vite, React Three Fiber, Cloudflare Workers, Hono, R2, Durable Objects, Hyperdrive, Postgres, Drizzle, Better Auth]
order: 3
---

[Open the service](https://nuvo.yeonghun-yoo.workers.dev) · [Code](https://github.com/yeonghunyoo/nuvo)

## What

A private photo service that gathers scattered photos in one place and builds them up together with family and friends.

## Approach

- Browse a folder on this PC without uploading (works without signing in). Together with photos uploaded to nuvo, it forms one timeline where the same photo shows once
- Spaces: invite family and friends by link to upload together, with roles, export and ownership transfer, and a live feed (WebSocket)
- Photo processing runs in browser Web Workers — SHA-256, EXIF, thumbnails, near-duplicate cleanup (dHash), HEIC decoding
- One Cloudflare Worker (Hono API, R2, Durable Object) + Hyperdrive → Postgres, Drizzle ORM
- A landing shader and a 3D time tunnel (React Three Fiber), dark and light themes

## Result

The MVP is deployed. Cloud integrations, a mobile backup app and video come next.
