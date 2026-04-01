// Use the project's own WP8 parser to analyze the file
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// We need to use tsx to import TypeScript files
// Instead, let's manually parse the binary data

const buf = readFileSync('./test_data.wp8');

// The WP8 binary format (from the parser):
// - Channels are listed first with metadata
// - Then row data follows as Float32 arrays
// Let's find the data section by looking at the structure

// Count channels - look at the strings we found
const channelNames = [
  'Alpha N', 'Baro Sensor Voltage', 'DCT Shift Torque Cut', 'DCT Line Pressure Mode',
  'DCT Shift Pressure Mode', 'DCT Next Upshift Speed', 'DCT Next Downshift Speed',
  'Launch Status', 'DCT Output Shaft Speed', 'DCT Drum Position',
  'Engine Oil Temperature Sensor Voltage', 'DCT Clutch 1 Pressure',
  'DCT Clutch 2 Pressure', 'DCT Line Pressure', 'Commanded Gear',
  'DCT Target Clutch 1 Pressure', 'DCT Linear Solenoid 1 Target Current',
  'DCT Switched Inputs Raw 1', 'DCT Switched Inputs Raw 2',
  'Oxygen Sensor Voltage', 'Short Term Fuel Trim', 'Engine Speed',
  'Throttle Position', 'Coolant Temperature', 'Intake Air Temperature',
  'Manifold Absolute Pressure Sensor Voltage', 'Manifold Absolute Pressure',
  'Module Voltage', 'Vehicle Speed', 'Injector Pulsewidth Final',
  'Ignition Timing Final', 'Idle Air Control Valve Pulse Counts',
  'Idle Air Control Valve Airflow', 'Injector Pulsewidth Desired',
  'Manifold Absolute Pressure Corrected', 'Switched Inputs Raw',
  'Switched Outputs Raw', 'Switched Outputs Raw 2', 'DCT Clutch 1 Slip Speed',
  'DCT Clutch 2 Slip Speed', 'Barometric Pressure', 'Injector Duty Cycle',
  'Neutral Switch', 'Service Check Connector Shorted', 'Fuel Pump Relay',
  'Evaporative Emissions Solenoid', 'Fan Relay', 'DCT Shift Up Switch',
  'DCT Shift Down Switch', 'DCT Shift Motor Up', 'DCT Shift Motor Down',
  'DCT Brake Pedal Switch', 'DCT Main Switch', 'DCT Starter Inhibit',
  'Air Fuel Ratio 1', 'Sensor 1 Ready', 'Air Fuel Ratio 2', 'Sensor 2 Ready',
];

console.log(`Total channels found: ${channelNames.length}`);

// Find key channel indices
const keyChannels = {
  'Engine Speed': channelNames.indexOf('Engine Speed'),
  'Throttle Position': channelNames.indexOf('Throttle Position'),
  'Injector Pulsewidth Final': channelNames.indexOf('Injector Pulsewidth Final'),
  'Injector Pulsewidth Desired': channelNames.indexOf('Injector Pulsewidth Desired'),
  'Air Fuel Ratio 1': channelNames.indexOf('Air Fuel Ratio 1'),
  'Air Fuel Ratio 2': channelNames.indexOf('Air Fuel Ratio 2'),
  'Manifold Absolute Pressure': channelNames.indexOf('Manifold Absolute Pressure'),
  'Vehicle Speed': channelNames.indexOf('Vehicle Speed'),
  'Injector Duty Cycle': channelNames.indexOf('Injector Duty Cycle'),
};

console.log('\nKey channel indices:', keyChannels);

// The file is 1.5MB. With 58 channels, each row = 58 * 4 bytes = 232 bytes
// Data section starts after header. Let's estimate:
// Header ~= 58 channels * ~115 bytes per channel = ~6670 bytes
// Data rows = (1515642 - ~7000) / (58 * 4) ≈ 6505 rows
// At 20Hz sample rate = ~325 seconds = ~5.4 minutes

// Let's look for the data section by finding where float values start
// The last channel name ends around offset 6780
// Let's scan from there for the data start

const text = buf.toString('latin1');
const lastChannelEnd = text.indexOf('Sensor 2 Ready') + 'Sensor 2 Ready'.length;
console.log(`\nLast channel name ends at offset: ${lastChannelEnd}`);

// Each channel has: name (variable) + metadata bytes
// Let's look at what's between channel entries
// Channel entry format seems to be ~115 bytes per channel

