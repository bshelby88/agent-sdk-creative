/**
 * Kernel Event Handler
 * 
 * Processes incoming RAE-Kernel events for the creative agent.
 * Handles: new creative requests, status updates, payment confirmations.
 * 
 * Per RAEN A2A Charter:
 * - §3 A2A Dispatch Protocol: Agent responds to rae-kernel dispatch
 * - §2 Claim-Mark-Release: Hooks track creative asset ownership
 * - §6 AIP v1: tool.agent() subagents for discover-claim-verify-handoff
 */

import { kernelFetch, KernelEvent, KernelWorkItem, CreativeEventType } from './kernel-bridge.js';

// ─── Event Handler Registry ─────────────────────────────────────────

type EventHandler = (event: KernelEvent) => Promise<any>;

const handlers: Map<string, EventHandler> = new Map();

/**
 * Register a handler for a specific event type.
 */
export function onEvent(type: string, handler: EventHandler): void {
  handlers.set(type, handler);
}

/**
 * Register all creative agent event handlers.
 */
export function registerCreativeHandlers(): void {
  // Handle new creative requests
  onEvent(CreativeEventType.CREATIVE_REQUEST, async (event) => {
    const { request_id, brief, priority } = event.payload;
    console.log(`[CreativeHandler] New request ${request_id}: "${brief}" (priority: ${priority})`);
    // Process the creative brief through the agent loop
    return { handled: true, request_id, action: 'accepted' };
  });

  // Handle status update requests
  onEvent(CreativeEventType.CREATIVE_STATUS_UPDATE, async (event) => {
    const { request_id, status, message } = event.payload;
    console.log(`[CreativeHandler] Status update for ${request_id}: ${status} — ${message}`);
    return { handled: true, request_id, status };
  });

  // Handle payment confirmations
  onEvent(CreativeEventType.CREATIVE_PAYMENT_CONFIRMED, async (event) => {
    const { request_id, amount, tx_hash } = event.payload;
    console.log(`[CreativeHandler] Payment confirmed for ${request_id}: ${amount} USDC, tx: ${tx_hash}`);
    // Trigger asset delivery
    return { handled: true, request_id, action: 'deliver_asset' };
  });

  // Handle completion acknowledgments
  onEvent(CreativeEventType.CREATIVE_COMPLETED, async (event) => {
    const { request_id, asset_ref } = event.payload;
    console.log(`[CreativeHandler] Asset delivered for ${request_id}: ${asset_ref}`);
    return { handled: true, request_id, action: 'acknowledged' };
  });
}

/**
 * Process all pending events for this agent.
 * Polls the kernel and dispatches to registered handlers.
 */
export async function processPendingEvents(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const workItems = await kernelFetch('/v1/work');
    const items = Array.isArray(workItems) ? workItems : [workItems];

    for (const item of items) {
      if (item.recipient === 'tiffany-creative' || item.recipient === 'tiffany') {
        const eventType = item.task_type || CreativeEventType.CREATIVE_REQUEST;
        const handler = handlers.get(eventType);
        if (handler) {
          try {
            await handler({
              type: eventType,
              deduplication_key: item.id,
              source: item.requester,
              tenant_id: 'tiffany',
              payload: item,
            });
            processed++;
          } catch (err) {
            errors++;
            console.error(`[EventProcessor] Error handling ${eventType}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('[EventProcessor] Failed to poll events:', err);
    errors++;
  }

  return { processed, errors };
}

/**
 * Create a work item on the kernel via the claim-mark-release pattern.
 */
export async function createWorkItem(
  taskType: string,
  brief: string,
  requester: string = 'tiffany-creative'
): Promise<any> {
  const payload = {
    agent: requester,
    task: taskType,
    brief,
    status: 'requested',
    timestamp: new Date().toISOString(),
  };

  // Use the kernel's event system to create a work item
  return kernelFetch('/v1/events', {
    type: 'work-request',
    deduplication_key: `wr-${taskType}-${Date.now()}`,
    source: requester,
    tenant_id: 'tiffany',
    payload,
  });
}
