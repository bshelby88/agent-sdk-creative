/**
 * Core Creative Pipeline Tool Definitions
 *
 * Each tool is defined with the `tool()` helper and Zod schemas,
 * enabling automatic tool execution within the callModel agent loop.
 *
 * RAEN A2A Charter Alignment:
 * - §5.3 Machine-Readable Surface Compliance: Tools generate x402 surfaces
 * - §2 Claim-Mark-Release: State tracking for creative asset ownership
 * - §3 A2A Dispatch: Tools respond to fleet dispatch protocols
 */

import { tool } from '@openrouter/agent';
import type { ToolWithExecute } from '@openrouter/agent';
import { z } from 'zod';
import { parseAsync } from 'zod/v4/core';
import type { $ZodObject, $ZodShape, $ZodType, input as ZodInput, output as ZodOutput } from 'zod/v4/core';
import { execSync } from 'child_process';
import { connectMCP } from './mcp-integration.js';

// ─── Direct tool invocation helper ──────────────────────────────────
/**
 * Invoke a `tool()`-built tool directly (outside the callModel loop).
 *
 * `tool()` returns `{ type, function: { inputSchema, execute, ... } }`, so the
 * executor lives at `.function.execute`, not `.execute`. This helper validates
 * the input against the tool's Zod schema (applying defaults) and runs it —
 * the same contract the agent loop provides at runtime.
 */
export async function runTool<
  TInput extends $ZodObject<$ZodShape>,
  TOutput extends $ZodType,
>(
  t: ToolWithExecute<TInput, TOutput, any, any, any>,
  input: ZodInput<TInput>,
): Promise<ZodOutput<TOutput>> {
  const parsed = await parseAsync(t.function.inputSchema, input);
  return (await t.function.execute(parsed)) as ZodOutput<TOutput>;
}

// ─── ASCII Art Tool ─────────────────────────────────────────────────
export const generate_ascii_art = tool({
  name: 'generate_ascii_art',
  description: 'Generate ASCII art banners from text using pyfiglet or asciified API.',
  inputSchema: z.object({
    text: z.string().min(1).max(80).describe('Text to render as ASCII art'),
    font: z.string().default('slant').describe('pyfiglet font name'),
    style: z.enum(['banner', 'compact', 'cyberpunk', 'gothic', 'minimal']).default('banner'),
  }),
  outputSchema: z.object({
    asciiArt: z.string(),
    font: z.string(),
    width: z.number(),
  }),
  execute: async ({ text, font, style }) => {
    const width = style === 'compact' ? 60 : style === 'cyberpunk' ? 80 : 72;
    try {
      const result = execSync(
        `python -m pyfiglet "${text}" -f "${font}" -w ${width} 2>nul || echo "ASCII: ${text}"`,
        { timeout: 10000 }
      ).toString().trim();
      return { asciiArt: result, font, width };
    } catch {
      return { asciiArt: `ASCII art: ${text}`, font, width: 0 };
    }
  },
});

