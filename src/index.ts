/**
 * Main Entry Point — Creative-Integrator Agent SDK
 *
 * Usage:
 *   npx tsx src/index.ts "Create an ASCII art banner"
 *   npx tsx src/index.ts --surfaces
 *   npx tsx src/index.ts --audit
 *   npx tsx src/index.ts --batch "Brief 1" "Brief 2"
 *   npx tsx src/index.ts --demo
 */

import { runCreativeAgent, runCreativePipeline, batchGenerateCreatives } from './agent-loop.js';
import { generateAllFleetSurfaces, auditSurfaceCompliance } from './surfaces-generator.js';

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
    case '--demo': {
      console.log('[Demo] Launching full creative pipeline demo...');
      const result = await import('./demo.js');
      await result.demo();
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
