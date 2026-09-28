/**
 * Machine-Readable Surfaces Automation
 * 
 * Generates x402-compliant discovery surfaces per RAEN Charter §5.3.
 * Every service MUST serve these four routes returning HTTP 200:
 * - GET /.well-known/x402.json
 * - GET /pricing.md
 * - GET /llms.txt
 * - GET /sample
 */

import { generate_x402_surface } from './creative-tools.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ServiceSurface {
  serviceName: string;
  serviceDescription: string;
  baseUrl: string;
  price: string;
  payTo: string;
  capabilities: string[];
}

const creativeServices: ServiceSurface[] = [
  {
    serviceName: 'tiffany-creative',
    serviceDescription: 'Creative-integrator service for the RAEN fleet — ASCII art, SVG diagrams, HTML landings, music, design tokens',
    baseUrl: 'https://tiffany-creative.fly.dev',
    price: '$0.10 per creative asset',
    payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    capabilities: ['/api/generate', '/api/batch', '/api/preview', '/api/surfaces'],
  },
  {
    serviceName: 'tiffany-marketing',
    serviceDescription: 'A2A marketing and sales lead — outreach content, social posts, copy, directory listings',
    baseUrl: 'https://tiffany-marketing.fly.dev',
    price: '$0.05 per content piece',
    payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    capabilities: ['/api/content', '/api/outreach', '/api/directory', '/api/audit'],
  },
  {
    serviceName: 'tiffany-dashboard',
    serviceDescription: 'Creative dashboard and analytics — visual overview of fleet creative assets and revenue',
    baseUrl: 'https://tiffany-dashboard.fly.dev',
    price: '$0.02 per view',
    payTo: '0x7861db4efc14a1ed5dd8c96c528a3796560f1393',
    capabilities: ['/api/overview', '/api/analytics', '/api/assets', '/api/surfaces'],
  },
];

export async function generateAllSurfaces(service: ServiceSurface): Promise<string[]> {
  const surfaces: string[] = [];
  const baseDir = join(process.cwd(), 'x402-marketing-surfaces', service.serviceName);

  for (const surfaceType of ['x402.json', 'llms.txt', 'pricing.md', 'sample'] as const) {
    const result = await generate_x402_surface.execute({
      surfaceType,
      serviceName: service.serviceName,
      serviceDescription: service.serviceDescription,
      price: service.price,
      payTo: service.payTo,
      baseUrl: service.baseUrl,
      capabilities: service.capabilities,
    });
    surfaces.push(result.content);

    const dir = surfaceType === 'x402.json' ? join(baseDir, '.well-known') : baseDir;
    mkdirSync(dir, { recursive: true });
    const filePath = surfaceType === 'x402.json' ? join(dir, 'x402.json') : join(dir, surfaceType.replace('/', ''));
    writeFileSync(filePath, result.content);
  }
  return surfaces;
}

export async function generateAllFleetSurfaces(): Promise<Record<string, string[]>> {
  const allSurfaces: Record<string, string[]> = {};
  for (const service of creativeServices) {
    const surfaces = await generateAllSurfaces(service);
    allSurfaces[service.serviceName] = surfaces;
  }
  return allSurfaces;
}

export async function auditSurfaceCompliance(services: ServiceSurface[]): Promise<Array<{ service: string; status: string; missing: string[]; errors: string[] }>> {
  const results = [];
  for (const service of services) {
    const missing: string[] = [];
    const errors: string[] = [];
    const baseDir = join(process.cwd(), 'x402-marketing-surfaces', service.serviceName);

    for (const surface of ['/.well-known/x402.json', '/pricing.md', '/llms.txt', '/sample']) {
      const filePath = surface === '/.well-known/x402.json'
        ? join(baseDir, '.well-known', 'x402.json')
        : join(baseDir, surface.replace('/', ''));

      if (!existsSync(filePath)) {
        missing.push(surface);
        continue;
      }
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (surface === '/.well-known/x402.json') {
          const parsed = JSON.parse(content);
          if (!parsed.x402Version || !parsed.payTo || !parsed.endpoints) {
            errors.push(`${surface}: missing required fields`);
          }
        }
      } catch {
        errors.push(`${surface}: invalid format`);
      }
    }
    results.push({ service: service.serviceName, status: missing.length === 0 && errors.length === 0 ? 'COMPLIANT' : 'NON-COMPLIANT', missing, errors });
  }
  return results;
}
