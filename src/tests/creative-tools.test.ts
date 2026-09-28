/**
 * Integration tests for creative-tools.ts
 * Verifies each tool executes correctly end-to-end.
 */

import { describe, it, expect } from 'vitest';
import {
  generate_ascii_art,
  create_svg_diagram,
  build_html_landing,
  create_design_md_token,
  generate_sketch_mockup,
  generate_x402_surface,
  compose_music,
  creativeTools,
} from '../creative-tools.js';
import { validateSurfaceCompliance } from '../error-handler.js';

// ─── ASCII Art Tool ────────────────────────────────────
describe('generate_ascii_art', () => {
  it('should produce ASCII art output', async () => {
    const result = await generate_ascii_art.execute({ text: 'RAEN', font: 'slant', style: 'banner' });
    expect(result.asciiArt).toBeTruthy();
    expect(result.asciiArt.length).toBeGreaterThan(0);
    expect(result.font).toBe('slant');
    expect(typeof result.width).toBe('number');
  });

  it('should produce fallback output when pyfiglet fails', async () => {
    const result = await generate_ascii_art.execute({ text: 'Test', font: 'nonexistent', style: 'banner' });
    expect(result.asciiArt).toBeTruthy();
  });

  it('should reject text longer than 80 characters', async () => {
    await expect(generate_ascii_art.execute({ text: 'A'.repeat(81), font: 'slant', style: 'banner' })).rejects.toBeDefined();
  });
});

// ─── SVG Diagram Tool ──────────────────────────────────
describe('create_svg_diagram', () => {
  it('should produce valid SVG content', async () => {
    const result = await create_svg_diagram.execute({
      diagramType: 'flowchart',
      title: 'Test Diagram',
      nodes: [{ id: '1', label: 'Start', type: 'start' }, { id: '2', label: 'End', type: 'end' }],
      connections: [{ from: '1', to: '2' }],
      theme: 'dark',
    });
    expect(result.svgContent).toContain('<svg');
    expect(result.svgContent).toContain('Test Diagram');
    expect(result.nodeCount).toBe(2);
    expect(result.htmlEmbed).toContain('<html');
  });

  it('should produce light theme SVG', async () => {
    const result = await create_svg_diagram.execute({
      diagramType: 'architecture', title: 'Light', nodes: [{ id: 'a', label: 'A', type: 'node' }],
      connections: [], theme: 'light',
    });
    expect(result.svgContent).toContain('#f5f5f5');
  });
});

// ─── HTML Landing Tool ─────────────────────────────────
describe('build_html_landing', () => {
  it('should produce valid HTML with x402 surfaces', async () => {
    const result = await build_html_landing.execute({
      serviceName: 'TestService',
      serviceDescription: 'A test service',
      endpoints: [{ path: '/api/test', method: 'POST', price: '$0.10', description: 'Test endpoint' }],
      x402Enabled: true,
    });
    expect(result.html).toContain('TestService');
    expect(result.html).toContain('x402');
    expect(result.surfaces).toContain('/x402.json');
    expect(result.surfaces).toContain('/pricing.md');
    expect(result.surfaces).toContain('/sample');
    expect(result.surfaces).toContain('/llms.txt');
  });

  it('should produce HTML without x402 when disabled', async () => {
    const result = await build_html_landing.execute({
      serviceName: 'TestService', serviceDescription: 'A test service',
      endpoints: [], x402Enabled: false,
    });
    expect(result.html).not.toContain('x402');
    expect(result.surfaces).toEqual([]);
  });
});

// ─── Design MD Token Tool ──────────────────────────────
describe('create_design_md_token', () => {
  it('should produce design-md format', async () => {
    const result = await create_design_md_token.execute({
      tokenType: 'color',
      tokens: [{ name: 'primary', value: '#1a1a2e', description: 'Primary color' }],
      format: 'design-md',
    });
    expect(result.format).toBe('design-md');
    expect(result.tokenCount).toBe(1);
    expect(result.content).toContain('Primary color');
  });

  it('should produce css-variables format', async () => {
    const result = await create_design_md_token.execute({
      tokenType: 'color',
      tokens: [{ name: 'bg', value: '#fff' }],
      format: 'css-variables',
    });
    expect(result.format).toBe('css-variables');
    expect(result.content).toContain('--color-bg');
  });
});

// ─── Sketch Mockup Tool ────────────────────────────────
describe('generate_sketch_mockup', () => {
  it('should produce hand-drawn style HTML', async () => {
    const result = await generate_sketch_mockup.execute({
      type: 'landing-page',
      spec: { header: 'My Landing', sections: [{ title: 'Section 1', content: 'Content here' }], footer: 'Footer' },
      style: 'hand-drawn',
    });
    expect(result.html).toContain('Comic Sans');
    expect(result.previewUrl).toContain('data:text/html;base64,');
  });

  it('should produce clean style HTML', async () => {
    const result = await generate_sketch_mockup.execute({
      type: 'dashboard',
      spec: { header: 'Dashboard', sections: [] },
      style: 'clean',
    });
    expect(result.html).toContain('Inter');
  });
});

