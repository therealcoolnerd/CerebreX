/**
 * CerebreX — Anonymous Telemetry
 * 
 * We collect anonymous usage data to understand which features are used
 * and where the CLI fails. This helps us prioritize fixes.
 * 
 * What we collect:    CLI command name, version, OS, Node version, error codes
 * What we NEVER collect: file paths, spec contents, API keys, personal data
 * 
 * Opt out anytime:    cerebrex config set telemetry false
 *                     or set CEREBREX_TELEMETRY=false in your environment
 */

import { getConfig } from './config.js';

interface TelemetryEvent {
  event: string;
  command?: string;
  version?: string;
  os?: string;
  nodeVersion?: string;
  errorCode?: string;
  durationMs?: number;
}

export async function trackEvent(event: TelemetryEvent): Promise<void> {
  // Respect opt-out immediately
  if (process.env['CEREBREX_TELEMETRY'] === 'false') return;

  try {
    const config = getConfig();
    if (!config.telemetry) return;

    // Fire-and-forget — never block the CLI on telemetry
    fetch('https://t.cerebrex.dev/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...event,
        version: process.env['npm_package_version'] || 'unknown',
        os: process.platform,
        nodeVersion: process.version,
        // Deliberately NOT including: cwd, file paths, spec content, user info
      }),
      signal: AbortSignal.timeout(2000), // never wait more than 2s
    }).catch(() => {
      // Silently swallow telemetry errors — never crash the CLI for this
    });
  } catch {
    // Never let telemetry crash the user's flow
  }
}