// Find data start by looking for a region where float32 values make sense
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// Try to find data start by scanning for reasonable Engine Speed values (1000-10000)
console.log('\n--- Scanning for data start ---');
for (let startOffset = 6700; startOffset < 8000; startOffset += 4) {
  const val = view.getFloat32(startOffset, true);
  if (val > 500 && val < 15000) {
    // Could be Engine Speed - check if subsequent values at channel stride also make sense
    const stride = channelNames.length; // channels per row
    const nextRowVal = view.getFloat32(startOffset + stride * 4, true);
    if (nextRowVal > 500 && nextRowVal < 15000 && Math.abs(nextRowVal - val) < 500) {
      console.log(`  Possible data start at offset ${startOffset}: val=${val.toFixed(1)}, next=${nextRowVal.toFixed(1)}`);
      
      // Read first few rows of key channels
      const rpmIdx = keyChannels['Engine Speed'];
      const tpsIdx = keyChannels['Throttle Position'];
      const injFinalIdx = keyChannels['Injector Pulsewidth Final'];
      const injDesiredIdx = keyChannels['Injector Pulsewidth Desired'];
      const afr1Idx = keyChannels['Air Fuel Ratio 1'];
      const mapIdx = keyChannels['Manifold Absolute Pressure'];
      const vssIdx = keyChannels['Vehicle Speed'];
      const injDutyIdx = keyChannels['Injector Duty Cycle'];
      
      console.log('\n  First 20 rows of key data:');
      console.log('  Row | RPM    | TPS    | InjFinal | InjDesired | AFR1   | MAP    | VSS    | InjDuty');
      for (let row = 0; row < 20; row++) {
        const base = startOffset + row * stride * 4;
        if (base + stride * 4 > buf.length) break;
        
        const rpm = view.getFloat32(base + rpmIdx * 4, true);
        const tps = view.getFloat32(base + tpsIdx * 4, true);
        const injF = view.getFloat32(base + injFinalIdx * 4, true);
        const injD = view.getFloat32(base + injDesiredIdx * 4, true);
        const afr1 = view.getFloat32(base + afr1Idx * 4, true);
        const map_ = view.getFloat32(base + mapIdx * 4, true);
        const vss = view.getFloat32(base + vssIdx * 4, true);
        const injDuty = view.getFloat32(base + injDutyIdx * 4, true);
        
        console.log(`  ${String(row).padStart(3)} | ${rpm.toFixed(1).padStart(6)} | ${tps.toFixed(1).padStart(6)} | ${injF.toFixed(3).padStart(8)} | ${injD.toFixed(3).padStart(10)} | ${afr1.toFixed(2).padStart(6)} | ${map_.toFixed(1).padStart(6)} | ${vss.toFixed(1).padStart(6)} | ${injDuty.toFixed(1).padStart(7)}`);
      }
      
      // Also find max values
      const totalRows = Math.floor((buf.length - startOffset) / (stride * 4));
      console.log(`\n  Total rows: ${totalRows}`);
      
      let maxRPM = 0, maxTPS = 0, maxInjF = 0, maxInjD = 0, maxAFR = 0, maxMAP = 0;
      let minAFR = 999;
      let wotSamples = 0;
      
      for (let row = 0; row < totalRows; row++) {
        const base = startOffset + row * stride * 4;
        const rpm = view.getFloat32(base + rpmIdx * 4, true);
        const tps = view.getFloat32(base + tpsIdx * 4, true);
        const injF = view.getFloat32(base + injFinalIdx * 4, true);
        const injD = view.getFloat32(base + injDesiredIdx * 4, true);
        const afr1 = view.getFloat32(base + afr1Idx * 4, true);
        const map_ = view.getFloat32(base + mapIdx * 4, true);
        
        if (rpm > maxRPM) maxRPM = rpm;
        if (tps > maxTPS) maxTPS = tps;
        if (injF > maxInjF) maxInjF = injF;
        if (injD > maxInjD) maxInjD = injD;
        if (afr1 > maxAFR && afr1 < 30) maxAFR = afr1;
        if (afr1 < minAFR && afr1 > 5) minAFR = afr1;
        if (map_ > maxMAP) maxMAP = map_;
        if (tps >= 72) wotSamples++;
      }
      
      console.log(`\n  Max RPM: ${maxRPM.toFixed(0)}`);
      console.log(`  Max TPS: ${maxTPS.toFixed(1)} (degrees)`);
      console.log(`  Max Inj PW Final: ${maxInjF.toFixed(3)} ms`);
      console.log(`  Max Inj PW Desired: ${maxInjD.toFixed(3)} ms`);
      console.log(`  AFR range: ${minAFR.toFixed(2)} - ${maxAFR.toFixed(2)}`);
      console.log(`  Max MAP: ${maxMAP.toFixed(1)} kPa`);
      console.log(`  WOT samples (TPS >= 72°): ${wotSamples}`);
      
      // Find WOT runs
      console.log('\n  --- WOT Run Analysis (TPS >= 72°) ---');
      let inWOT = false;
      let wotStart = -1;
      let wotRuns = [];
      
      for (let row = 0; row < totalRows; row++) {
        const base = startOffset + row * stride * 4;
        const rpm = view.getFloat32(base + rpmIdx * 4, true);
        const tps = view.getFloat32(base + tpsIdx * 4, true);
        
        if (tps >= 72 && rpm > 2000) {
          if (!inWOT) {
            wotStart = row;
            inWOT = true;
          }
        } else {
          if (inWOT) {
            const duration = row - wotStart;
            wotRuns.push({ start: wotStart, end: row, duration });
            inWOT = false;
          }
        }
      }
      if (inWOT) {
        wotRuns.push({ start: wotStart, end: totalRows, duration: totalRows - wotStart });
      }
      
      console.log(`  Found ${wotRuns.length} WOT runs:`);
      for (const run of wotRuns) {
        const startBase = startOffset + run.start * stride * 4;
        const endBase = startOffset + (run.end - 1) * stride * 4;
        const startRPM = view.getFloat32(startBase + rpmIdx * 4, true);
        const endRPM = view.getFloat32(endBase + rpmIdx * 4, true);
        const durationSec = run.duration / 20; // assuming 20Hz
        console.log(`    Run: rows ${run.start}-${run.end}, duration=${durationSec.toFixed(1)}s, RPM ${startRPM.toFixed(0)}-${endRPM.toFixed(0)}`);
      }
      
      break;
    }
  }
}
