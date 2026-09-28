/**
 * HTTP Server — @tiffany/agent-sdk-creative
 * Exposes x402-compliant endpoints for the RAEN fleet.
 *
 * Endpoints:
 *   GET  /health          — health check
 *   GET  /.well-known/x402.json  — x402 manifest
 *   GET  /pricing.md      — pricing surface
 *   GET  /llms.txt        — LLM discovery surface
 *   GET  /sample          — sample response
 *   POST /api/generate    — generate creative asset ($0.10 USDC)
 *   POST /api/batch       — batch generate ($0.50 USDC)
 *   GET  /api/preview     — preview creative ($0.01 USDC)
 *   GET  /api/surfaces    — list x402 surfaces
 */

import express from 'express';
import { x402Core } from '@x402/core/server';
import { runCreativeAgent, runCreativePipeline, batchGenerateCreatives } from './agent-loop.js';
import { generateAllFleetSurfaces, auditSurfaceCompliance } from './surfaces-generator.js';

const app = express();
app.use(express.json());
app.use(express.text({ type: '*/*' }));

// ─── x402 Configuration ────────────────────────────────
const TREASURY_PAYTO = process.env.TREASURY_PAYTO || '0x7861db4efc14a1ed5dd8c96c528a3796560f1393';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402-agent-pay.com/facilitator';
const NETWORK = process.env.NETWORK || 'eip155:8453';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SERVICE_NAME = 'tiffany-creative';
const BASE_URL = process.env.BASE_URL || 'https://tiffany-creative.fly.dev';
const PRICE_PER_ASSET = '0.10';
const BATCH_PRICE = '0.50';
const PREVIEW_PRICE = '0.01';

// Initialize x402 middleware — FACILITATOR_URL MUST be set before init
// See: facilitator-bypass.md (hardcoded CDP endpoint bug)
const x402 = x402Core({
  network: NETWORK,
  usdcContract: USDC_ADDRESS,
  facilitatorUrl: FACILITATOR_URL,
  payTo: TREASURY_PAYTO,
});

// ─── Health Check ──────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    status: 'operational',
    timestamp: new Date().toISOString(),
    tool: SERVICE_NAME,
    price: { usdc: 1000, network: NETWORK, payTo: TREASURY_PAYTO },
    version: '1.0.0',
    x402Version: 2,
  });
});

// ─── x402 Surfaces ─────────────────────────────────────

// GET /.well-known/x402.json — x402 manifest
app.get('/.well-known/x402.json', (req, res) => {
  const manifest = {
    serviceName: SERVICE_NAME,
    serviceDescription: 'Creative-integrator service for the RAEN fleet — ASCII art, SVG diagrams, HTML landings, music, design tokens, sketch mockups',
    baseUrl: BASE_URL,
    network: NETWORK,
    price: PRICE_PER_ASSET,
    asset: 'USDC',
    payTo: TREASURY_PAYTO,
    facilitator: FACILITATOR_URL,
    x402Version: 2,
    endpoints: [
      { url: `${BASE_URL}/api/generate`, method: 'POST', network: NETWORK, asset: 'USDC', price: PRICE_PER_ASSET, payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 600, description: 'Generate a creative asset' },
      { url: `${BASE_URL}/api/batch`, method: 'POST', network: NETWORK, asset: 'USDC', price: BATCH_PRICE, payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 900, description: 'Batch generate multiple creative assets' },
      { url: `${BASE_URL}/api/preview`, method: 'GET', network: NETWORK, asset: 'USDC', price: PREVIEW_PRICE, payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 60, description: 'Preview a creative asset' },
      { url: `${BASE_URL}/api/surfaces`, method: 'GET', network: NETWORK, asset: 'USDC', price: '0.00', payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 30, description: 'List all x402 surfaces' },
    ],
    '$schema': 'https://x402.org/schemas/x402.json',
  };
  res.json(manifest);
});

// GET /pricing.md
app.get('/pricing.md', (_req, res) => {
  const content = `# Pricing — ${SERVICE_NAME}

| Endpoint | Price | Network |
|----------|-------|---------|
| \`/api/generate\` | \$${PRICE_PER_ASSET} | ${NETWORK} |
| \`/api/batch\` | \$${BATCH_PRICE} | ${NETWORK} |
| \`/api/preview\` | \$${PREVIEW_PRICE} | ${NETWORK} |
| \`/api/surfaces\` | FREE | ${NETWORK} |

## Payment Details
- **Asset**: USDC
- **Network**: ${NETWORK} (Base)
- **Facilitator**: ${FACILITATOR_URL}
- **Treasury**: \`${TREASURY_PAYTO}\`
- **x402 Version**: 2

## RAEN Charter Compliance
Per RAEN-A2A-CHARTER.md §5.3: All surfaces machine-readable and x402-compliant.
`;
  res.type('text/markdown').send(content);
});

