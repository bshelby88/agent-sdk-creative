/**
 * RAE-Kernel Event Bridge
 * 
 * Connects the creative-integrator agent to the RAE-Kernel event dispatch system.
 * Uses POST /v1/events for event ingestion and GET /v1/status + /v1/work for state reads.
 * 
 * Per RAEN AIP v1: events are the canonical dispatch mechanism for non-roster agents.
 * The creative agent is NOT in the kernel roster (only staci/bean/franklin, all paused),
 * so we use file-based event demand via /v1/events directly.
 * 
 * API Key: 63d86692649b48deb7161f4898b6ab3bfc30485a15f547aa87b927777c95d3dd
 * Kernel: https://rae-kernel.fly.dev
 */

const KERNEL_BASE = 'https://rae-kernel.fly.dev';
const API_KEY = '63d86692649b48deb7161f4898b6ab3bfc30485a15f547aa87b927777c95d3dd';
const AGENT_ID = 'tiffany-creative';
const TENANT_ID = 'tiffany';

// ─── Event Types (per RAEN AIP v1) ──────────────────────────────────

export enum CreativeEventType {
  CREATIVE_REQUEST = 'creative.request',
  CREATIVE_STATUS_UPDATE = 'creative.status.update',
  CREATIVE_PAYMENT_CONFIRMED = 'creative.payment.confirmed',
  CREATIVE_COMPLETED = 'creative.completed',
  CREATIVE_QUEUED = 'creative.queued',
  CREATIVE_FAILED = 'creative.failed',
  KERNEL_HEALTH_CHECK = 'kernel.health.check',
}

export interface KernelEvent {
  type: string;
  deduplication_key: string;
  source: string;
  tenant_id: string;
  payload: Record<string, any>;
}

export interface KernelEventResponse {
  created: boolean;
  event_id?: string;
  event?: any;
}

export interface KernelWorkItem {
  id: string;
  ts: string;
  requester: string;
  recipient: string;
  task_type: string;
  priority: string;
  status: 'requested' | 'claimed' | 'running' | 'done' | 'blocked';
  payload_sha256?: string;
  result_ref?: string;
  blocked_reason?: string;
}

export interface KernelStatus {
  status: string;
  database: string;
  events: number;
  work_items: number;
  by_state: Record<string, number>;
}

// ─── HTTP Helper ────────────────────────────────────────────────────

