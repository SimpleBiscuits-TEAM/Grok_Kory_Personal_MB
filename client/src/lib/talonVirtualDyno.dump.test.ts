
import { describe, it } from 'vitest';
import fs from 'fs';
import { parseWP8, getHondaTalonKeyChannels } from './wp8Parser';
import { calculateFuelFlow, estimateHP, estimateHPWithBoost, FUEL_PROFILES, INJECTOR_FLOW_RATES } from './talonVirtualDyno';

describe('dump WOT data', () => {
  it('dumps WOT points', () => {
    const buffer = fs.readFileSync('/home/ubuntu/upload/PPEI_JR_ID1050s_93oct_Rev_0_7_0804580401_LOG_1.wp8');
    const wp8 = parseWP8(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const keys = getHondaTalonKeyChannels(wp8);
    
    console.log('Channel names:', wp8.channels.map((c,i) => i + ':' + c.name).join(', '));
    console.log('');
    console.log('Key channels:');
    console.log('  engineSpeed:', keys.engineSpeed, keys.engineSpeed >= 0 ? wp8.channels[keys.engineSpeed].name : 'N/A');
    console.log('  throttlePosition:', keys.throttlePosition, keys.throttlePosition >= 0 ? wp8.channels[keys.throttlePosition].name : 'N/A');
    console.log('  injPwDesired:', keys.injPwDesired, keys.injPwDesired >= 0 ? wp8.channels[keys.injPwDesired].name : 'N/A');
    console.log('  injPwFinal:', keys.injPwFinal, keys.injPwFinal >= 0 ? wp8.channels[keys.injPwFinal].name : 'N/A');
    console.log('  map:', keys.map, keys.map >= 0 ? wp8.channels[keys.map].name : 'N/A');
    console.log('  mapCorrected:', keys.mapCorrected, keys.mapCorrected >= 0 ? wp8.channels[keys.mapCorrected].name : 'N/A');
    console.log('  honda3BarMap:', keys.honda3BarMap, keys.honda3BarMap >= 0 ? wp8.channels[keys.honda3BarMap].name : 'N/A');
    console.log('  afr1:', keys.afr1, keys.afr1 >= 0 ? wp8.channels[keys.afr1].name : 'N/A');
    console.log('  lambda1:', keys.lambda1, keys.lambda1 >= 0 ? wp8.channels[keys.lambda1].name : 'N/A');
    console.log('  vehicleSpeed:', keys.vehicleSpeed, keys.vehicleSpeed >= 0 ? wp8.channels[keys.vehicleSpeed].name : 'N/A');
    
    const rpmIdx = keys.engineSpeed;
    const tpsIdx = keys.throttlePosition;
    const ipwIdx = keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired;
    const mapIdx = keys.mapCorrected >= 0 ? keys.mapCorrected : keys.map;
    const afrIdx = keys.afr1;
    const lambdaIdx = keys.lambda1;
    
    console.log('');
    console.log('=== WOT Data (TPS > 70, RPM > 5000) ===');
    
    const fuel = FUEL_PROFILES['pump'];
    const injFlow = INJECTOR_FLOW_RATES['id1050'];
    
    let maxRPM = 0, maxIPW = 0, maxMAP = 0;
    let wotCount = 0;
    
    for (let i = 0; i < wp8.rows.length; i++) {
      const row = wp8.rows[i];
      const rpm = rpmIdx >= 0 ? row.values[rpmIdx] : 0;
      const tps = tpsIdx >= 0 ? row.values[tpsIdx] : 0;
      const ipw = ipwIdx >= 0 ? row.values[ipwIdx] : 0;
      const map = mapIdx >= 0 ? row.values[mapIdx] : 0;
      const afr = afrIdx >= 0 ? row.values[afrIdx] : 0;
      const lambda = lambdaIdx >= 0 ? row.values[lambdaIdx] : 0;
      
      if (tps > 70 && rpm > 5000) {
        wotCount++;
        if (wotCount <= 10 || wotCount % 20 === 0) {
          const fuelFlow = calculateFuelFlow(ipw, rpm, injFlow, fuel.density);
          const hpOld = estimateHP(fuelFlow, fuel.bsfc);
          const hpNew = estimateHPWithBoost(fuelFlow, fuel.bsfc, true, map);
          console.log(`Row ${i}: RPM=${rpm.toFixed(0)} TPS=${tps.toFixed(1)} IPW=${ipw.toFixed(3)}ms MAP=${map.toFixed(1)}kPa AFR=${afr.toFixed(3)} L=${lambda.toFixed(3)} | FuelFlow=${fuelFlow.toFixed(2)}g/s HP_old=${hpOld.toFixed(1)} HP_new=${hpNew.toFixed(1)}`);
        }
        if (rpm > maxRPM) maxRPM = rpm;
        if (ipw > maxIPW) maxIPW = ipw;
        if (map > maxMAP) maxMAP = map;
      }
    }
    
    console.log(`\nWOT count: ${wotCount}`);
    console.log(`Max RPM: ${maxRPM.toFixed(0)}`);
    console.log(`Max IPW: ${maxIPW.toFixed(3)} ms`);
    console.log(`Max MAP: ${maxMAP.toFixed(1)} kPa`);
  });
});
