/**
 * Agent Loop Configuration
 * Main callModel agent loop for creative-integrator work.
 * Implements RAEN A2A Charter compliance with stopWhen conditions,
 * lifecycle hooks, MCP tool integration, and async tool patterns.
 *
 * Lifecycle events are fired to RAE Kernel (/v1/events) when KERNEL_URL
 * and KERNEL_API_KEY are configured, enabling fleet-wide observability
 * and event-driven dispatch.
 */

import { callModel, stepCountIs, maxCost, hasToolCall, HooksManager } from "@openrouter/agent";
import { createMCPTools } from "@openrouter/agent/mcp";
import { OpenRouter } from "@openrouter/sdk";
import { creativeTools } from "./creative-tools.js";
import { CreativeError, ErrorCode, validateStopParams } from "./error-handler.js";
import { randomUUID } from "crypto";

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const API_KEY = process.env.OPENROUTER_API_KEY || "";

// Endpoint selection: point at a local Colibri OpenAI-compatible server
// (coli serve / openai_server.py) by setting COLIBRI_BASE_URL; otherwise fall
// back to hosted OpenRouter. SDKOptions.serverURL is the documented override.
const BASE_URL = process.env.COLIBRI_BASE_URL || process.env.OPENROUTER_BASE_URL || "";

// ─── RAE Kernel event config ──────────────────────────────────────────
const KERNEL_URL = process.env.RAE_KERNEL_URL || "https://rae-kernel.fly.dev";
const KERNEL_API_KEY = process.env.RAE_KERNEL_API_KEY || "";

if (!API_KEY) {
  console.warn("[AgentLoop] OPENROUTER_API_KEY not set.");
}

export const openrouter = new OpenRouter(
  BASE_URL ? { apiKey: API_KEY, serverURL: BASE_URL } : { apiKey: API_KEY },
);

