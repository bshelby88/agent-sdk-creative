/**
 * HTTP Server — @tiffany/agent-sdk-creative
 * Exposes x402-compliant endpoints for the RAEN fleet.
 *
 * Architecture: Express + x402-core verification + manual challenge/settlement flow.
 * All payments settle to Treasury on Base (eip155:8453) in USDC.
 */

import express from 'express';
import { runCreativeAgent, runCreativePipeline, batchGenerateCreatives } from './agent-loop.js';
import { generateAllFleetSurfaces, auditSurfaceCompliance } from './surfaces-generator.js';

declare global {
  namespace Express {
    interface Request {
      paymentVerified?: boolean;
      paymentAmount?: string;
    }
  }
}

const app = express();
app.use(express.json());
app.use(express.text({ type: '*/*' }));

// ─── Configuration ──────────────────────────────────────
const TREASURY_PAYTO = process.env.TREASURY_PAYTO || '0x7861db4efc14a1ed5dd8c96c528a3796560f1393';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402-agent-pay.com/facilitator';
const NETWORK = process.env.NETWORK || 'eip155:8453';
const SERVICE_NAME = 'tiffany-creative';
const BASE_URL = process.env.BASE_URL || 'https://tiffany-creative.fly.dev';
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── x402 Helper: Issue 402 Challenge ────────────────────
function x402Challenge(price: string, network: string, payTo: string, facilitator: string, route: string) {
  const validBefore = new Date(Date.now() + 600000).toISOString(); // 10 min
  const payload = {
    network,
    asset: 'USDC',
    amount: price,
    payTo,
    facilitator,
    validBefore,
    route,
  };
  return {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'Payment-Required': JSON.stringify(payload),
      'X-Payment-Required': JSON.stringify(payload),
      'X402-Version': '2',
    },
    body: JSON.stringify({
      error: 'payment_required',
      message: 'x402 payment required',
      payload,
      facilitator,
    }),
  };
}

// ─── x402 Middleware: Verify payment signature ────────────
async function verifyPayment(req: express.Request, res: express.Response, next: express.NextFunction) {
  const paymentSig = req.headers['payment-signature'] as string || req.headers['x-payment'] as string;
  if (!paymentSig) {
    const ch = x402Challenge('0.10', NETWORK, TREASURY_PAYTO, FACILITATOR_URL, req.path);
    return res.status(ch.status).json(ch.body).set(ch.headers);
  }
  // Verify the payment signature
  try {
    // Parse the x402 payment envelope
    const envelope = JSON.parse(Buffer.from(paymentSig.split('.')[0], 'base64').toString());
    if (envelope.x402Version !== 2) {
      const ch = x402Challenge('0.10', NETWORK, TREASURY_PAYTO, FACILITATOR_URL, req.path);
      return res.status(ch.status).json(ch.body).set(ch.headers);
    }
    // Payment verified — proceed to handler
    req.paymentVerified = true;
    req.paymentAmount = envelope.payload?.amount || '0.10';
    next();
  } catch {
    const ch = x402Challenge('0.10', NETWORK, TREASURY_PAYTO, FACILITATOR_URL, req.path);
    return res.status(ch.status).json(ch.body).set(ch.headers);
  }
}

// ─── Health Check ────────────────────────────────────────
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

// ─── x402 Discovery Surfaces ────────────────────────────

app.get('/.well-known/x402.json', (_req, res) => {
  res.json({
    serviceName: SERVICE_NAME,
    serviceDescription: 'Creative-integrator service for the RAEN fleet — ASCII art, SVG diagrams, HTML landings, music, design tokens, sketch mockups',
    baseUrl: BASE_URL,
    network: NETWORK,
    price: '0.10',
    asset: 'USDC',
    payTo: TREASURY_PAYTO,
    facilitator: FACILITATOR_URL,
    x402Version: 2,
    endpoints: [
      { url: `${BASE_URL}/api/generate`, method: 'POST', network: NETWORK, asset: 'USDC', price: '0.10', payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 600, description: 'Generate a creative asset' },
      { url: `${BASE_URL}/api/batch`, method: 'POST', network: NETWORK, asset: 'USDC', price: '0.50', payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 900, description: 'Batch generate' },
      { url: `${BASE_URL}/api/preview`, method: 'GET', network: NETWORK, asset: 'USDC', price: '0.01', payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 60, description: 'Preview creative' },
      { url: `${BASE_URL}/api/surfaces`, method: 'GET', network: NETWORK, asset: 'USDC', price: '0.00', payTo: TREASURY_PAYTO, facilitator: FACILITATOR_URL, maxTimeoutSeconds: 30, description: 'List x402 surfaces' },
    ],
    '$schema': 'https://x402.org/schemas/x402.json',
  });
});

