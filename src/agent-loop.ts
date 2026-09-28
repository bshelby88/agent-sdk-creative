/**
 * Agent Loop Configuration
 * Main callModel agent loop for creative-integrator work.
 * Implements RAEN A2A Charter compliance with stopWhen conditions,
 * lifecycle hooks, MCP tool integration, and async tool patterns.
 */

import { callModel, stepCountIs, maxCost, hasToolCall, HooksManager } from "@openrouter/agent";
import { createMCPTools } from "@openrouter/agent/mcp";
import { creativeTools } from "./creative-tools.js";
import { CreativeError, handleError, validateStopParams } from "./error-handler.js";
import { cdpSettlementTool } from "./cdp-settlement.js";
import { dispatchCreativeRequest, dispatchCreativeStatus, dispatchCreativeCompleted, dispatchPaymentConfirmed, getKernelStatus, dispatchHealthCheck } from "./kernel-bridge.js";

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const API_KEY = process.env.OPENROUTER_API_KEY || "";

if (!API_KEY) {
  console.warn("[AgentLoop] OPENROUTER_API_KEY not set.");
}

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

export async function buildToolSet(options?: { mcpServers?: Array<{ url: string; name: string }> }): Promise<any[]> {
  let tools: any[] = [...creativeTools, cdpSettlementTool];
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
  const requestId = `creative-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const validation = validateStopParams(maxSteps, maxCostUSD);
  if (!validation.valid) {
    throw new CreativeError(`Invalid stop parameters: ${validation.errors.join(", ")}`, "INVALID_CONFIG", { errors: validation.errors });
  }

  // Dispatch creative.request to RAE-Kernel for A2A coordination
  await dispatchCreativeRequest(brief, requestId, options?.maxCostUSD ? (options.maxCostUSD > 0.5 ? 'high' : 'normal') : 'normal');

  const tools = await buildToolSet(options);
  const stopConditions = [stepCountIs(maxSteps), maxCost(maxCostUSD), hasToolCall("finish")];

  try {
    await dispatchCreativeStatus(requestId, 'running', 'Processing creative brief through OpenRouter agent loop');

    const result = await callModel({
      model, input: brief,
      instructions: `You are Tiffany, Creative-Integrator for the RAEN fleet. Create creative assets. Every output must be machine-readable and x402-compliant.`,
      tools, hooks: creativeHooks, stopWhen: stopConditions, allowFinalResponse: true,
    });

    await dispatchCreativeStatus(requestId, 'completed', 'Creative generation complete');
    await dispatchCreativeCompleted(requestId, `asset-${requestId}`, `dist/creative-${requestId}`);
    return result;
  } catch (err) {
    await dispatchCreativeStatus(requestId, 'failed', String(err));
    throw new CreativeError(`callModel failed: ${handleError(err)}`, "CALL_MODEL_FAILURE", { model, brief });
  }
}

export async function runCreativePipeline(pipeline: { research: string; generation: string; review: string; }): Promise<{ research: any; generation: any; review: any }> {
  const researchResult = await callModel({ model: MODEL, input: pipeline.research, tools: [...creativeTools, cdpSettlementTool], stopWhen: [stepCountIs(5), maxCost(0.25)] });
  const generationResult = await callModel({ model: MODEL, input: `${pipeline.generation}\n\nContext: ${await researchResult.getText() || ""}`, tools: [...creativeTools, cdpSettlementTool], stopWhen: [stepCountIs(10), maxCost(0.50)] });
  const reviewResult = await callModel({ model: MODEL, input: pipeline.review, tools: [...creativeTools, cdpSettlementTool], stopWhen: [stepCountIs(3), maxCost(0.25)] });
  return { research: researchResult, generation: generationResult, review: reviewResult };
}

export async function batchGenerateCreatives(briefs: string[], options?: { parallel?: number; model?: string }): Promise<any[]> {
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