async function kernelFetch(path: string, body?: any): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };

  const opts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  const resp = await fetch(`${KERNEL_BASE}${path}`, opts);
  const text = await resp.text();

  if (resp.status === 405) {
    throw new Error('GET /v1/events not allowed — use GET /v1/status + GET /v1/work');
  }
  if (resp.status === 401) {
    throw new Error('Authentication failed — check X-API-Key');
  }
  if (resp.status === 422) {
    throw new Error(`Schema validation error: ${text}`);
  }
  if (!resp.ok) {
    throw new Error(`Kernel API ${resp.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── Event Dispatch ─────────────────────────────────────────────────

/**
 * POST an event to the kernel's /v1/events endpoint.
 * Requires type, deduplication_key, source, tenant_id, payload.
 * Per skill pitfall: POST without deduplication_key → 422.
 * Use date-stable dedupe keys for same-day re-runs (returns created:false, that's normal).
 */
export async function dispatchEvent(
  type: string,
  deduplication_key: string,
  payload: Record<string, any>,
  source: string = AGENT_ID,
  tenant_id: string = TENANT_ID
): Promise<KernelEventResponse> {
  const eventBody: KernelEvent = {
    type,
    deduplication_key,
    source,
    tenant_id,
    payload,
  };

  const result = await kernelFetch('/v1/events', eventBody);
  return result as KernelEventResponse;
}

// ─── State Reads ────────────────────────────────────────────────────

/**
 * Get kernel status via GET /v1/status (includes agentkit block).
 * Read-only safe — no events mutated.
 */
export async function getKernelStatus(): Promise<KernelStatus> {
  const result = await kernelFetch('/v1/status');
  return result as KernelStatus;
}

/**
 * Get work items via GET /v1/work.
 */
export async function getWorkItems(): Promise<any[]> {
  const result = await kernelFetch('/v1/work');
  return Array.isArray(result) ? result : [result];
}

/**
 * Get a specific work item by ID via GET /v1/work/{id}.
 */
export async function getWorkItem(id: string): Promise<any> {
  return kernelFetch(`/v1/work/${id}`);
}

/**
 * Execute a work item via POST /v1/work/{id}/execute.
 */
export async function executeWorkItem(id: string, payload?: Record<string, any>): Promise<any> {
  return kernelFetch(`/v1/work/${id}/execute`, payload || {});
}

// ─── Creative-Specific Dispatch Helpers ─────────────────────────────

/**
 * Dispatch a new creative request event to the kernel.
 * Called when the creative agent receives a brief/task.
 */
export async function dispatchCreativeRequest(
  brief: string,
  requestId: string,
  priority: string = 'normal'
): Promise<KernelEventResponse> {
  const dedupKey = `creative-request-${requestId}`;
  return dispatchEvent(
    CreativeEventType.CREATIVE_REQUEST,
    dedupKey,
    {
      request_id: requestId,
      brief,
      priority,
      agent: AGENT_ID,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Dispatch a creative status update event.
 * Called when a creative job changes state (running, review, etc.).
 */
export async function dispatchCreativeStatus(
  requestId: string,
  status: string,
  message: string = ''
): Promise<KernelEventResponse> {
  const dedupKey = `creative-status-${requestId}-${Date.now()}`;
  return dispatchEvent(
    CreativeEventType.CREATIVE_STATUS_UPDATE,
    dedupKey,
    {
      request_id: requestId,
      status,
      message,
      agent: AGENT_ID,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Dispatch a payment confirmation event.
 * Called when x402 payment is confirmed for a creative asset.
 */
export async function dispatchPaymentConfirmed(
  requestId: string,
  amount: string,
  txHash: string = ''
): Promise<KernelEventResponse> {
  const dedupKey = `creative-payment-${requestId}`;
  return dispatchEvent(
    CreativeEventType.CREATIVE_PAYMENT_CONFIRMED,
    dedupKey,
    {
      request_id: requestId,
      amount,
      tx_hash: txHash,
      agent: AGENT_ID,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Dispatch creative completion event.
 * Called when a creative asset is delivered.
 */
export async function dispatchCreativeCompleted(
  requestId: string,
  assetRef: string,
  outputPath: string = ''
): Promise<KernelEventResponse> {
  const dedupKey = `creative-complete-${requestId}`;
  return dispatchEvent(
    CreativeEventType.CREATIVE_COMPLETED,
    dedupKey,
    {
      request_id: requestId,
      asset_ref: assetRef,
      output_path: outputPath,
      agent: AGENT_ID,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Dispatch a kernel health check event.
 * Used for proactive monitoring and keeping the kernel event stream active.
 */
export async function dispatchHealthCheck(): Promise<KernelEventResponse> {
  const dedupKey = `kernel-health-${new Date().toISOString().slice(0, 10)}`;
  return dispatchEvent(
    CreativeEventType.KERNEL_HEALTH_CHECK,
    dedupKey,
    {
      agent: AGENT_ID,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }
  );
}

// ─── Event Listener Stub ────────────────────────────────────────────
/**
 * Poll the kernel for new events/work items addressed to this agent.
 * In production, replace polling with webhook registration at
 * /v1/webhooks/stripe or a persistent event stream.
 */
export async function pollForEvents(): Promise<any[]> {
  try {
    const workItems = await getWorkItems();
    return workItems.filter((wi: any) => 
      wi.recipient === AGENT_ID || wi.recipient === 'tiffany'
    );
  } catch {
    return [];
  }
}
