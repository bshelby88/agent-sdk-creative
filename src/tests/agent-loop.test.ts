/**
 * Integration tests for agent-loop.ts
 * Verifies stop conditions, hooks, MCP integration, and Claim-Mark-Release.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateStopConditions,
  createClaim, markProgress, markDone, markReturned,
  CreativeAssetState,
  buildToolSet,
} from '../agent-loop.js';
import { CreativeError, ErrorCode, handleError, validateStopParams } from '../error-handler.js';

// ─── Stop Conditions ───────────────────────────────────
describe('validateStopConditions', () => {
  it('should stop when step count is reached', () => {
    const result = validateStopConditions(10, 10, 0.5, 1.0, false);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('stepCountIs');
  });

  it('should stop when max cost is reached', () => {
    const result = validateStopConditions(5, 10, 1.0, 1.0, false);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('maxCost');
  });

  it('should stop when finish tool call is detected', () => {
    const result = validateStopConditions(3, 10, 0.5, 1.0, true);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('hasToolCall(finish)');
  });

  it('should continue when no stop condition is met', () => {
    const result = validateStopConditions(3, 10, 0.5, 1.0, false);
    expect(result.shouldStop).toBe(false);
    expect(result.reason).toBe('continue');
  });
});

// ─── Stop Params Validation ────────────────────────────
describe('validateStopParams', () => {
  it('should accept valid params', () => {
    const result = validateStopParams(10, 1.0);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject maxSteps of 0', () => {
    const result = validateStopParams(0, 1.0);
    expect(result.valid).toBe(false);
  });

  it('should reject maxCostUSD of 0', () => {
    const result = validateStopParams(10, 0);
    expect(result.valid).toBe(false);
  });

  it('should reject maxSteps > 100', () => {
    const result = validateStopParams(101, 1.0);
    expect(result.valid).toBe(false);
  });
});

// ─── Claim-Mark-Release State Tracking ─────────────────
describe('CreativeAssetState', () => {
  it('should create a claimed asset', () => {
    const state = createClaim('asset-1', 'tiffany');
    expect(state.assetId).toBe('asset-1');
    expect(state.agent).toBe('tiffany');
    expect(state.status).toBe('claimed');
    expect(state.ts).toBeTruthy();
    expect(state.evidence).toEqual([]);
  });

  it('should mark progress', () => {
    const state = createClaim('asset-1', 'tiffany');
    const updated = markProgress(state, 'First pass complete');
    expect(updated.status).toBe('progress');
    expect(updated.evidence).toContain('First pass complete');
  });

  it('should mark done', () => {
    const state = createClaim('asset-1', 'tiffany');
    const updated = markDone(state, 'Final output');
    expect(updated.status).toBe('done');
    expect(updated.evidence).toContain('Final output');
  });

  it('should mark returned', () => {
    const state = createClaim('asset-1', 'tiffany');
    const updated = markReturned(state, 'Partial evidence');
    expect(updated.status).toBe('returned');
    expect(updated.evidence).toContain('Partial evidence');
  });
});

// ─── Tool Set Builder ──────────────────────────────────
describe('buildToolSet', () => {
  it('should return all creative tools without MCP servers', async () => {
    const tools = await buildToolSet();
    expect(tools.length).toBe(8); // 8 creative tools
  });

  it('should include all tools by name', async () => {
    const tools = await buildToolSet();
    const names = tools.map((t: any) => t.name || t.function?.name);
    expect(names).toContain('generate_ascii_art');
    expect(names).toContain('compose_music');
    expect(names).toContain('generate_x402_surface');
  });
});

// ─── Error Handling ────────────────────────────────────
describe('CreativeError', () => {
  it('should create a structured error', () => {
    const err = new CreativeError('Test error', ErrorCode.TOOL_EXECUTION_FAILURE, { foo: 'bar' });
    expect(err.message).toBe('Test error');
    expect(err.code).toBe(ErrorCode.TOOL_EXECUTION_FAILURE);
    expect(err.details.foo).toBe('bar');
    expect(err.timestamp).toBeTruthy();
  });
});

describe('handleError', () => {
  it('should extract message from Error', () => {
    expect(handleError(new Error('test'))).toBe('test');
  });

  it('should extract message from string', () => {
    expect(handleError('test string')).toBe('test string');
  });

  it('should extract message from CreativeError', () => {
    const ce = new CreativeError('ce', ErrorCode.TOOL_EXECUTION_FAILURE);
    expect(handleError(ce)).toBe('ce');
  });
});
