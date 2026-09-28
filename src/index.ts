/**
 * Main Entry Point — Creative-Integrator Agent SDK
 * 
 * Usage:
 *   npx tsx src/index.ts "Create an ASCII art banner"
 *   npx tsx src/index.ts --surfaces
 *   npx tsx src/index.ts --audit
 *   npx tsx src/index.ts --batch "Brief 1" "Brief 2"
 */

import { runCreativeAgent, runCreativePipeline, batchGenerateCreatives } from './agent-loop.js';
import { generateAllFleetSurfaces, auditSurfaceCompliance } from './surfaces-generator.js';
import { dispatchEvent, CreativeEventType, getKernelStatus, dispatchHealthCheck, dispatchCreativeRequest } from './kernel-bridge.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case '--pipeline': {
      const research = args[1] || 'Research creative direction for RAEN fleet';
      const generation = args[2] || 'Generate creative assets';
      const review = args[3] || 'Review creative outputs';
      console.log('[Pipeline] Starting...');
      const results = await runCreativePipeline({ research, generation, review });
      console.log('[Pipeline] ✓ Complete:', Object.keys(results));
      break;
    }
    case '--surfaces': {
      console.log('[Surfaces] Generating x402 surfaces...');
      const allSurfaces = await generateAllFleetSurfaces();
      console.log('[Surfaces] ✓', Object.keys(allSurfaces).map(k => `${k}: ${allSurfaces[k].length} surfaces`).join(', '));
      break;
    }
    case '--audit': {
      console.log('[Audit] Checking compliance...');
      const results = await auditSurfaceCompliance([]);
      console.log('[Audit]', JSON.stringify(results, null, 2));
      break;
    }
    case '--batch': {
      const briefs = args.slice(1);
      if (briefs.length === 0) { console.error('Usage: --batch "brief1" "brief2"'); process.exit(1); }
      console.log(`[Batch] ${briefs.length} briefs...`);
      const results = await batchGenerateCreatives(briefs);
      console.log(`[Batch] ✓ ${results.length} assets generated`);
      break;
    }
    case '--kernel-dispatch': {
      const brief = args.slice(1).join(' ') || 'Create an ASCII art banner for the RAEN fleet';
      console.log(`[KernelDispatch] Dispatching creative request: "${brief}"`);
      await dispatchCreativeRequest(brief, `kd-${Date.now()}`, 'normal');
      const status = await getKernelStatus();
      console.log('[KernelDispatch] Kernel status:', JSON.stringify(status, null, 2));
      break;
    }
    case '--kernel-listen': {
      console.log('[KernelListen] Polling for creative events...');
      // Poll loop — checks for new work items addressed to tiffany-creative
      setInterval(async () => {
        try {
          const status = await getKernelStatus();
          console.log(`[KernelListen] Kernel: events=${status.events}, work_items=${status.work_items}, state=${JSON.stringify(status.by_state)}`);
        } catch (err) {
          console.error('[KernelListen] Poll failed:', err);
        }
      }, 30000);
      break;
    }
    case '--kernel-health': {
      console.log('[KernelHealth] Sending health check...');
      const result = await dispatchHealthCheck();
      console.log('[KernelHealth] ✓', JSON.stringify(result, null, 2));
      break;
    }
    default: {
      const brief = args.join(' ') || 'Create an ASCII art banner for the RAEN fleet';
      console.log(`[Agent] "${brief}"`);
      const result = await runCreativeAgent(brief, { maxSteps: 8, maxCostUSD: 0.50 });
      const text = await result.getText();
      console.log('[Agent] Result:', text.substring(0, 200));
    }
  }
}

main().catch(console.error);
