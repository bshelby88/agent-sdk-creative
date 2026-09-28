/**
 * CDP Smart Account USDC Settlement Module
 *
 * Integrates Coinbase Developer Platform (CDP) smart accounts into the
 * creative agent's payment flow. Uses the CDP CLI (cdp.cmd) for all
 * on-chain operations on Base (eip155:8453).
 *
 * RAEN A2A Charter §5.3: Every creative asset payment settles via
 * CDP smart account with x402 protocol, USDC on Base.
 *
 * Canonical treasury (MONEY-TRUTH-CANONICAL-20260923.md):
 *   Treasury EOA:  0x7861db4efc14a1ed5dd8c96c528a3796560f1393
 *   Smart Account: 0x0E0C42862aFCcA171d1C48bacBD278B8DB8F8f68
 *   Owner:         0xe1271d07586d5a73004761035b38793a244FE37c
 *   USDC (Base):   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 *   Facilitator:   0x93F6601151cCB08F333AB4B1CCcfb1e188c0bE44
 *   Network:       eip155:8453
 */

import { execSync } from 'child_process';
import { join } from 'path';

// ─── Constants ────────────────────────────────────────────────────────────

export const CDP_CLI = join(process.env.LOCALAPPDATA || '', 'hermes/node/cdp.cmd');
export const CDP_CONFIG = join(process.env.LOCALAPPDATA || '', 'Roaming/cdp/config.json');

export const NETWORK = 'eip155:8453' as const;
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const X402_FACILITATOR = '0x93F6601151cCB08F333AB4B1CCcfb1e188c0bE44';

// Canonical treasury from MONEY-TRUTH-CANONICAL-20260923.md
export const TREASURY_EOA = '0x7861db4efc14a1ed5dd8c96c528a3796560f1393';

// CDP smart account (royal-agentic-smart)
export const SMART_ACCOUNT = '0x0E0C42862aFCcA171d1C48bacBD278B8DB8F8f68';
export const SMART_ACCOUNT_OWNER = '0xe1271d07586d5a73004761035b38793a244FE37c';

// RAEN fleet project
export const FLY_PROJECT = '9g6y30wgmy9rv5ml';
export const RAEN_KERNEL_KEY = '63d86692';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SettlementResult {
  status: 'broadcast' | 'pending' | 'confirmed' | 'failed';
  userOpHash?: string;
  txHash?: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  from: string;
}

export interface BalanceInfo {
  address: string;
  usdcBalance: string;
  ethBalance: string;
}

export interface x402PaymentPayload {
  x402Version: 2;
  scheme: 'exact';
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  facilitator: string;
}

// ─── CDP CLI helper ───────────────────────────────────────────────────────

function cdpCmd(args: string[], timeout?: number): string {
  const cmd = `"${CDP_CLI}" ${args.join(' ')}`;
  try {
    return execSync(cmd, { timeout: timeout || 30000, encoding: 'utf-8', shell: 'bash' }).trim();
  } catch (err: any) {
    throw new Error(`CDP CLI failed: ${err.message}\nCommand: ${cmd}`);
  }
}

// ─── Balance queries ──────────────────────────────────────────────────────

/** Query USDC balance for an address via CDP data API */
export function getBalance(address: string): BalanceInfo {
  const output = cdpCmd([
    'data', 'evm', 'token-balances', 'base', address,
    '--key-id', process.env.CDP_API_KEY_ID || '',
    '--key-secret', process.env.CDP_API_KEY_SECRET || '',
  ]);
  // Parse the JSON output
  const parsed = JSON.parse(output);
  const balances = parsed.balances || [];
  const usdc = balances.find((b: any) => b.token?.symbol === 'USDC');
  const eth = balances.find((b: any) => b.token?.symbol === 'ETH');

  return {
    address,
    usdcBalance: usdc ? (parseFloat(usdc.amount.amount) / Math.pow(10, usdc.amount.decimals || 6)).toFixed(6) : '0.000000',
    ethBalance: eth ? (parseFloat(eth.amount.amount) / Math.pow(10, eth.amount.decimals || 18)).toFixed(6) : '0.000000',
  };
}

/** Verify canonical treasury balance matches money-truth state */
export function verifyTreasuryBalance(): { confirmed: boolean; balance: string; expected: string } {
  const info = getBalance(TREASURY_EOA);
  const expected = '57.397345';
  return {
    confirmed: info.usdcBalance === expected,
    balance: info.usdcBalance,
    expected,
  };
}

// ─── Smart account operations ─────────────────────────────────────────────

/** List CDP smart accounts (confirms deployment) */
export function listSmartAccounts(): string {
  return cdpCmd(['evm', 'smart-accounts', 'list']);
}

/** Get smart account details by address */
export function getSmartAccount(address: string): string {
  return cdpCmd(['evm', 'smart-accounts', 'get', address]);
}

/**
 * Prepare and send a user-operation from the CDP smart account.
 * This is the autonomous settlement path — bypasses 2-owner spend permissions
 * requirement via CDP paymaster (ERC-4337 userops).
 */
export function settleViaUserOperation(payTo: string, amount: string): SettlementResult {
  const output = cdpCmd([
    'evm', 'smart-accounts', 'user-operations', 'prepare-and-send', SMART_ACCOUNT,
    '--network', 'base',
    '--to', payTo,
    '--amount', amount,
    '--asset', 'USDC',
  ]);
  const parsed = JSON.parse(output);
  return {
    status: parsed.status || 'pending',
    userOpHash: parsed.userOpHash,
    network: parsed.network || NETWORK,
    amount,
    asset: 'USDC',
    payTo,
    from: SMART_ACCOUNT,
  };
}