// GET /llms.txt
app.get('/llms.txt', (_req, res) => {
  const content = `# ${SERVICE_NAME}

Creative-integrator service for the RAEN fleet — ASCII art, SVG diagrams, HTML landings, music composition, design tokens, sketch mockups.

## Endpoints
- POST /api/generate — Generate a creative asset
- POST /api/batch — Batch generate multiple creative assets
- GET /api/preview — Preview a creative asset
- GET /api/surfaces — List all x402 surfaces

## Pricing
- /api/generate: $${PRICE_PER_ASSET} USDC per asset
- /api/batch: $${BATCH_PRICE} USDC for batch
- /api/preview: $${PREVIEW_PRICE} USDC per preview
- /api/surfaces: FREE

## Payment
- Network: ${NETWORK} (Base)
- Token: USDC
- Facilitator: ${FACILITATOR_URL}
- Treasury: ${TREASURY_PAYTO}
- x402 Version: 2
`;
  res.type('text/plain').send(content);
});

// GET /sample
app.get('/sample', (_req, res) => {
  res.json({
    service: SERVICE_NAME, status: 'ready', network: NETWORK, price: PRICE_PER_ASSET,
    message: 'Send a POST request with x402 payment to call this endpoint',
    endpoints: ['/api/generate', '/api/batch', '/api/preview', '/api/surfaces'],
    facilitator: FACILITATOR_URL, payTo: TREASURY_PAYTO, x402Version: 2,
  });
});

// GET /api/surfaces — list all x402 surfaces
app.get('/api/surfaces', (_req, res) => {
  res.json({
    service: SERVICE_NAME,
    surfaces: [
      { path: '/.well-known/x402.json', method: 'GET', price: '0.00', description: 'x402 manifest' },
      { path: '/pricing.md', method: 'GET', price: '0.00', description: 'Pricing surface' },
      { path: '/llms.txt', method: 'GET', price: '0.00', description: 'LLM discovery surface' },
      { path: '/sample', method: 'GET', price: '0.00', description: 'Sample response' },
      { path: '/api/generate', method: 'POST', price: PRICE_PER_ASSET, description: 'Generate creative asset' },
      { path: '/api/batch', method: 'POST', price: BATCH_PRICE, description: 'Batch generate' },
      { path: '/api/preview', method: 'GET', price: PREVIEW_PRICE, description: 'Preview creative' },
    ],
    treasury: TREASURY_PAYTO, network: NETWORK,
  });
});

// ─── x402 Protected Endpoints ──────────────────────────

// POST /api/generate — generate creative asset ($0.10 USDC)
app.post('/api/generate', x402.middleware(), async (req, res) => {
  try {
    const { brief, maxSteps, maxCostUSD } = req.body || {};
    const result = await runCreativeAgent(brief || 'Create a creative asset for the RAEN fleet', {
      maxSteps: maxSteps || 8, maxCostUSD: maxCostUSD || 0.50,
    });
    const text = await result.getText();
    res.json({ success: true, service: SERVICE_NAME, result: text.substring(0, 2000), network: NETWORK, payment: { asset: 'USDC', amount: PRICE_PER_ASSET }, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// POST /api/batch — batch generate ($0.50 USDC)
app.post('/api/batch', x402.middleware(), async (req, res) => {
  try {
    const { briefs, parallel } = req.body || {};
    if (!briefs || !Array.isArray(briefs) || briefs.length === 0) return res.status(400).json({ error: 'briefs array required' });
    const results = await batchGenerateCreatives(briefs, { parallel: parallel || 3 });
    res.json({ success: true, service: SERVICE_NAME, count: results.length, network: NETWORK, payment: { asset: 'USDC', amount: BATCH_PRICE }, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// GET /api/preview — preview creative ($0.01 USDC)
app.get('/api/preview', x402.middleware(), async (req, res) => {
  try {
    const { brief } = req.query || {};
    const result = await runCreativeAgent(brief || 'Preview creative asset', { maxSteps: 3, maxCostUSD: 0.10 });
    const text = await result.getText();
    res.json({ success: true, service: SERVICE_NAME, preview: text.substring(0, 1000), network: NETWORK, payment: { asset: 'USDC', amount: PREVIEW_PRICE }, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// POST /api/pipeline
app.post('/api/pipeline', x402.middleware(), async (req, res) => {
  try {
    const { research, generation, review } = req.body || {};
    const result = await runCreativePipeline({ research: research || 'Research creative direction for RAEN fleet', generation: generation || 'Generate creative assets', review: review || 'Review creative outputs' });
    res.json({ success: true, service: SERVICE_NAME, pipeline: Object.keys(result), network: NETWORK, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ─── 404 handler ───────────────────────────────────────
app.use((_req, res) => { res.status(404).json({ error: 'Not found', service: SERVICE_NAME }); });

// ─── Start Server ──────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.FLY_MACHINE_IP || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`[tiffany-creative] Server running on ${HOST}:${PORT}`);
  console.log(`[tiffany-creative] Service: ${SERVICE_NAME}`);
  console.log(`[tiffany-creative] Network: ${NETWORK}`);
  console.log(`[tiffany-creative] Treasury: ${TREASURY_PAYTO}`);
  console.log(`[tiffany-creative] Facilitator: ${FACILITATOR_URL}`);
  console.log(`[tiffany-creative] x402 Version: 2`);
  console.log(`[tiffany-creative] Health: http://${HOST}:${PORT}/health`);
});
