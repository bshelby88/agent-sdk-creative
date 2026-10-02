/**
 * Integration tests for surfaces-generator.ts
 * Verifies x402 surface generation, file writing, and compliance audit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import {
  generateAllSurfaces,
  generateAllFleetSurfaces,
  auditSurfaceCompliance,
  ServiceSurface,
} from '../surfaces-generator.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';

const testServices: ServiceSurface[] = [
  {
    serviceName: 'test-creative',
    serviceDescription: 'Test creative service',
    baseUrl: 'https://test-creative.fly.dev',
    price: '$0.10',
    payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    capabilities: ['/api/generate', '/api/batch'],
  },
  {
    serviceName: 'test-marketing',
    serviceDescription: 'Test marketing service',
    baseUrl: 'https://test-marketing.fly.dev',
    price: '$0.05',
    payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    capabilities: ['/api/content'],
  },
];

describe('generateAllSurfaces', () => {
  it('should generate all 4 surface types', async () => {
    const surfaces = await generateAllSurfaces(testServices[0]);
    expect(surfaces).toHaveLength(4);
  });

  it('should write files to disk', async () => {
    const baseDir = join(process.cwd(), 'x402-marketing-surfaces', 'test-creative');
    await generateAllSurfaces(testServices[0]);

    expect(existsSync(join(baseDir, '.well-known', 'x402.json'))).toBe(true);
    expect(existsSync(join(baseDir, 'llms.txt'))).toBe(true);
    expect(existsSync(join(baseDir, 'pricing.md'))).toBe(true);
    expect(existsSync(join(baseDir, 'sample'))).toBe(true);
    expect(existsSync(join(baseDir, '.well-known', 'x402.json'))).toBe(true);
  });
});

describe('generateAllFleetSurfaces', () => {
  it('should generate surfaces for all services', async () => {
    const allSurfaces = await generateAllFleetSurfaces();
    expect(Object.keys(allSurfaces)).toHaveLength(3);
    expect(allSurfaces['tiffany-creative']).toHaveLength(4);
    expect(allSurfaces['tiffany-marketing']).toHaveLength(4);
  });
});

describe('auditSurfaceCompliance', () => {
  it('should return COMPLIANT for generated surfaces', async () => {
    await generateAllSurfaces(testServices[0]);
    const results = await auditSurfaceCompliance([testServices[0]]);
    expect(results[0].status).toBe('COMPLIANT');
    expect(results[0].missing).toEqual([]);
    expect(results[0].errors).toEqual([]);
  });

  it('should return NON-COMPLIANT for missing files', async () => {
    const results = await auditSurfaceCompliance([testServices[1]]);
    expect(results[0].status).toBe('NON-COMPLIANT');
    expect(results[0].missing.length).toBeGreaterThan(0);
  });
});
