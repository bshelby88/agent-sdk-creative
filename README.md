# @tiffany/agent-sdk-creative

> CI status verified 2026-10-02: tsc clean, 47/47 tests, surfaces generation green.

Creative-integrator Agent SDK for the RAEN fleet.

## Overview

This project implements the OpenRouter Agent SDK (`@openrouter/agent`) to automate creative generation for the RAEN fleet. Every creative asset is machine-readable and x402-compliant per [RAEN A2A Charter](../../RAEN-A2A-CHARTER.md).

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Creative Agent Loop (callModel)              │
├──────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Creative     │  │ MCP Tools    │  │ x402 Surfaces    │ │
│  │ Pipeline     │  │ (ComfyUI,    │  │ Auto-Generator   │ │
│  │ Tools        │  │  OpenSea,    │  │ (llms.txt,       │ │
│  │              │  │  GitHub)     │  │  pricing.md,     │ │
│  └──────┬───────┘  └──────┬───────┘  │  sample, x402.json)│
│         │                 │          └──────────────────┘ │
│         └────────┬────────┘                                │
│                  ▼                                         │
│         ┌────────────────┐                                 │
│         │ HooksManager   │                                 │
│         │ (Pre/Post/Stop)│                                 │
│         └────────────────┘                                 │
└──────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Generate a creative asset
npm start "Create an ASCII art banner for the RAEN fleet"

# Run the full creative pipeline
npm run pipeline "Research..." "Generate..." "Review..."

# Generate all x402 surfaces
npm run surfaces

# Audit surface compliance
npm run audit

# Batch generate
npm run batch "Brief 1" "Brief 2" "Brief 3"
```

## SDK Features Implemented

- **`callModel()`** — Unified multi-turn agent loop for creative generation
- **`tool()` + Zod schemas** — 7 creative pipeline tools (ASCII art, SVG, HTML, music, design tokens, sketches, x402 surfaces)
- **Stop Conditions** — `stepCountIs()`, `maxCost()`, `hasToolCall()` bounding every creative job
- **Lifecycle Hooks** — `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd` for observability
- **MCP Integration** — `@openrouter/mcp` for ComfyUI, OpenSea, GitHub, Composio
- **Machine-Readable Surfaces** — Auto-generated x402.json, llms.txt, pricing.md, /sample

## RAEN A2A Charter Alignment

- **§5.3** Machine-Readable Surface Compliance: All 4 required surfaces served
- **§3** A2A Dispatch Protocol: Agent responds to rae-kernel dispatch
- **§2** Claim-Mark-Release: Hooks track creative asset ownership
- **§6** AIP v1: `tool.agent()` subagents for discover/claim/verify/hand-off
- **§10** Search Methodology: `search_models` server tool for model selection

## Project Structure

```
agent-sdk-creative/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── creative-tools.ts     # 7 tool definitions
│   ├── agent-loop.ts         # callModel loop + hooks
│   ├── surfaces-generator.ts # x402 surface automation
│   └── mcp-integration.ts    # MCP tool connections
├── x402-marketing-surfaces/  # Auto-generated surfaces
│   ├── tiffany-creative/
│   ├── tiffany-marketing/
│   └── tiffany-dashboard/
├── package.json
└── tsconfig.json
```
