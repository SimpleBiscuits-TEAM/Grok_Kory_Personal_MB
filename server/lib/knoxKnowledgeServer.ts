/**
 * Knox Knowledge Base — SERVER-ONLY VERSION
 * ============================================
 * This file contains the FULL knowledge base including all seed/key secrets,
 * algorithm details, and proprietary RE knowledge.
 *
 * This file is ONLY imported by server routers (editor.ts, etc.)
 * and is NEVER bundled into the client JavaScript.
 *
 * The shared/knoxKnowledge.ts file has been sanitized to remove all
 * secret material. It now only contains safe technical reference info
 * that is acceptable to ship in the client bundle.
 *
 * SECURITY: If you need to add new secrets, add them HERE, not in shared/.
 */

// Re-export the sanitized base (safe for LLM context building)
import { KNOX_KNOWLEDGE_BASE_SANITIZED } from '@shared/knoxKnowledge';

/**
 * Server-only security access secrets.
 * These are appended to the LLM system prompt on the server
 * but NEVER shipped to the client.
 */
const SECURITY_ACCESS_SECRETS = `
## Security Access Knowledge (CONFIDENTIAL — Server-Only)

### GM Global B (E42/E86 ECM era)
- CMAC-based seed/key: 31-byte seed, 12-byte key
- Module-specific CMAC secret keys (not publicly available for ECM)
- Security levels: 1 (basic), 3 (extended), 5 (programming), 9 (manufacturing)
- Mode $22 reads do NOT require security access
- IOControl ($2F) requires Level 1-3 in Extended Session
- WriteDataByIdentifier ($2E) requires Level 3-5
- RequestDownload ($34) requires Level 5 in Programming Session

### Ford MG1/EDC17 (from source code)
- LFSR-based: 24-bit seed, 24-bit key
- 5 secret bytes per ECU variant
- Algorithm: bit extraction from seed → LFSR shift register → XOR chain
- MG1 secrets: {0x62, 0x74, 0x53, 0x47, 0xA1}
- EDC17CP05 secrets: {0xA7, 0xC2, 0xE9, 0x19, 0x92}

### Cummins CM2350B/CM2450B (from source code)
- 32-bit seed, 32-bit key
- Algorithm: byte-swap seed → rotate-left 11 bits → XOR with two 32-bit secrets
- CM2350B secrets: 0x40DA1B97, 0x9E5B2C4F
- CM2450B secrets: 0x2148F227, 0xB163BBBE

### CAN-am / BRP (from source code)
- 16-bit seed, 16-bit key
- Lookup table algorithm: seed bits select index into cucakeysB[8][4] matrix
- cuakeyA = {0x212, 0x428, 0x205, 0x284} (4 key levels)
- Key level 3 (standard diagnostic) maps to index 1
- Algorithm: extract 3 bits from seed using cuakeyA mask → index cucakeysB → multiply by ~seed → shift right 6

### BRP Dash (from source code)
- 16-bit seed, 16-bit key
- Bit extraction + conditional rotation + XOR with fixed constants
- Constants: 0x22F9, 0x20D9, 0x626B

### Polaris (from source code)
- 16-bit seed, 16-bit key
- Polynomial-based with rotating coefficients
- Uses coefficient array: {0xB3, 0x6A, 0x35, 0x9A, 0xCD, 0xE6, 0x73, 0x39}

### TCU 10R80 (Ford 10-speed transmission)
- Variable seed, 18-byte key
- HMAC-SHA1 with fixed 12-byte key
- Signature: "JaKe" embedded in response
`;

/**
 * Returns the FULL Knox knowledge base for server-side LLM injection.
 * Combines the sanitized base (safe reference) with server-only secrets.
 */
export function getFullKnoxKnowledge(): string {
  return KNOX_KNOWLEDGE_BASE_SANITIZED + '\n\n' + SECURITY_ACCESS_SECRETS;
}

/**
 * Returns ONLY the sanitized knowledge base (no secrets).
 * Safe to use in any context, including client-facing responses.
 */
export function getSanitizedKnoxKnowledge(): string {
  return KNOX_KNOWLEDGE_BASE_SANITIZED;
}