// ─── SVG Diagram Tool ───────────────────────────────────────────────
export const create_svg_diagram = tool({
  name: 'create_svg_diagram',
  description: 'Create hand-drawn SVG diagrams as dark-themed HTML embeds.',
  inputSchema: z.object({
    diagramType: z.enum(['architecture', 'flowchart', 'sequence', 'state-machine', 'network']),
    title: z.string(),
    nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string() })),
    connections: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
    theme: z.enum(['dark', 'light']).default('dark'),
  }),
  outputSchema: z.object({
    svgContent: z.string(),
    htmlEmbed: z.string(),
    nodeCount: z.number(),
  }),
  execute: async ({ diagramType, title, nodes, connections, theme }) => {
    const colors = theme === 'dark'
      ? { bg: '#1a1a2e', node: '#16213e', edge: '#e94560', text: '#eee', accent: '#0f3460' }
      : { bg: '#f5f5f5', node: '#fff', edge: '#333', text: '#222', accent: '#0066cc' };

    const nodePositions = nodes.map((n, i) => ({
      ...n, x: 100 + (i % 4) * 200, y: 100 + Math.floor(i / 4) * 150,
    }));

    const nodeElements = nodePositions.map(n =>
      `<rect x="${n.x}" y="${n.y}" width="160" height="60" rx="8" fill="${colors.node}" stroke="${colors.accent}" stroke-width="2"/>
       <text x="${n.x + 80}" y="${n.y + 35}" text-anchor="middle" fill="${colors.text}" font-size="12">${n.label}</text>`
    ).join('\n');

    const edgeElements = connections.map(c => {
      const from = nodePositions.find(n => n.id === c.from);
      const to = nodePositions.find(n => n.id === c.to);
      if (!from || !to) return '';
      return `<line x1="${from.x + 80}" y1="${from.y + 60}" x2="${to.x + 80}" y2="${to.y}" stroke="${colors.edge}" stroke-width="1.5"/>`;
    }).join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
      <rect width="900" height="600" fill="${colors.bg}"/>
      <text x="450" y="40" text-anchor="middle" fill="${colors.accent}" font-size="18" font-weight="bold">${title}</text>
      ${edgeElements}${nodeElements}</svg>`;

    const htmlEmbed = `<!DOCTYPE html><html><body style="background:${colors.bg};display:flex;justify-content:center;padding:20px">${svg}</body></html>`;
    return { svgContent: svg, htmlEmbed, nodeCount: nodes.length };
  },
});

// ─── HTML Landing Page Tool ─────────────────────────────────────────
export const build_html_landing = tool({
  name: 'build_html_landing',
  description: 'Build a complete HTML landing page with x402 surfaces.',
  inputSchema: z.object({
    serviceName: z.string(),
    serviceDescription: z.string(),
    endpoints: z.array(z.object({ path: z.string(), method: z.string(), price: z.string(), description: z.string() })),
    designTokens: z.record(z.string(), z.string()).optional(),
    x402Enabled: z.boolean().default(true),
  }),
  outputSchema: z.object({
    html: z.string(),
    pageUrl: z.string(),
    surfaces: z.array(z.string()),
  }),
  execute: async ({ serviceName, serviceDescription, endpoints, designTokens, x402Enabled }) => {
    const endpointRows = endpoints.map(e =>
      `<div class="endpoint"><span class="method">${e.method}</span><span class="path">${e.path}</span><span class="price">${e.price}</span><span class="desc">${e.description}</span></div>`
    ).join('');

    const x402Section = x402Enabled ? `
      <section id="x402"><h2>x402 Payment Integration</h2>
      <p>Accepted: USDC on Base (eip155:8453)</p>
      <a href="/.well-known/x402.json">x402 Manifest</a></section>` : '';

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${serviceName}</title>
      <style>body{font-family:Inter,sans-serif;background:#1a1a2e;color:#eee;padding:80px 20px}
      .endpoint{padding:12px;border:1px solid #333;margin:8px 0;border-radius:8px;display:flex;gap:16px}
      .method{color:#e94560;font-weight:bold}</style></head><body>
      <div class="hero"><h1>${serviceName}</h1><p>${serviceDescription}</p></div>
      <div class="endpoints"><h2>API Endpoints</h2>${endpointRows}${x402Section}</div></body></html>`;

    return { html, pageUrl: `https://${serviceName.toLowerCase()}.fly.dev`, surfaces: x402Enabled ? ['/x402.json', '/pricing.md', '/sample', '/llms.txt'] : [] };
  },
});

// ─── DESIGN.md Token Generator ──────────────────────────────────────
export const create_design_md_token = tool({
  name: 'create_design_md_token',
  description: 'Generate DESIGN.md token spec files.',
  inputSchema: z.object({
    tokenType: z.enum(['color', 'typography', 'spacing', 'shadow', 'radius', 'animation']),
    tokens: z.array(z.object({ name: z.string(), value: z.string(), description: z.string().optional() })),
    format: z.enum(['design-md', 'css-variables', 'json']).default('design-md'),
  }),
  outputSchema: z.object({ content: z.string(), format: z.string(), tokenCount: z.number() }),
  execute: async ({ tokenType, tokens, format }) => {
    if (format === 'design-md') {
      const sections = tokens.map(t => `- \`${t.name}\`: ${t.value}${t.description ? ` — ${t.description}` : ''}`).join('\n');
      return { content: `# Design Tokens\n\n## ${tokenType}\n\n${sections}`, format: 'design-md', tokenCount: tokens.length };
    }
    const cssVars = tokens.map(t => `  --${tokenType}-${t.name}: ${t.value};`).join('\n');
    return { content: `:root {\n${cssVars}\n}`, format: 'css-variables', tokenCount: tokens.length };
  },
});