// ─── x402 Surface Tool ─────────────────────────────────
describe('generate_x402_surface', () => {
  const service = {
    serviceName: 'test-service',
    serviceDescription: 'Test service',
    price: '$0.10',
    network: 'eip155:8453',
    payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    baseUrl: 'https://test.fly.dev',
    capabilities: ['/api/generate', '/api/batch'],
  };

  it('should produce valid x402.json', async () => {
    const result = await generate_x402_surface.execute({ ...service, surfaceType: 'x402.json' });
    expect(result.surfacePath).toBe('/.well-known/x402.json');
    expect(result.contentType).toBe('application/json');
    const parsed = JSON.parse(result.content);
    expect(parsed.x402Version).toBe(2);
    expect(parsed.payTo).toBe(service.payTo);
    expect(parsed.endpoints.length).toBe(2);
  });

  it('should produce valid llms.txt', async () => {
    const result = await generate_x402_surface.execute({ ...service, surfaceType: 'llms.txt' });
    expect(result.surfacePath).toBe('/llms.txt');
    expect(result.content).toContain('# test-service');
  });

  it('should produce valid pricing.md', async () => {
    const result = await generate_x402_surface.execute({ ...service, surfaceType: 'pricing.md' });
    expect(result.surfacePath).toBe('/pricing.md');
    expect(result.content).toContain('| Endpoint | Price | Network |');
  });

  it('should produce valid sample.json', async () => {
    const result = await generate_x402_surface.execute({ ...service, surfaceType: 'sample' });
    expect(result.surfacePath).toBe('/sample');
    const parsed = JSON.parse(result.content);
    expect(parsed.service).toBe('test-service');
    expect(parsed.status).toBe('ready');
  });

  it('should throw on unknown surface type', async () => {
    await expect(generate_x402_surface.execute({ ...service, surfaceType: 'unknown' } as any)).rejects.toThrow();
  });
});

// ─── Music Composition Tool ────────────────────────────
describe('compose_music', () => {
  it('should produce a valid composition', async () => {
    const result = await compose_music.execute({
      mood: 'uplifting', tempo: 120, duration: 8, key: 'C major', instruments: ['piano', 'strings'],
    });
    expect(result.compositionId).toBeTruthy();
    expect(result.bars.length).toBe(8);
    expect(result.tempo).toBe(120);
    expect(result.key).toBe('C major');
    expect(result.instruments).toEqual(['piano', 'strings']);
    expect(result.mood).toBe('uplifting');
    expect(result.metadata.generatedAt).toBeTruthy();
  });

  it('should generate bars with correct note structure', async () => {
    const result = await compose_music.execute({ mood: 'dark', duration: 2, key: 'A minor' });
    expect(result.bars[0].notes.length).toBeGreaterThan(0);
    expect(result.bars[0].notes[0].pitch).toBeTruthy();
    expect(result.bars[0].notes[0].instrument).toBeTruthy();
  });
});

// ─── Creative Tools Array ──────────────────────────────
describe('creativeTools array', () => {
  it('should contain all 8 tools', () => {
    expect(creativeTools).toHaveLength(8);
  });

  it('should include compose_music', () => {
    const names = creativeTools.map((t: any) => t.name);
    expect(names).toContain('compose_music');
  });

  it('should include generate_x402_surface', () => {
    const names = creativeTools.map((t: any) => t.name);
    expect(names).toContain('generate_x402_surface');
  });
});

// ─── Surface Compliance Validation ─────────────────────
describe('validateSurfaceCompliance', () => {
  it('should return COMPLIANT for all surfaces present', () => {
    const result = validateSurfaceCompliance('test-service', {
      '/.well-known/x402.json': JSON.stringify({ x402Version: 2, payTo: '0x...', endpoints: [] }),
      '/pricing.md': '# Pricing',
      '/llms.txt': '# llms',
      '/sample': '{}',
    });
    expect(result.status).toBe('COMPLIANT');
    expect(result.missing).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should return NON-COMPLIANT for missing surfaces', () => {
    const result = validateSurfaceCompliance('test-service', {
      '/.well-known/x402.json': '',
      '/pricing.md': '# Pricing',
      '/llms.txt': '',
      '/sample': '{}',
    });
    expect(result.status).toBe('NON-COMPLIANT');
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('should detect invalid x402.json', () => {
    const result = validateSurfaceCompliance('test-service', {
      '/.well-known/x402.json': 'not-json',
      '/pricing.md': '# Pricing',
      '/llms.txt': '# llms',
      '/sample': '{}',
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