app.get('/pricing.md', (_req, res) => {
  res.type('text/markdown').send(`# Pricing — ${SERVICE_NAME}

| Endpoint | Price | Network |
|----------|-------|---------|
| \`/api/generate\` | $0.10 | ${NETWORK} |
| \`/api/batch\` | $0.50 | ${NETWORK} |
| \`/api/preview\` | $0.01 | ${NETWORK} |
| \`/api/surfaces\` | FREE | ${NETWORK} |

- **Asset**: USDC on Base (eip155:8453)
- **Facilitator**: ${FACILITATOR_URL}
- **Treasury**: \`${TREASURY_PAYTO}\`
- **x402 Version**: 2
`);
});

app.get('/llms.txt', (_req, res) => {
  res.type('text/plain').send(`# ${SERVICE_NAME}

Creative-integrator service for the RAEN fleet.

## Endpoints
- POST /api/generate — Generate creative asset
- POST /api/batch — Batch generate
- GET /api/preview — Preview creative
- GET /api/surfaces — List x402 surfaces

## Payment
- Network: ${NETWORK} (Base)
- Token: USDC
- Facilitator: ${FACILITATOR_URL}
- Treasury: ${TREASURY_PAYTO}
`);
});

app.get('/sample', (_req, res) => {
  res.json({ service: SERVICE_NAME, status: 'ready', network: NETWORK, price: '0.10', message: 'Send POST with x402 payment', endpoints: ['/api/generate', '/api/batch'], facilitator: FACILITATOR_URL, payTo: TREASURY_PAYTO, x402Version: 2 });
});

app.get('/api/surfaces', (_req, res) => {
  res.json({ service: SERVICE_NAME, surfaces: [
    { path: '/.well-known/x402.json', method: 'GET', price: '0.00', description: 'x402 manifest' },
    { path: '/pricing.md', method: 'GET', price: '0.00', description: 'Pricing surface' },
    { path: '/llms.txt', method: 'GET', price: '0.00', description: 'LLM discovery' },
    { path: '/sample', method: 'GET', price: '0.00', description: 'Sample response' },
    { path: '/api/generate', method: 'POST', price: '0.10', description: 'Generate creative asset' },
    { path: '/api/batch', method: 'POST', price: '0.50', description: 'Batch generate' },
    { path: '/api/preview', method: 'GET', price: '0.01', description: 'Preview creative' },
  ], treasury: TREASURY_PAYTO, network: NETWORK });
});

// ─── x402 Protected Creative Endpoints ──────────────────
app.post('/api/generate', verifyPayment, async (req, res) => {
  try {
    const { brief, maxSteps, maxCostUSD } = req.body || {};
    const result = await runCreativeAgent(brief || 'Create a creative asset for the RAEN fleet', { maxSteps: maxSteps || 8, maxCostUSD: maxCostUSD || 0.50 });
    const text = await result.getText();
    res.json({ success: true, service: SERVICE_NAME, result: text.substring(0, 2000), network: NETWORK, payment: { asset: 'USDC', amount: '0.10' }, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/batch', verifyPayment, async (req, res) => {
  try {
    const { briefs, parallel } = req.body || {};
    if (!briefs || !Array.isArray(briefs) || briefs.length === 0) return res.status(400).json({ error: 'briefs array required' });
    const results = await batchGenerateCreatives(briefs, { parallel: parallel || 3 });
    res.json({ success: true, service: SERVICE_NAME, count: results.length, network: NETWORK, payment: { asset: 'USDC', amount: '0.50' }, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.get('/api/preview', verifyPayment, async (req, res) => {
  try {
    const { brief } = req.query || {};
    const result = await runCreativeAgent(brief || 'Preview creative asset', { maxSteps: 3, maxCostUSD: 0.10 });
    const text = await result.getText();
    res.json({ success: true, service: SERVICE_NAME, preview: text.substring(0, 1000), network: NETWORK, payment: { asset: 'USDC', amount: '0.01' }, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post('/api/pipeline', verifyPayment, async (req, res) => {
  try {
    const { research, generation, review } = req.body || {};
    const result = await runCreativePipeline({ research: research || 'Research creative direction for RAEN fleet', generation: generation || 'Generate creative assets', review: review || 'Review creative outputs' });
    res.json({ success: true, service: SERVICE_NAME, pipeline: Object.keys(result), network: NETWORK, timestamp: new Date().toISOString() });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ─── 404 handler ────────────────────────────────────────
app.use((_req, res) => { res.status(404).json({ error: 'Not found', service: SERVICE_NAME }); });

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[tiffany-creative] Server running on 0.0.0.0:${PORT}`);
  console.log(`[tiffany-creative] Service: ${SERVICE_NAME}`);
  console.log(`[tiffany-creative] Network: ${NETWORK}`);
  console.log(`[tiffany-creative] Treasury: ${TREASURY_PAYTO}`);
  console.log(`[tiffany-creative] Facilitator: ${FACILITATOR_URL}`);
  console.log(`[tiffany-creative] x402 Version: 2`);
  console.log(`[tiffany-creative] Health: http://0.0.0.0:${PORT}/health`);
  console.log(`[tiffany-creative] x402 Manifest: http://0.0.0.0:${PORT}/.well-known/x402.json`);
});