// ─── Sketch Mockup Generator ────────────────────────────────────────
export const generate_sketch_mockup = tool({
  name: 'generate_sketch_mockup',
  description: 'Generate hand-drawn sketch mockup HTML artifacts.',
  inputSchema: z.object({
    type: z.enum(['landing-page', 'dashboard', 'mobile-app', 'web-app']),
    spec: z.object({ header: z.string(), sections: z.array(z.object({ title: z.string(), content: z.string() })), footer: z.string().optional() }),
    style: z.enum(['hand-drawn', 'clean', 'minimal']).default('hand-drawn'),
  }),
  outputSchema: z.object({ html: z.string(), previewUrl: z.string() }),
  execute: async ({ type, spec, style }) => {
    const sketchStyle = style === 'hand-drawn'
      ? 'font-family:"Comic Sans MS",cursive;background:#fef9e7'
      : style === 'minimal' ? 'font-family:Inter,sans-serif;background:#fff'
      : 'font-family:Inter,sans-serif;background:#f8f9fa';
    const sections = spec.sections.map(s =>
      `<section style="padding:20px;margin:16px 0;border:2px dashed #999;border-radius:12px"><h2>${s.title}</h2><p>${s.content}</p></section>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${sketchStyle}body{max-width:900px;margin:0 auto;padding:20px}</style></head><body>
      <header style="border-bottom:3px double #666;padding-bottom:16px;margin-bottom:32px"><h1>${spec.header}</h1></header>
      ${sections}${spec.footer ? `<footer style="border-top:2px solid #666;margin-top:32px;padding-top:16px">${spec.footer}</footer>` : ''}</body></html>`;
    return { html, previewUrl: 'data:text/html;base64,' + Buffer.from(html).toString('base64') };
  },
});

// ─── x402 Machine-Readable Surface Generator ────────────────────────
export const generate_x402_surface = tool({
  name: 'generate_x402_surface',
  description: 'Generate x402-compliant machine-readable surfaces per RAEN Charter §5.3.',
  inputSchema: z.object({
    surfaceType: z.enum(['x402.json', 'llms.txt', 'pricing.md', 'sample']),
    serviceName: z.string(),
    serviceDescription: z.string(),
    price: z.string(),
    network: z.string().default('eip155:8453'),
    payTo: z.string(),
    facilitator: z.string().default('https://x402-agent-pay.com/facilitator'),
    baseUrl: z.string(),
    capabilities: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({ content: z.string(), surfacePath: z.string(), contentType: z.string() }),
  execute: async ({ surfaceType, serviceName, serviceDescription, price, network, payTo, facilitator, baseUrl, capabilities }) => {
    switch (surfaceType) {
      case 'x402.json': {
        const content = JSON.stringify({ serviceName, serviceDescription, baseUrl, network, price, payTo, facilitator, x402Version: 2,
          endpoints: (capabilities || []).map(c => ({ url: `${baseUrl}${c}`, method: 'POST', network, asset: 'USDC', price: price.replace('$', ''), payTo, facilitator, maxTimeoutSeconds: 600 })),
          '$schema': 'https://x402.org/schemas/x402.json' }, null, 2);
        return { content, surfacePath: '/.well-known/x402.json', contentType: 'application/json' };
      }
      case 'llms.txt': {
        const lines = [`# ${serviceName}\n\n${serviceDescription}\n\n## Endpoints\n`, ...(capabilities || []).map(c => `- ${c}`),
          `\n\n## Pricing\n- ${price}\n\n## Payment\n- Network: ${network}\n- Token: USDC\n- Facilitator: ${facilitator}\n\n## Contact\n- Repository: ${baseUrl}`].join('\n');
        return { content: lines, surfacePath: '/llms.txt', contentType: 'text/plain' };
      }
      case 'pricing.md': {
        const rows = (capabilities || []).map(c => `| \`${c}\` | ${price} | ${network} |`).join('\n');
        const content = `# Pricing\n\n| Endpoint | Price | Network |\n|----------|-------|--------|\n${rows}\n\n## Payment Details\n- **Asset**: USDC\n- **Network**: ${network} (Base)\n- **Facilitator**: ${facilitator}\n- **Treasury**: \`${payTo}\``;
        return { content, surfacePath: '/pricing.md', contentType: 'text/markdown' };
      }
      case 'sample': {
        const content = JSON.stringify({ service: serviceName, status: 'ready', network, price, message: 'Send a POST request with x402 payment to call this endpoint', endpoints: capabilities || [], facilitator, payTo }, null, 2);
        return { content, surfacePath: '/sample', contentType: 'application/json' };
      }
      default: throw new Error(`Unknown surface type: ${surfaceType}`);
    }
  },
});

// ─── MCP Creative Connector Tool ──────────────────────────────
export const connect_creative_mcp = tool({
  name: 'connect_creative_mcp',
  description: 'Connect to remote MCP servers (ComfyUI, OpenSea, GitHub) for creative asset generation.',
  inputSchema: z.object({
    server: z.enum(['comfyui', 'opensea', 'github']).default('comfyui'),
    action: z.string().describe('Action to perform on the MCP server'),
  }),
  outputSchema: z.object({
    connected: z.boolean(),
    toolCount: z.number(),
    tools: z.array(z.string()),
  }),
  execute: async ({ server, action }) => {
    const configs = [
      { url: 'https://comfyui.example.com/mcp', name: 'ComfyUI', authKind: 'bearer' as const },
      { url: 'https://opensea.example.com/mcp', name: 'OpenSea', authKind: 'bearer' as const },
      { url: 'https://github.example.com/mcp', name: 'GitHub', authKind: 'bearer' as const },
    ];
    const match = configs.find(c => c.name.toLowerCase() === server);
    if (!match) return { connected: false, toolCount: 0, tools: [] };
    const handle = await connectMCP({ url: match.url, name: match.name, authKind: match.authKind });
    return { connected: handle.connected, toolCount: handle.tools.length, tools: handle.tools.map((t: any) => t.name || 'unknown') };
  },
});
export const compose_music = tool({
  name: 'compose_music',
  description: 'Compose simple music/melodies as structured data for creative campaigns.',
  inputSchema: z.object({
    mood: z.enum(['uplifting', 'dark', 'ambient', 'energetic', 'melancholic', 'heroic']).describe('Emotional tone'),
    tempo: z.number().min(60).max(200).default(120).describe('BPM'),
    duration: z.number().min(4).max(64).default(16).describe('Bars'),
    key: z.string().default('C major').describe('Musical key'),
    instruments: z.array(z.enum(['piano', 'guitar', 'synth', 'strings', 'drums', 'bass'])).default(['piano', 'strings']).describe('Instruments'),
    campaign: z.string().optional().describe('RAEN campaign name'),
  }),
  outputSchema: z.object({
    compositionId: z.string(),
    bars: z.array(z.object({ bar: z.number(), notes: z.array(z.object({ pitch: z.string(), duration: z.string(), instrument: z.string() })) })),
    tempo: z.number(), key: z.string(), instruments: z.array(z.string()), mood: z.string(),
    metadata: z.object({ campaign: z.string().optional(), generatedAt: z.string(), style: z.string() }),
  }),
  execute: async ({ mood, tempo, duration, key, instruments, campaign }) => {
    const scale = key.includes('minor') ? ['A', 'B', 'C', 'D', 'E', 'F', 'G'] : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const bars: Array<{ bar: number; notes: Array<{ pitch: string; duration: string; instrument: string }> }> = [];
    for (let i = 0; i < duration; i++) {
      const notes = instruments.map((inst, idx) => ({ pitch: scale[(i + idx) % scale.length], duration: 'quarter', instrument: inst }));
      bars.push({ bar: i + 1, notes });
    }
    const compositionId = `music-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    return { compositionId, bars, tempo, key, instruments, mood, metadata: { campaign: campaign || 'raen-fleet-creative', generatedAt: new Date().toISOString(), style: `${mood}-${tempo}bpm` } };
  },
});

// ─── Export all tools as array ──────────────────────────────────────
export const creativeTools = [
  generate_ascii_art, create_svg_diagram, build_html_landing,
  create_design_md_token, generate_sketch_mockup, generate_x402_surface,
  connect_creative_mcp, compose_music,
];
