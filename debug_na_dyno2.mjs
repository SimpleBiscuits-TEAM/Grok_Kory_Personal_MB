// Use the actual WP8 parser via vitest-compatible import
// We'll run this through Node with tsx

import { readFileSync } from 'fs';

// Since the WP8 parser is TypeScript, we need to compile it first
// Let's just replicate the key calculations manually from the binary data

const buf = readFileSync('/home/ubuntu/vop/test_na_id1050.wp8');

// Check if it's binary
const isBinary = buf[0] !== 0x5B; // '[' = text format
console.log(`File size: ${buf.length} bytes, Binary: ${isBinary}`);
console.log(`First 4 bytes: ${buf[0]} ${buf[1]} ${buf[2]} ${buf[3]}`);

// Let's use the built vitest infrastructure to run the parser
// Instead, let's calculate what the HP SHOULD be for an NA Talon with ID1050s

// Known: Stock NA Honda Talon makes ~110 HP at the crank, ~95 HP at the wheel
// With ID1050 injectors on NA, the ECU tunes the pulse width down to compensate
// for the larger injectors. The fuel flow should be roughly the same as stock.

// The problem: 
// Stock injectors = 192 cc/min, stock peak injPW at WOT ~= 5-6ms
// ID1050 injectors = 1050 cc/min, so for same fuel flow, injPW should be ~1ms
// 
// If the ECU is commanding 2-3ms on ID1050s (which is common for tuned NA),
// that's actually MORE fuel than stock, but the engine can't use it all.
// The BSFC formula assumes all fuel = power, which is wrong for oversized injectors.

// Let's calculate:
// At 9000 RPM with ID1050, injPW = 2ms (hypothetical):
// Injections/sec = 9000/120 = 75
// cc/injection = (2/1000) * (1050/60) = 0.035 cc
// Total fuel flow = 0.035 * 75 * 2 cylinders * 0.755 g/cc = 3.96 g/s
// lb/hr = 3.96 / 453.592 * 3600 = 31.4 lb/hr
// HP = 31.4 / 0.45 = 69.8 HP  <-- reasonable for NA

// At 9000 RPM with ID1050, injPW = 5ms:
// cc/injection = (5/1000) * (1050/60) = 0.0875 cc
// Total fuel flow = 0.0875 * 75 * 2 * 0.755 = 9.91 g/s
// lb/hr = 9.91 / 453.592 * 3600 = 78.7 lb/hr
// HP = 78.7 / 0.45 = 174.8 HP  <-- WAY too high for NA!

// So the question is: what injector PW is this file showing?
// If the ECU is commanding 5ms on ID1050s, that's a LOT of fuel
// The BSFC model assumes efficient combustion, but with that much fuel
// on an NA engine, the AFR would be extremely rich and much fuel is wasted.

// Let's use pnpm tsx to run the actual parser
console.log('\nNeed to check actual injector PW values from the file.');
console.log('Running via tsx with actual parser...');