// ─── Kernel event helper (fire-and-forget) ────────────────────────────
export async function postKernelEvent(
  type: string,
  payload: Record<string, any>,
  dedupKey?: string,
): Promise<boolean> {
  if (!KERNEL_URL || !KERNEL_API_KEY) return false;
  try {
    const body = JSON.stringify({
      type,
      deduplication_key: dedupKey || `${type}-${payload.job_id || "unknown"}`,
      source: "tiffany-creative",
      tenant_id: "creative",
      payload,
    });
    const resp = await fetch(`${KERNEL_URL}/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": KERNEL_API_KEY,
      },
      body,
    });
    const data = await resp.json();
    if (data.created !== true) {
      console.warn(`[KernelEvent] ${type} not stored: ${JSON.stringify(data)}`);
    }
    return data.created === true;
  } catch (err) {
    console.warn(`[KernelEvent] POST ${type} failed: ${err}`);
    return false;
  }
}

export function generateJobId(): string {
  return randomUUID();
}

// ─── Base lifecycle hooks (logging only; used when kernel is unconfigured) ──
export const creativeHooks = new HooksManager();

creativeHooks.on("PreToolUse", {
  matcher: /^create_|generate_|build_/,
  handler: (payload: any) => {
    const toolInput = payload.toolInput || {};
    for (const [key, value] of Object.entries(toolInput)) {
      if (typeof value === "string" && value.length > 10000) {
        return { block: `Input too long for ${key}: ${value.length} chars` };
      }
    }
    return { mutatedInput: toolInput };
  },
});

creativeHooks.on("PostToolUse", {
  handler: (payload: any) => {
    const toolName = payload.toolName || "unknown";
    const durationMs = payload.durationMs || 0;
    console.log(`[CreativeAsset] ${toolName} completed in ${durationMs}ms`);
  },
});

creativeHooks.on("PostToolUseFailure", {
  handler: (payload: any) => {
    const toolName = payload.toolName || "unknown";
    const error = payload.error || "unknown";
    console.error(`[CreativeFailure] ${toolName}: ${error}`);
  },
});

creativeHooks.on("Stop", {
  handler: (payload: any) => {
    const steps = payload.steps || [];
    const totalCost = steps.reduce((sum: number, s: any) => sum + (s.cost || 0), 0);
    console.log(`[CreativeJob] Stopped after ${steps.length} steps, cost: $${totalCost.toFixed(4)}`);
    return { appendPrompt: "Summarize what was created." };
  },
});

creativeHooks.on("SessionEnd", {
  handler: (payload: any) => {
    const sessionId = payload.sessionId || "unknown";
    console.log(`[SessionEnd] Creative session ${sessionId} completed.`);
  },
});

// ─── Kernel-aware hooks factory ───────────────────────────────────────
// Builds a HooksManager that mirrors the base hooks PLUS fires RAE Kernel
// lifecycle events.  Each invocation gets its own job_id + model captured
// by closure so parallel calls (batchGenerateCreatives) don't race.
export function createKernelAwareHooks(jobId: string, model: string): HooksManager {
  const hooks = new HooksManager();

  // PreToolUse — input validation + creative_tool_started event
  hooks.on("PreToolUse", {
    matcher: /^create_|generate_|build_/,
    handler: (payload: any) => {
      const toolInput = payload.toolInput || {};
      for (const [key, value] of Object.entries(toolInput)) {
        if (typeof value === "string" && value.length > 10000) {
          return { block: `Input too long for ${key}: ${value.length} chars` };
        }
      }
      postKernelEvent("creative_tool_started", {
        job_id: jobId,
        agent: "tiffany",
        tool_name: payload.toolName || "unknown",
        status: "started",
        model,
      });
      return { mutatedInput: toolInput };
    },
  });

  // PostToolUse — log + creative_tool_used event
  hooks.on("PostToolUse", {
    handler: (payload: any) => {
      const toolName = payload.toolName || "unknown";
      const durationMs = payload.durationMs || 0;
      console.log(`[CreativeAsset] ${toolName} completed in ${durationMs}ms`);
      postKernelEvent("creative_tool_used", {
        job_id: jobId,
        agent: "tiffany",
        tool_name: toolName,
        status: "completed",
        model,
        duration_ms: durationMs,
      });
    },
  });

  // PostToolUseFailure — log + creative_tool_failed event
  hooks.on("PostToolUseFailure", {
    handler: (payload: any) => {
      const toolName = payload.toolName || "unknown";
      const error = payload.error || "unknown";
      console.error(`[CreativeFailure] ${toolName}: ${error}`);
      postKernelEvent("creative_tool_failed", {
        job_id: jobId,
        agent: "tiffany",
        tool_name: toolName,
        status: "failed",
        model,
        error: String(error).substring(0, 500),
      });
    },
  });

  // Stop — summary log + creative_job_completed event
  hooks.on("Stop", {
    handler: (payload: any) => {
      const steps = payload.steps || [];
      const totalCost = steps.reduce((sum: number, s: any) => sum + (s.cost || 0), 0);
      console.log(`[CreativeJob] Stopped after ${steps.length} steps, cost: $${totalCost.toFixed(4)}`);
      postKernelEvent("creative_job_completed", {
        job_id: jobId,
        agent: "tiffany",
        status: "completed",
        model,
        steps: steps.length,
        total_cost_usd: totalCost,
      });
      return { appendPrompt: "Summarize what was created." };
    },
  });

  // SessionEnd — log + creative_session_ended event
  hooks.on("SessionEnd", {
    handler: (payload: any) => {
      const sessionId = payload.sessionId || "unknown";
      console.log(`[SessionEnd] Creative session ${sessionId} completed.`);
      postKernelEvent("creative_session_ended", {
        job_id: jobId,
        agent: "tiffany",
        status: "session_ended",
        model,
        session_id: sessionId,
      });
    },
  });

  return hooks;
}

export async function buildToolSet(options?: { mcpServers?: Array<{ url: string; name: string }> }): Promise<any[]> {
  let tools: any[] = [...creativeTools];
  if (options?.mcpServers && options.mcpServers.length > 0) {
    try {
      const mcpHandles = await Promise.all(
        options.mcpServers.map(async (server) => {
          return createMCPTools({
            url: server.url,
            auth: { kind: "bearer", token: process.env.MCP_TOKEN || "" },
            toolNamePrefix: server.name.toLowerCase().replace(/\s+/g, "_"),
          });
        })
      );
      tools = [...tools, ...mcpHandles.flatMap((h: any) => h.tools)];
    } catch (err) {
      console.warn("[AgentLoop] MCP server connection failed, falling back to built-in tools:", err);
    }
  }
  return tools;
}

export async function runCreativeAgent(brief: string, options?: {
  model?: string; maxSteps?: number; maxCostUSD?: number;
  mcpServers?: Array<{ url: string; name: string }>;
}): Promise<any> {
  const model = options?.model || MODEL;
  const maxSteps = options?.maxSteps || 10;
  const maxCostUSD = options?.maxCostUSD || 1.00;

  const validation = validateStopParams(maxSteps, maxCostUSD);
  if (!validation.valid) {
    throw new CreativeError(`Invalid stop parameters: ${validation.errors.join(", ")}`, "INVALID_CONFIG" as any);
  }

  const tools = await buildToolSet(options);
  const stopConditions: any[] = [stepCountIs(maxSteps), maxCost(maxCostUSD), hasToolCall("finish")];

  try {
    return await callModel(openrouter, {
      model, input: brief,
      instructions: `You are Tiffany, Creative-Integrator for the RAEN fleet. Create creative assets. Every output must be machine-readable and x402-compliant.`,
      tools, hooks: creativeHooks, stopWhen: stopConditions, allowFinalResponse: true,
    });
  } catch (err) {
    throw new CreativeError(`callModel failed: ${err}`, "CALL_MODEL_FAILURE" as any, { model, brief });
  }
}

export async function runCreativePipeline(pipeline: { research: string; generation: string; review: string; }): Promise<{ research: any; generation: any; review: any }> {
  const researchResult = await callModel(openrouter, { model: MODEL, input: pipeline.research, tools: creativeTools, stopWhen: [stepCountIs(5), maxCost(0.25)] });
  const generationResult = await callModel(openrouter, { model: MODEL, input: `${pipeline.generation}\n\nContext: ${await researchResult.getText() || ""}`, tools: creativeTools, stopWhen: [stepCountIs(10), maxCost(0.50)] });
  const reviewResult = await callModel(openrouter, { model: MODEL, input: pipeline.review, tools: [...creativeTools], stopWhen: [stepCountIs(3), maxCost(0.25)] });
  return { research: researchResult, generation: generationResult, review: reviewResult };
}

export async function batchGenerateCreatives(briefs: string[], options?: { parallel?: number; model?: string; maxSteps?: number }): Promise<any[]> {
  const batchSize = options?.parallel || 3;
  const results: any[] = [];
  for (let i = 0; i < briefs.length; i += batchSize) {
    const batch = briefs.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(b => runCreativeAgent(b, { ...options, maxSteps: options?.maxSteps || 8 })));
    results.push(...batchResults);
  }
  return results;
}

export function validateStopConditions(stepCount: number, maxSteps: number, currentCost: number, maxCostUSD: number, hasFinishCall: boolean): { shouldStop: boolean; reason: string } {
  if (stepCount >= maxSteps) return { shouldStop: true, reason: "stepCountIs" };
  if (currentCost >= maxCostUSD) return { shouldStop: true, reason: "maxCost" };
  if (hasFinishCall) return { shouldStop: true, reason: "hasToolCall(finish)" };
  return { shouldStop: false, reason: "continue" };
}

export interface CreativeAssetState { assetId: string; agent: string; status: "claimed" | "progress" | "done" | "returned"; ts: string; evidence: string[]; next?: string; }

export function createClaim(assetId: string, agent: string): CreativeAssetState { return { assetId, agent, status: "claimed", ts: new Date().toISOString(), evidence: [] }; }
export function markProgress(state: CreativeAssetState, evidence: string): CreativeAssetState { return { ...state, status: "progress", evidence: [...state.evidence, evidence], ts: new Date().toISOString() }; }
export function markDone(state: CreativeAssetState, evidence: string): CreativeAssetState { return { ...state, status: "done", evidence: [...state.evidence, evidence], ts: new Date().toISOString() }; }
export function markReturned(state: CreativeAssetState, evidence: string): CreativeAssetState { return { ...state, status: "returned", evidence: [...state.evidence, evidence], ts: new Date().toISOString() }; }
