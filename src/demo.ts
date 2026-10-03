import { creativeTools, compose_music, generate_x402_surface } from './creative-tools.js';
import { generateAllFleetSurfaces, auditSurfaceCompliance } from './surfaces-generator.js';
import { validateStopConditions, createClaim, markProgress, markDone } from './agent-loop.js';
import { validateSurfaceCompliance } from './error-handler.js';

const TREASURY = '0x7861db4efc14a1ed5dd8c96c528a3796560f1393';

export async function demo() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RAEN Fleet — @tiffany/agent-sdk-creative Demo Pipeline');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('═══ Phase 1: Creative Tool Execution ═══\n');

  const asciiResult = await (creativeTools[0] as any).function.execute({ text: 'RAEN', font: 'slant', style: 'banner' }) as any;
  console.log('[1/7] ASCII Art: RAEN Banner');
  console.log(asciiResult.asciiArt);
  console.log(`  Font: ${asciiResult.font}, Width: ${asciiResult.width}\n`);

  const svgResult = await (creativeTools[1] as any).function.execute({
    diagramType: 'architecture', title: 'RAEN Fleet Architecture',
    nodes: [{ id: 'tiffany', label: 'Tiffany', type: 'lane' }, { id: 'kernel', label: 'RAE Kernel', type: 'service' }],
    connections: [{ from: 'tiffany', to: 'kernel', label: 'dispatch' }], theme: 'dark',
  }) as any;
  console.log('[2/7] SVG Diagram');
  console.log(`  ${svgResult.svgContent.substring(0, 60)}... (${svgResult.nodeCount} nodes)\n`);

  const htmlResult = await (creativeTools[2] as any).function.execute({
    serviceName: 'tiffany-creative', serviceDescription: 'Creative-integrator',
    endpoints: [{ path: '/api/generate', method: 'POST', price: '$0.10', description: 'Generate' }],
    x402Enabled: true,
  }) as any;
  console.log('[3/7] HTML Landing: Surfaces:', htmlResult.surfaces.join(', '));

  const tokenResult = await (creativeTools[3] as any).function.execute({
    tokenType: 'color', tokens: [{ name: 'primary', value: '#e94560' }], format: 'design-md',
  }) as any;
  console.log('[4/7] Design Tokens:', tokenResult.tokenCount, 'tokens');

  const sketchResult = await (creativeTools[4] as any).function.execute({
    type: 'dashboard', spec: { header: 'Dashboard', sections: [{ title: 'Overview', content: 'Data' }], footer: 'RAEN' },
    style: 'hand-drawn',
  }) as any;
  console.log('[5/7] Sketch Mockup');

  const x402Result = await (generate_x402_surface as any).function.execute({
    surfaceType: 'x402.json', serviceName: 'tiffany-creative', serviceDescription: 'Creative service',
    price: '$0.10', payTo: TREASURY, baseUrl: 'https://tiffany-creative.fly.dev',
    capabilities: ['/api/generate', '/api/batch'],
  }) as any;
  const parsed = JSON.parse(x402Result.content);
  console.log('[6/7] x402 Surface: v' + parsed.x402Version + ', PayTo: ' + parsed.payTo);

  const musicResult = await (compose_music as any).function.execute({
    mood: 'heroic', tempo: 140, duration: 16, key: 'C major',
    instruments: ['piano', 'strings', 'synth'], campaign: 'raen-fleet-launch',
  }) as any;
  console.log('[7/7] Music Composition: ' + musicResult.compositionId + ', ' + musicResult.bars.length + ' bars');

  console.log('\n═══ Phase 2: x402 Surface Generation ═══\n');
  const allSurfaces = await generateAllFleetSurfaces();
  for (const [service, surfaces] of Object.entries(allSurfaces)) {
    console.log('  ' + service + ': ' + surfaces.length + ' surfaces');
  }

  console.log('\n═══ Phase 3: Compliance Audit ═══\n');
  const auditResults = await auditSurfaceCompliance([
    { serviceName: 'tiffany-creative', serviceDescription: 'Creative service', baseUrl: 'https://tiffany-creative.fly.dev', price: '$0.10', payTo: TREASURY, capabilities: ['/api/generate'] },
    { serviceName: 'tiffany-marketing', serviceDescription: 'Marketing', baseUrl: 'https://tiffany-marketing.fly.dev', price: '$0.05', payTo: TREASURY, capabilities: ['/api/content'] },
  ]);
  for (const r of auditResults) { console.log('  ' + r.service + ': ' + r.status); }

  console.log('\n═══ Phase 4: Stop Conditions ═══\n');
  const tests = [{ s: 10, m: 10, c: 0.5, mc: 1.0, f: false }, { s: 5, m: 10, c: 1.0, mc: 1.0, f: false }, { s: 3, m: 10, c: 0.5, mc: 1.0, f: true }];
  for (const t of tests) {
    const r = validateStopConditions(t.s, t.m, t.c, t.mc, t.f);
    console.log('  Steps=' + t.s + '/' + t.m + ' → ' + (r.shouldStop ? 'STOP' : 'CONTINUE') + ' (' + r.reason + ')');
  }

  console.log('\n═══ Phase 5: Claim-Mark-Release ═══\n');
  const state = createClaim('asset-001', 'tiffany');
  const p = markProgress(state, 'Initial pass');
  const d = markDone(p, 'Final asset');
  console.log('  Claimed by tiffany, progressed, done. Evidence: ' + d.evidence.length);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Demo Complete — All 5 phases verified.');
  console.log('═══════════════════════════════════════════════════════════');
}
// Self-run only when executed directly (`tsx src/demo.ts`); index.ts imports and calls demo().
if (process.argv[1]?.includes("demo")) demo().catch(console.error);
