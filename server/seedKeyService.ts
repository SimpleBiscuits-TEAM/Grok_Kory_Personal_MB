import { ALGORITHM_DESCRIPTIONS, type EcuSecurityProfile } from '../shared/seedKeyAlgorithms';
import { ECU_SECURITY_PROFILES } from './seedKeyProfiles';

export function getSecurityProfile(ecuType: string): EcuSecurityProfile | undefined {
  return ECU_SECURITY_PROFILES[ecuType.toUpperCase()];
}

export function getSecuritySummary(ecuType: string): string {
  const profile = getSecurityProfile(ecuType);
  if (!profile) return `Unknown ECU type: ${ecuType}`;

  const lines = [
    `${profile.name} (${profile.manufacturer})`,
    `Algorithm: ${profile.algorithmType} — ${ALGORITHM_DESCRIPTIONS[profile.algorithmType]}`,
    `Protocol: ${profile.protocol}`,
    `Seed: ${profile.seedLength} bytes → Key: ${profile.keyLength} bytes`,
    `Security Level: ${profile.securityLevel}`,
    profile.requiresUnlockBox ? '⚠ Hardware unlock box REQUIRED' : '✓ Standard security access',
  ];
  return lines.join('\n');
}
