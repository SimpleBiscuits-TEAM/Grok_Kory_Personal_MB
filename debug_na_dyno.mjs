import { readFileSync } from 'fs';

// Read the WP8 file
const buf = readFileSync('/home/ubuntu/vop/test_na_id1050.wp8');
const text = buf.toString('utf-8');

// Parse channels
const lines = text.split('\n');
const channels = {};
let currentChannel = null;
let dataSection = false;

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    currentChannel = trimmed.slice(1, -1);
    channels[currentChannel] = { meta: {}, data: [] };
    dataSection = false;
  } else if (currentChannel) {
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (trimmed.includes('=') && !dataSection) {
      const [k, v] = trimmed.split('=').map(s => s.trim());
      channels[currentChannel].meta[k] = v;
    } else {
      dataSection = true;
      const val = parseFloat(trimmed);
      if (!isNaN(val)) channels[currentChannel].data.push(val);
    }
  }
}

console.log('=== CHANNELS ===');
for (const [name, ch] of Object.entries(channels)) {
  console.log(`${name}: ${ch.data.length} samples, meta:`, JSON.stringify(ch.meta));
}

// Find key channels
const rpmCh = Object.entries(channels).find(([n]) => n.toLowerCase().includes('rpm'));
const mapCh = Object.entries(channels).find(([n]) => n.toLowerCase().includes('map') || n.toLowerCase().includes('manifold'));
const tpsCh = Object.entries(channels).find(([n]) => n.toLowerCase().includes('tps') || n.toLowerCase().includes('throttle'));
const injCh = Object.entries(channels).find(([n]) => n.toLowerCase().includes('inj') || n.toLowerCase().includes('pulse'));
const afrCh = Object.entries(channels).find(([n]) => n.toLowerCase().includes('afr') || n.toLowerCase().includes('lambda') || n.toLowerCase().includes('o2'));
const baroCh = Object.entries(channels).find(([n]) => n.toLowerCase().includes('baro'));

console.log('\n=== KEY CHANNELS ===');
if (rpmCh) console.log(`RPM: ${rpmCh[0]} (${rpmCh[1].data.length} samples, range: ${Math.min(...rpmCh[1].data)}-${Math.max(...rpmCh[1].data)})`);
if (mapCh) console.log(`MAP: ${mapCh[0]} (range: ${Math.min(...mapCh[1].data)}-${Math.max(...mapCh[1].data)})`);
if (tpsCh) console.log(`TPS: ${tpsCh[0]} (range: ${Math.min(...tpsCh[1].data)}-${Math.max(...tpsCh[1].data)})`);
if (injCh) console.log(`INJ: ${injCh[0]} (range: ${Math.min(...injCh[1].data)}-${Math.max(...injCh[1].data)})`);
if (afrCh) console.log(`AFR: ${afrCh[0]} (range: ${Math.min(...afrCh[1].data)}-${Math.max(...afrCh[1].data)})`);
if (baroCh) console.log(`BARO: ${baroCh[0]} (range: ${Math.min(...baroCh[1].data)}-${Math.max(...baroCh[1].data)})`);

// Now trace the virtual dyno calculation
// The formula is: HP = (injFlowRate * numInjectors * injDutyCycle * fuelDensity) / BSFC
// Where injDutyCycle = injPW / (60000 / RPM / 2)  for 4-stroke
// And BSFC is the calibration factor

const INJECTOR_FLOW_RATES = {
  stock: 192,
  id1050: 1050,
  id1300: 1300,
  jr_kit: 345,
  kw800: 800,
};

const injFlowRate = INJECTOR_FLOW_RATES.id1050; // 1050 cc/min
const numInjectors = 2; // Honda Talon is 2-cylinder
const fuelDensity = 0.755; // kg/L for gasoline

// BSFC factors from the code
const NA_BSFC = {
  stock: { pump: 0.50, ethanol: 0.52 },
  id1050: { pump: 0.50, ethanol: 0.52 },
  id1300: { pump: 0.50, ethanol: 0.52 },
};

