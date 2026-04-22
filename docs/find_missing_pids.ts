import { ALL_PIDS, PID_PRESETS } from '../client/src/lib/obdConnection';

const validPids = new Set(ALL_PIDS.map(p => p.pid));
for (const preset of PID_PRESETS) {
  for (const pid of preset.pids) {
    if (!validPids.has(pid)) {
      console.log(`Preset '${preset.name}' has missing PID 0x${pid.toString(16).toUpperCase()}`);
    }
  }
}
