/**
 * MCP Tool Integration Module
 * 
 * Provides connection management for remote MCP servers (ComfyUI, OpenSea, GitHub, etc.)
 * as tools within the creative agent loop.
 * 
 * RAEN A2A Charter Alignment:
 * - §5.3 Machine-Readable Surface Compliance: MCP tools exposed via x402 surfaces
 * - §3 A2A Dispatch: MCP tools respond to fleet dispatch protocols
 */

import { createMCPTools } from '@openrouter/agent/mcp';
import { CreativeError, ErrorCode, handleError } from './error-handler.js';

export interface MCPConfig {
  url: string;
  name: string;
  authKind?: 'bearer' | 'headers' | 'oauth';
  authToken?: string;
  toolNamePrefix?: string;
}

export interface MCPToolHandle {
  name: string;
  tools: readonly unknown[];
  connected: boolean;
  error?: CreativeError;
}

export interface MCPConnectionState {
  serverName: string;
  url: string;
  connected: boolean;
  toolCount: number;
  toolNames: string[];
  connectedAt?: string;
  lastError?: string;
}

/**
 * Connect to a single MCP server and return its tools.
 */
export async function connectMCP(config: MCPConfig): Promise<MCPToolHandle> {
  try {
    const authKind = config.authKind || 'bearer';
    const auth = authKind === 'bearer'
      ? { kind: 'bearer' as const, token: config.authToken || '' }
      : authKind === 'headers'
        ? { kind: 'headers' as const, headers: { Authorization: config.authToken || '' } }
        : { kind: 'bearer' as const, token: config.authToken || '' };
    const mcp = await createMCPTools({
      url: config.url,
      auth,
      toolNamePrefix: config.toolNamePrefix || config.name.toLowerCase().replace(/\s+/g, '_'),
    });

    const toolNames = mcp.tools.map((t: any) => t.name || t.function?.name || 'unknown');
    return {
      name: config.name,
      tools: mcp.tools,
      connected: true,
    };
  } catch (err) {
    const error = new CreativeError(
      `MCP connection failed for ${config.name}: ${handleError(err)}`,
      ErrorCode.MCP_CONNECTION_FAILURE,
      { serverName: config.name, url: config.url }
    );
    return { name: config.name, tools: [], connected: false, error };
  }
}

/**
 * Connect to multiple MCP servers and return all tool handles.
 */
export async function connectAllMCP(
  configs: MCPConfig[],
  options?: { parallel?: boolean }
): Promise<MCPToolHandle[]> {
  if (options?.parallel !== false) {
    return Promise.all(configs.map(config => connectMCP(config)));
  }

  const results: MCPToolHandle[] = [];
  for (const config of configs) {
    const handle = await connectMCP(config);
    results.push(handle);
  }
  return results;
}

/**
 * Build a connection state summary for all MCP servers.
 */
export async function getMCPStatus(configs: MCPConfig[]): Promise<MCPConnectionState[]> {
  const handles = await connectAllMCP(configs);
  return handles.map(handle => ({
    serverName: handle.name,
    url: configs.find(c => c.name === handle.name)?.url || '',
    connected: handle.connected,
    toolCount: handle.tools.length,
    toolNames: handle.tools.map((t: any) => t.name || t.function?.name || 'unknown'),
    connectedAt: handle.connected ? new Date().toISOString() : undefined,
    lastError: handle.error?.message,
  }));
}

/**
 * Create MCP tools for the creative pipeline with retry logic.
 */
export async function createCreativeMCPTools(
  configs: MCPConfig[],
  options?: { maxRetries?: number; retryDelay?: number }
): Promise<any[]> {
  const maxRetries = options?.maxRetries || 3;
  const retryDelay = options?.retryDelay || 1000;
  let lastError: CreativeError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const handles = await connectAllMCP(configs);
      const tools = handles.flatMap((h: any) => h.tools);
      return tools;
    } catch (err: any) {
      lastError = new CreativeError(
        `MCP connection attempt ${attempt} failed: ${handleError(err)}`,
        ErrorCode.MCP_CONNECTION_FAILURE,
        { attempt, maxRetries }
      );
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.warn(`[MCPIntegration] All ${maxRetries} attempts failed, falling back to built-in tools.`);
  return [];
}

/**
 * Register MCP tools as x402 discoverable surfaces (RAEN §5.3).
 */
export function mcpToolsToSurfaces(mcpTools: any[]): Array<{ path: string; method: string; description: string }> {
  return mcpTools.map((tool: any) => ({
    path: `/api/mcp/${tool.name || 'unknown'}`,
    method: 'POST',
    description: tool.description || 'MCP tool endpoint',
  }));
}

// ─── Pre-built creative MCP configs ───────────────────────────
export const CREATIVE_MCP_SERVERS: MCPConfig[] = [
  { url: 'https://comfyui.example.com/mcp', name: 'ComfyUI', authKind: 'bearer', toolNamePrefix: 'comfy' },
  { url: 'https://opensea.example.com/mcp', name: 'OpenSea', authKind: 'bearer', toolNamePrefix: 'opensea' },
  { url: 'https://github.example.com/mcp', name: 'GitHub', authKind: 'bearer', toolNamePrefix: 'gh' },
];
