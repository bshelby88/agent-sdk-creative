/**
 * Error handling and edge case coverage for the creative agent pipeline.
 * 
 * RAEN A2A Charter Alignment:
 * - §2 Claim-Mark-Release: Errors must not silently drop claimed assets
 * - §5 Reaper: Errors must include evidence for recovery
 */

export enum ErrorCode {
  // Agent loop errors
  CALL_MODEL_FAILURE = 'CALL_MODEL_FAILURE',
  HOOK_EXECUTION_FAILURE = 'HOOK_EXECUTION_FAILURE',
  MCP_CONNECTION_FAILURE = 'MCP_CONNECTION_FAILURE',
  STOP_CONDITION_ERROR = 'STOP_CONDITION_ERROR',

  // Tool errors
  TOOL_EXECUTION_FAILURE = 'TOOL_EXECUTION_FAILURE',
  TOOL_SCHEMA_VALIDATION = 'TOOL_SCHEMA_VALIDATION',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',

  // Surface errors
  SURFACE_GENERATION_FAILURE = 'SURFACE_GENERATION_FAILURE',
  SURFACE_MISSING = 'SURFACE_MISSING',
  SURFACE_NON_COMPLIANT = 'SURFACE_NON_COMPLIANT',

  // Asset errors
  ASSET_CLAIM_CONFLICT = 'ASSET_CLAIM_CONFLICT',
  ASSET_STALE = 'ASSET_STALE',
  ASSET_SILENT_EXPIRY = 'ASSET_SILENT_EXPIRY',

  // Config errors
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_CONFIG = 'INVALID_CONFIG',
}

export class CreativeError extends Error {
  public readonly code: ErrorCode;
  public readonly details: Record<string, any>;
  public readonly timestamp: string;

  constructor(message: string, code: ErrorCode, details: Record<string, any> = {}) {
    super(message);
    this.name = 'CreativeError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Safely handle errors from async operations with context.
 */
export function handleError(err?: any): string {
  if (!err) return "";
  if (err instanceof CreativeError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * Wrap an async operation with error handling and evidence capture.
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context: Record<string, any> = {}
): Promise<{ success: true; result: T } | { success: false; error: CreativeError }> {
  try {
    const result = await fn();
    return { success: true, result };
  } catch (err) {
    const creativeErr = new CreativeError(
      `${operation} failed: ${handleError(err)}`,
      ErrorCode.TOOL_EXECUTION_FAILURE,
      { operation, ...context, originalError: handleError(err) }
    );
    return { success: false, error: creativeErr };
  }
}

/**
 * Validate that an asset claim is not stale (RAEN §5 Reaper — 2h expiry).
 */
export function isClaimStale(claimedAt: string, maxAgeMs: number = 2 * 60 * 60 * 1000): boolean {
  const claimedTime = new Date(claimedAt).getTime();
  return Date.now() - claimedTime > maxAgeMs;
}

/**
 * Ensure a claimed asset is never silently expired — return partial evidence.
 */
export function handleSilentExpiry(state: { assetId: string; agent: string; status: string; ts: string; evidence: string[] }): CreativeError {
  return new CreativeError(
    `Asset ${state.assetId} claimed by ${state.agent} has stalled. Returning partial evidence.`,
    ErrorCode.ASSET_SILENT_EXPIRY,
    { assetId: state.assetId, agent: state.agent, ts: state.ts, evidence: state.evidence }
  );
}

/**
 * Validate x402 surface compliance (RAEN Charter §5.3).
 */
export interface SurfaceComplianceResult {
  service: string;
  status: 'COMPLIANT' | 'NON-COMPLIANT';
  missing: string[];
  errors: string[];
}

export function validateSurfaceCompliance(
  service: string,
  surfaces: Record<string, string | null>
): SurfaceComplianceResult {
  const required = ['/.well-known/x402.json', '/pricing.md', '/llms.txt', '/sample'];
  const missing: string[] = [];
  const errors: string[] = [];

  for (const surface of required) {
    const content = surfaces[surface];
    if (!content || content.trim() === '') {
      missing.push(surface);
      continue;
    }
    // Validate JSON structure for x402.json
    if (surface === '/.well-known/x402.json') {
      try {
        const parsed = JSON.parse(content);
        if (!parsed.x402Version || !parsed.payTo || !parsed.endpoints) {
          errors.push(`${surface}: missing required fields (x402Version, payTo, endpoints)`);
        }
      } catch {
        errors.push(`${surface}: invalid JSON`);
      }
    }
  }

  return {
    service,
    status: missing.length === 0 && errors.length === 0 ? 'COMPLIANT' : 'NON-COMPLIANT',
    missing,
    errors,
  };
}

/**
 * Validate stop condition parameters are within bounds.
 */
export function validateStopParams(maxSteps: number, maxCostUSD: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) {
    errors.push(`maxSteps must be integer 1-100, got ${maxSteps}`);
  }
  if (typeof maxCostUSD !== 'number' || maxCostUSD <= 0 || maxCostUSD > 100) {
    errors.push(`maxCostUSD must be number 0-100, got ${maxCostUSD}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Create a safety wrapper that catches unhandled errors and returns a fallback.
 */
export function safetyWrap<T>(fn: () => T | Promise<T>, fallback: T, label: string): T | CreativeError {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.catch((err: any) => {
        console.error(`[SafetyWrap] ${label} failed:`, err);
        return fallback;
      }) as T | CreativeError;
    }
    return result;
  } catch (err: any) {
    console.error(`[SafetyWrap] ${label} failed:`, err);
    return fallback;
  }
}
