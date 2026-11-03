---
title: handoff-agent
summary: A Claude Code plugin that builds iOS, Android and the backend at once from a single Claude Design handoff package.
short: One design handoff → iOS, Android and backend at once
metric: { value: 39, unit: '%', label: 'fewer tokens · 8 runs each on iOS and Android' }
period: 2026.09 ~
stack: [Claude Code plugin, Python MCP server]
order: 1
---

## Problem

Building iOS and Android separately was inefficient. I wanted a tool to take the repetition so I could focus on making the service better.

## Approach

Pipeline: one design handoff → iOS, Android and backend built in parallel.

- Refines Claude Design prototype output into a layout tree (JSON)
- Interviews for front-end and backend infrastructure, then writes a spec — pricing, features and expected scale offered as options in a table
- Three builder agents implement each platform from those outputs — iOS, Android and backend in parallel
- Checks consistency against a report before merging. Sensitive values (certificates, keys) are entered by the user

## Result

Refining into a layout tree cut the implementation agents' tokens by 39% (measured over 8 runs each on iOS and Android). I'm now building Forest with it.