console.log('\n=== VIRTUAL DYNO TRACE ===');
console.log(`Injector: ID1050X (${injFlowRate} cc/min)`);
console.log(`Turbo: NA (No Turbo)`);
console.log(`Fuel: Pump Gas`);

// Find WOT runs (TPS > 90%)
if (rpmCh && injCh) {
  const rpm = rpmCh[1].data;
  const inj = injCh[1].data;
  const tps = tpsCh ? tpsCh[1].data : null;
  const map = mapCh ? mapCh[1].data : null;
  const afr = afrCh ? afrCh[1].data : null;
  
  const len = Math.min(rpm.length, inj.length);
  
  // Sample some high-RPM data points
  console.log('\n--- High RPM samples (RPM > 7000) ---');
  let count = 0;
  for (let i = 0; i < len && count < 20; i++) {
    if (rpm[i] > 7000 && inj[i] > 2) {
      const rpmVal = rpm[i];
      const injPW = inj[i]; // ms
      
      // Calculate duty cycle: injPW / cyclePeriod
      // cyclePeriod = 60000 / RPM / 2 (for 4-stroke, 2 events per cycle... wait, 
      // for a 2-cyl 4-stroke: each injector fires once per 720° crank rotation
      // cyclePeriod = 60000 / RPM * 2 (ms per injection event)
      // Actually: cyclePeriod = (60 / RPM) * 1000 * 2 = 120000 / RPM ms
      // No wait: for sequential injection, each injector fires once per engine cycle (720°)
      // Period per injection = 60000 / (RPM / 2) = 120000 / RPM ms
      
      const cyclePeriod = 120000 / rpmVal; // ms per injection event
      const dutyCycle = injPW / cyclePeriod;
      
      // Fuel flow rate per injector: flowRate(cc/min) * dutyCycle
      // Total fuel flow: numInjectors * flowRate * dutyCycle (cc/min)
      const fuelFlowCCMin = numInjectors * injFlowRate * dutyCycle;
      const fuelFlowKgHr = fuelFlowCCMin * fuelDensity * 60 / 1000;
      
      // HP = fuelFlowKgHr / BSFC
      const bsfc = 0.50;
      const hp = fuelFlowKgHr / bsfc;
      
      // Torque = HP * 5252 / RPM
      const torque = hp * 5252 / rpmVal;
      
      const tpsVal = tps ? tps[i] : 'N/A';
      const mapVal = map ? map[i] : 'N/A';
      const afrVal = afr ? afr[i] : 'N/A';
      
      console.log(`i=${i} RPM=${rpmVal.toFixed(0)} InjPW=${injPW.toFixed(2)}ms DC=${(dutyCycle*100).toFixed(1)}% FuelFlow=${fuelFlowKgHr.toFixed(2)}kg/hr HP=${hp.toFixed(1)} TQ=${torque.toFixed(1)} TPS=${typeof tpsVal === 'number' ? tpsVal.toFixed(1) : tpsVal} MAP=${typeof mapVal === 'number' ? mapVal.toFixed(1) : mapVal} AFR=${typeof afrVal === 'number' ? afrVal.toFixed(1) : afrVal}`);
      count++;
    }
  }
  
  // Also check peak RPM area
  console.log('\n--- Peak RPM area (RPM > 9000) ---');
  count = 0;
  for (let i = 0; i < len && count < 10; i++) {
    if (rpm[i] > 9000 && inj[i] > 2) {
      const rpmVal = rpm[i];
      const injPW = inj[i];
      const cyclePeriod = 120000 / rpmVal;
      const dutyCycle = injPW / cyclePeriod;
      const fuelFlowCCMin = numInjectors * injFlowRate * dutyCycle;
      const fuelFlowKgHr = fuelFlowCCMin * fuelDensity * 60 / 1000;
      const hp = fuelFlowKgHr / 0.50;
      const torque = hp * 5252 / rpmVal;
      
      console.log(`RPM=${rpmVal.toFixed(0)} InjPW=${injPW.toFixed(2)}ms DC=${(dutyCycle*100).toFixed(1)}% HP=${hp.toFixed(1)} TQ=${torque.toFixed(1)}`);
      count++;
    }
  }
}
