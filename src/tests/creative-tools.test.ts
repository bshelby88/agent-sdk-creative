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

describe('generate_ascii_art', () => {
  it('should produce ASCII art output', async () => {
    const result = await (generate_ascii_art as any).function.execute({ text: 'RAEN', font: 'slant', style: 'banner' });
    expect(result.asciiArt).toBeTruthy();
    expect(result.asciiArt.length).toBeGreaterThan(0);
    expect(result.font).toBe('slant');
    expect(typeof result.width).toBe('number');
  });
  it('should produce fallback output when pyfiglet fails', async () => {
    const result = await (generate_ascii_art as any).function.execute({ text: 'Test', font: 'nonexistent', style: 'banner' });
    expect(result.asciiArt).toBeTruthy();
  });
});

describe('create_svg_diagram', () => {
  it('should produce valid SVG content', async () => {
    const result = await (create_svg_diagram as any).function.execute({
      diagramType: 'flowchart', title: 'Test Diagram',
      nodes: [{ id: '1', label: 'Start', type: 'start' }, { id: '2', label: 'End', type: 'end' }],
      connections: [{ from: '1', to: '2' }], theme: 'dark',
    });
    expect(result.svgContent).toContain('<svg');
    expect(result.nodeCount).toBe(2);
  });
});

describe('build_html_landing', () => {
  it('should produce valid HTML with x402 surfaces', async () => {
    const result = await (build_html_landing as any).function.execute({
      serviceName: 'TestService', serviceDescription: 'A test service',
      endpoints: [{ path: '/api/test', method: 'POST', price: '$0.10', description: 'Test endpoint' }],
      x402Enabled: true,
    });
    expect(result.html).toContain('TestService');
    expect(result.surfaces).toContain('/x402.json');
  });
});

describe('create_design_md_token', () => {
  it('should produce design-md format', async () => {
    const result = await (create_design_md_token as any).function.execute({
      tokenType: 'color', tokens: [{ name: 'primary', value: '#1a1a2e', description: 'Primary color' }],
      format: 'design-md',
    });
    expect(result.format).toBe('design-md');
    expect(result.tokenCount).toBe(1);
  });
});

describe('generate_sketch_mockup', () => {
  it('should produce hand-drawn style HTML', async () => {
    const result = await (generate_sketch_mockup as any).function.execute({
      type: 'landing-page',
      spec: { header: 'My Landing', sections: [{ title: 'Section 1', content: 'Content here' }], footer: 'Footer' },
      style: 'hand-drawn',
    });
    expect(result.html).toContain('Comic Sans');
  });
});

describe('generate_x402_surface', () => {
  const service = {
    serviceName: 'test-service', serviceDescription: 'Test service', price: '$0.10',
    network: 'eip155:8453', payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    baseUrl: 'https://test.fly.dev', capabilities: ['/api/generate', '/api/batch'],
  };
  it('should produce valid x402.json', async () => {
    const result = await (generate_x402_surface as any).function.execute({ ...service, surfaceType: 'x402.json' });
    const parsed = JSON.parse(result.content);
    expect(parsed.x402Version).toBe(2);
  });
});

describe('compose_music', () => {
  it('should produce a valid composition', async () => {
    const result = await (compose_music as any).function.execute({
      mood: 'uplifting', tempo: 120, duration: 8, key: 'C major', instruments: ['piano', 'strings'],
    });
    expect(result.compositionId).toBeTruthy();
    expect(result.bars.length).toBe(8);
  });
});

describe('creativeTools array', () => {
  it('should contain all 8 tools', () => {
    expect(creativeTools).toHaveLength(8);
  });
  it('should include compose_music', () => {
    const names = creativeTools.map((t: any) => t.name);
    expect(names).toContain('compose_music');
  });
});

describe('validateSurfaceCompliance', () => {
  it('should return COMPLIANT for all surfaces present', () => {
    const result = validateSurfaceCompliance('test-service', {
      '/.well-known/x402.json': JSON.stringify({ x402Version: 2, payTo: '0x...', endpoints: [] }),
      '/pricing.md': '# Pricing', '/llms.txt': '# llms', '/sample': '{}',
    });
    expect(result.status).toBe('COMPLIANT');
  });
  it('should return NON-COMPLIANT for missing surfaces', () => {
    const result = validateSurfaceCompliance('test-service', {
      '/.well-known/x402.json': '', '/pricing.md': '# Pricing', '/llms.txt': '', '/sample': '{}',
    });
    expect(result.status).toBe('NON-COMPLIANT');
  });
});
