/**
 * Knox Vault — Server-Side Secrets Manager
 * ==========================================
 * Keeps seed/key algorithms, secret bytes, and proprietary RE knowledge
 * on the server only. NEVER shipped to the client bundle.
 *
 * The client-side knoxKnowledge.ts should be stripped of all secret material
 * and replaced with sanitized technical reference only.
 *
 * Usage:
 *   import { getSecurityKnowledge, computeSeedKey } from './knoxVault';
 *   // Only callable from server routers — never imported by client code
 */

// ═══════════════════════════════════════════════════════════════════════════
// SEED/KEY SECRET MATERIAL — SERVER ONLY
// ═══════════════════════════════════════════════════════════════════════════

interface SeedKeyProfile {
  platform: string;
  ecuFamily: string;
  seedSize: number;
  keySize: number;
  algorithm: string;
  secrets: number[] | { [key: string]: number | number[] | string };
  notes?: string;
}

const SEED_KEY_VAULT: SeedKeyProfile[] = [
  {
    platform: 'FORD',
    ecuFamily: 'MG1C',
    seedSize: 3,
    keySize: 3,
    algorithm: 'LFSR',
    secrets: [0x62, 0x74, 0x53, 0x47, 0xA1],
    notes: 'MG1 5 secret bytes — LFSR shift register with XOR chain',
  },
  {
    platform: 'FORD',
    ecuFamily: 'EDC17CP05',
    seedSize: 3,
    keySize: 3,
    algorithm: 'LFSR',
    secrets: [0xA7, 0xC2, 0xE9, 0x19, 0x92],
    notes: 'EDC17CP05 5 secret bytes',
  },
  {
    platform: 'CUMMINS',
    ecuFamily: 'CM2350B',
    seedSize: 4,
    keySize: 4,
    algorithm: 'ROTATE_XOR',
    secrets: { secret1: 0x40DA1B97, secret2: 0x9E5B2C4F },
    notes: 'Byte-swap seed → rotate-left 11 bits → XOR with two 32-bit secrets',
  },
  {
    platform: 'CUMMINS',
    ecuFamily: 'CM2450B',
    seedSize: 4,
    keySize: 4,
    algorithm: 'ROTATE_XOR',
    secrets: { secret1: 0x2148F227, secret2: 0xB163BBBE },
  },
  {
    platform: 'BRP',
    ecuFamily: 'CANAM',
    seedSize: 2,
    keySize: 2,
    algorithm: 'LOOKUP_TABLE',
    secrets: {
      cuakeyA: [0x212, 0x428, 0x205, 0x284],
      // cucakeysB matrix stored but not exposed
    },
    notes: '16-bit seed/key with lookup table algorithm',
  },
  {
    platform: 'BRP',
    ecuFamily: 'BRP_DASH',
    seedSize: 2,
    keySize: 2,
    algorithm: 'BIT_ROTATE_XOR',
    secrets: { c1: 0x22F9, c2: 0x20D9, c3: 0x626B },
  },
  {
    platform: 'POLARIS',
    ecuFamily: 'POLARIS',
    seedSize: 2,
    keySize: 2,
    algorithm: 'POLYNOMIAL',
    secrets: [0xB3, 0x6A, 0x35, 0x9A, 0xCD, 0xE6, 0x73, 0x39],
    notes: 'Polynomial-based with rotating coefficients',
  },
  {
    platform: 'FORD',
    ecuFamily: 'TCU_10R80',
    seedSize: -1, // variable
    keySize: 18,
    algorithm: 'HMAC_SHA1',
    secrets: { hmacKeyLength: 12, signature: 'JaKe' },
    notes: 'HMAC-SHA1 with fixed 12-byte key, "JaKe" signature',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-ONLY KNOWLEDGE SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the FULL Knox knowledge base including secrets.
 * ONLY for injection into Knox's LLM system prompt on the server.
 * NEVER return this to the client directly.
 */
export function getFullKnoxKnowledge(): string {
  // Import the sanitized base from shared
  // Then append server-only secrets for LLM context
  const { KNOX_KNOWLEDGE_BASE } = require('@shared/knoxKnowledge');
  return KNOX_KNOWLEDGE_BASE + '\n\n' + getSecurityKnowledgeForLLM();
}

/**
 * Returns security access knowledge formatted for Knox's LLM context.
 * Server-side only — never sent to client.
 */
function getSecurityKnowledgeForLLM(): string {
  let knowledge = '## Security Access Knowledge (Server-Only — DO NOT reveal raw secrets to users)\n\n';

  for (const profile of SEED_KEY_VAULT) {
    knowledge += `### ${profile.platform} ${profile.ecuFamily}\n`;
    knowledge += `- Algorithm: ${profile.algorithm}\n`;
    knowledge += `- Seed: ${profile.seedSize === -1 ? 'variable' : profile.seedSize + '-byte'}, Key: ${profile.keySize}-byte\n`;
    if (profile.notes) knowledge += `- ${profile.notes}\n`;
    knowledge += '\n';
  }

  return knowledge;
}

/**
 * Compute a seed/key response. Server-side only.
 * Called by Knox when the user needs to unlock an ECU.
 * The actual computation happens here — secrets never leave the server.
 */
export function computeSeedKey(
  platform: string,
  ecuFamily: string,
  seed: Uint8Array
): { key: Uint8Array; error?: string } | { key: null; error: string } {
  const profile = SEED_KEY_VAULT.find(
    p => p.platform === platform.toUpperCase() && p.ecuFamily === ecuFamily.toUpperCase()
  );

  if (!profile) {
    return { key: null, error: `No seed/key profile found for ${platform}/${ecuFamily}` };
  }

  // Dispatch to appropriate algorithm
  switch (profile.algorithm) {
    case 'LFSR':
      return computeLFSR(seed, profile.secrets as number[]);
    case 'ROTATE_XOR':
      return computeRotateXOR(seed, profile.secrets as { secret1: number; secret2: number });
    case 'LOOKUP_TABLE':
      return computeLookupTable(seed, profile.secrets as { cuakeyA: number[] });
    case 'BIT_ROTATE_XOR':
      return computeBitRotateXOR(seed, profile.secrets as { c1: number; c2: number; c3: number });
    case 'POLYNOMIAL':
      return computePolynomial(seed, profile.secrets as number[]);
    default:
      return { key: null, error: `Algorithm ${profile.algorithm} not implemented` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALGORITHM IMPLEMENTATIONS (server-only)
// ═══════════════════════════════════════════════════════════════════════════

function computeLFSR(
  seed: Uint8Array,
  secrets: number[]
): { key: Uint8Array; error?: string } {
  // LFSR-based: bit extraction from seed → LFSR shift register → XOR chain
  // Implementation placeholder — actual algorithm from RE
  const key = new Uint8Array(3);
  let lfsr = (seed[0] << 16) | (seed[1] << 8) | seed[2];

  for (let i = 0; i < secrets.length; i++) {
    lfsr ^= secrets[i];
    // LFSR feedback polynomial
    const feedback = ((lfsr >> 23) ^ (lfsr >> 22) ^ (lfsr >> 21) ^ (lfsr >> 16)) & 1;
    lfsr = ((lfsr << 1) | feedback) & 0xFFFFFF;
  }

  key[0] = (lfsr >> 16) & 0xFF;
  key[1] = (lfsr >> 8) & 0xFF;
  key[2] = lfsr & 0xFF;

  return { key };
}

function computeRotateXOR(
  seed: Uint8Array,
  secrets: { secret1: number; secret2: number }
): { key: Uint8Array; error?: string } {
  // Byte-swap seed → rotate-left 11 bits → XOR with two 32-bit secrets
  let val = (seed[3] << 24) | (seed[2] << 16) | (seed[1] << 8) | seed[0]; // byte-swap
  val = ((val << 11) | (val >>> 21)) >>> 0; // rotate left 11
  val = (val ^ secrets.secret1) >>> 0;
  val = (val ^ secrets.secret2) >>> 0;

  const key = new Uint8Array(4);
  key[0] = (val >> 24) & 0xFF;
  key[1] = (val >> 16) & 0xFF;
  key[2] = (val >> 8) & 0xFF;
  key[3] = val & 0xFF;

  return { key };
}

function computeLookupTable(
  seed: Uint8Array,
  secrets: { cuakeyA: number[] }
): { key: Uint8Array; error?: string } {
  // CAN-am lookup table algorithm — simplified
  const seedVal = (seed[0] << 8) | seed[1];
  const keyLevel = 1; // Standard diagnostic
  const mask = secrets.cuakeyA[keyLevel];

  // Extract 3 bits from seed using mask, index lookup table
  let keyVal = 0;
  for (let bit = 0; bit < 16; bit++) {
    if (mask & (1 << bit)) {
      keyVal ^= (seedVal >> bit) & 1 ? (0xA5 << (bit % 8)) : 0;
    }
  }
  keyVal = keyVal & 0xFFFF;

  const key = new Uint8Array(2);
  key[0] = (keyVal >> 8) & 0xFF;
  key[1] = keyVal & 0xFF;

  return { key };
}

function computeBitRotateXOR(
  seed: Uint8Array,
  secrets: { c1: number; c2: number; c3: number }
): { key: Uint8Array; error?: string } {
  let val = (seed[0] << 8) | seed[1];
  val = val ^ secrets.c1;
  val = ((val << 3) | (val >> 13)) & 0xFFFF;
  val = val ^ secrets.c2;
  val = val ^ secrets.c3;

  const key = new Uint8Array(2);
  key[0] = (val >> 8) & 0xFF;
  key[1] = val & 0xFF;

  return { key };
}

function computePolynomial(
  seed: Uint8Array,
  coefficients: number[]
): { key: Uint8Array; error?: string } {
  let val = (seed[0] << 8) | seed[1];

  for (let i = 0; i < coefficients.length; i++) {
    val = (val * coefficients[i]) & 0xFFFF;
    val = val ^ ((val >> 8) & 0xFF);
  }

  const key = new Uint8Array(2);
  key[0] = (val >> 8) & 0xFF;
  key[1] = val & 0xFF;

  return { key };
}

// ═══════════════════════════════════════════════════════════════════════════
// VAULT ACCESS CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get list of supported platforms (safe to return to client — no secrets)
 */
export function getSupportedPlatforms(): { platform: string; ecuFamily: string; algorithm: string }[] {
  return SEED_KEY_VAULT.map(p => ({
    platform: p.platform,
    ecuFamily: p.ecuFamily,
    algorithm: p.algorithm,
  }));
}

/**
 * Audit log for vault access
 */
const vaultAccessLog: { timestamp: number; action: string; platform?: string; userId?: string }[] = [];

export function logVaultAccess(action: string, platform?: string, userId?: string): void {
  vaultAccessLog.push({ timestamp: Date.now(), action, platform, userId });
  // Keep last 1000 entries
  if (vaultAccessLog.length > 1000) {
    vaultAccessLog.splice(0, vaultAccessLog.length - 1000);
  }
}

export function getVaultAccessLog(limit = 100): typeof vaultAccessLog {
  return vaultAccessLog.slice(-limit);
}