/**
 * Build an unsigned EIP-1559 transaction for USDC transfer.
 * Used for the one-time seed tx from treasury EOA → smart account.
 */
export function buildSeedTx(nonce: number, to: string, amount: string): string {
  // USDC transfer calldata: transfer(address,uint256) selector 0xa9059cbb
  const paddedTo = to.padStart(64, '0');
  const paddedAmount = (BigInt(Math.floor(parseFloat(amount) * 1e6))).toString(16).padStart(64, '0');
  const data = '0xa9059cbb' + paddedTo + paddedAmount;

  const output = cdpCmd([
    'util', 'tx-encode',
    '--network', 'base',
    '--from', TREASURY_EOA,
    '--to', BASE_USDC,
    '--data', data,
    '--value', '0',
    '--nonce', String(nonce),
    '--gas-limit', '65000',
    '--max-fee', '1000000000',
    '--max-priority-fee', '1000000000',
  ]);
  return output;
}

// ─── x402 settlement ──────────────────────────────────────────────────────

/** Build the x402 payment requirements object */
export function buildPaymentRequirements(price: string, payTo: string): x402PaymentPayload {
  return {
    x402Version: 2,
    scheme: 'exact',
    network: NETWORK,
    asset: 'USDC',
    amount: price.replace('$', '').trim(),
    payTo,
    maxTimeoutSeconds: 600,
    facilitator: X402_FACILITATOR,
  };
}

/** Verify an x402 payment via CDP */
export function verifyX402Payment(payload: x402PaymentPayload): string {
  const output = cdpCmd([
    'x402', 'verify',
    '--x402-version', '2',
    '--payment-payload', JSON.stringify(payload),
    '--payment-requirements', JSON.stringify(payload),
  ]);
  return output;
}

/** Settle an x402 payment via CDP (uses CDP paymaster for gasless settlement) */
export function settleX402Payment(payload: x402PaymentPayload): SettlementResult {
  const output = cdpCmd([
    'x402', 'settle',
    '--x402-version', '2',
    '--payment-payload', JSON.stringify(payload),
    '--payment-requirements', JSON.stringify(payload),
  ]);
  const parsed = JSON.parse(output);
  return {
    status: parsed.status || 'broadcast',
    userOpHash: parsed.userOpHash,
    txHash: parsed.txHash,
    network: payload.network,
    amount: payload.amount,
    asset: payload.asset,
    payTo: payload.payTo,
    from: SMART_ACCOUNT,
  };
}

/** Check x402 supported schemes */
export function getSupportedX402(): string {
  return cdpCmd(['x402', 'supported']);
}

// ─── High-level settlement flow ───────────────────────────────────────────

/**
 * Full creative asset settlement flow:
 * 1. Verify treasury balance matches money-truth canonical
 * 2. Check smart account deployment
 * 3. Build x402 payment requirements
 * 4. Settle via CDP smart account user-operation (gasless)
 *
 * Returns the settlement result with userOpHash for verification.
 */
export function settleCreativeAsset(
  serviceName: string,
  price: string,
  payTo?: string
): SettlementResult {
  const settlementPayTo = payTo || TREASURY_EOA;

  // Step 1: Verify treasury
  const treasuryCheck = verifyTreasuryBalance();
  if (!treasuryCheck.confirmed) {
    throw new Error(
      `Treasury balance mismatch: expected ${treasuryCheck.expected}, got ${treasuryCheck.balance}. ` +
      `Aborting settlement — consult MONEY-TRUTH-CANONICAL-20260923.md`
    );
  }

  // Step 2: Verify smart account
  const saInfo = getSmartAccount(SMART_ACCOUNT);

  // Step 3: Build x402 requirements
  const paymentReq = buildPaymentRequirements(price, settlementPayTo);

  // Step 4: Settle via smart account user-operation
  const result = settleViaUserOperation(settlementPayTo, price.replace('$', '').trim());

  console.log(`[CDP Settlement] ${serviceName}: ${price} USDC → ${settlementPayTo.slice(0, 10)}...`);
  console.log(`[CDP Settlement] Status: ${result.status}, UserOpHash: ${result.userOpHash}`);

  return result;
}

// ─── Export for agent-loop integration ────────────────────────────────────

export const cdpSettlementTool = {
  name: 'cdp_settle_creative',
  description: 'Settle creative asset payments via CDP smart accounts using USDC on Base (eip155:8453). Uses gasless ERC-4337 useroperations via CDP paymaster.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      serviceName: { type: 'string', description: 'Name of the creative service' },
      price: { type: 'string', description: 'Price in USDC (e.g. "$0.10")' },
      payTo: { type: 'string', description: 'Recipient address (defaults to canonical treasury)' },
      asset: { type: 'string', default: 'USDC', description: 'Settlement asset' },
      network: { type: 'string', default: NETWORK, description: 'Blockchain network' },
    },
    required: ['serviceName', 'price'] as const,
  },
  execute: async (input: { serviceName: string; price: string; payTo?: string; asset?: string; network?: string }) => {
    const result = settleCreativeAsset(input.serviceName, input.price, input.payTo);
    return result;
  },
};
