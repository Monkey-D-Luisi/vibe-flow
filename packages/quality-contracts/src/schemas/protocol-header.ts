/**
 * Protocol version management for inter-agent communication.
 *
 * Provides the current protocol version constant, version parsing,
 * and compatibility checking between sender and receiver versions.
 */

/** Current protocol version. Bumped on breaking changes (major), new features (minor), or fixes (patch). */
export const CURRENT_PROTOCOL_VERSION = '1.0.0';

export interface VersionCheckResult {
  /** Whether the versions are compatible. */
  readonly compatible: boolean;
  /** Reason for the compatibility result. */
  readonly reason: 'exact_match' | 'minor_forward_compat' | 'major_mismatch';
}

/**
 * Parse a semver-like version string into its components.
 * Returns undefined if the string is not a valid version.
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Check version compatibility between sender and receiver protocol versions.
 *
 * Rules:
 * - Same major version → compatible (exact or minor forward-compat)
 * - Different major version → incompatible (major_mismatch)
 */
export function checkVersionCompatibility(
  senderVersion: string,
  receiverVersion: string,
): VersionCheckResult {
  const sender = parseVersion(senderVersion);
  const receiver = parseVersion(receiverVersion);

  // If either version is unparseable, treat as major mismatch
  if (!sender || !receiver) {
    return { compatible: false, reason: 'major_mismatch' };
  }

  if (sender.major !== receiver.major) {
    return { compatible: false, reason: 'major_mismatch' };
  }

  if (sender.minor === receiver.minor && sender.patch === receiver.patch) {
    return { compatible: true, reason: 'exact_match' };
  }

  return { compatible: true, reason: 'minor_forward_compat' };
}
