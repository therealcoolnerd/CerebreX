/**
 * CerebreX AUTH — Risk Classification Gate
 *
 * Every agent action is classified as LOW / MEDIUM / HIGH risk
 * before execution. Evaluation order: Deny → Ask → Allow.
 *
 * Denial reasons are surfaced to the caller so the agent can
 * adjust its plan rather than silently failing.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskPolicy {
  allowLow: boolean;
  allowMedium: boolean;
  allowHigh: boolean;
}

export interface GateResult {
  allowed: boolean;
  risk: RiskLevel;
  reason?: string;
}

export const DEFAULT_POLICY: RiskPolicy = {
  allowLow: true,
  allowMedium: true,
  allowHigh: false,
};

// ── Risk classification table ─────────────────────────────────────────────────

const TOOL_RISK: Record<string, RiskLevel> = {
  // Read-only — always safe
  noop:            'low',
  echo:            'low',
  'memex-get':     'low',
  status:          'low',
  list:            'low',
  search:          'low',
  read:            'low',
  'trace-view':    'low',

  // Side-effects — confirm before running in automated contexts
  fetch:           'medium',
  'memex-set':     'medium',
  write:           'medium',
  update:          'medium',
  configure:       'medium',
  'trace-start':   'medium',
  'trace-stop':    'medium',
  'kairos-action': 'medium',   // daemon-generated structured task; side-effects depend on sub-type
  'claude-execute':'medium',   // Claude subtask; reads/writes MEMEX but no irreversible ops

  // Irreversible / high-blast-radius — explicit opt-in required
  delete:          'high',
  destroy:         'high',
  'memex-delete':  'high',
  deploy:          'high',
  publish:         'high',
  send:            'high',
  'hive-send':     'high',
  'ultraplan':     'high',
  'daemon-start':  'high',
  'daemon-stop':   'high',
};

/** Classify the risk level of a tool/task type. Defaults to 'high' for unknowns. */
export function classifyRisk(toolName: string): RiskLevel {
  const normalized = toolName.toLowerCase().trim();
  return TOOL_RISK[normalized] ?? 'high';
}

/**
 * Gate an action against a risk policy.
 *
 * @param toolName  The tool or task type being executed
 * @param policy    The caller's allowed risk policy (defaults to DEFAULT_POLICY)
 * @returns         GateResult — check .allowed before proceeding
 *
 * @example
 * const gate = gateAction('delete', { ...DEFAULT_POLICY });
 * if (!gate.allowed) {
 *   console.error(`Blocked: ${gate.reason}`);
 *   process.exit(1);
 * }
 */
export function gateAction(
  toolName: string,
  policy: RiskPolicy = DEFAULT_POLICY
): GateResult {
  const risk = classifyRisk(toolName);

  // Evaluation order: Deny → Ask → Allow
  if (risk === 'high' && !policy.allowHigh) {
    return {
      allowed: false,
      risk,
      reason: `"${toolName}" is classified HIGH risk. Pass --allow-high-risk to enable.`,
    };
  }
  if (risk === 'medium' && !policy.allowMedium) {
    return {
      allowed: false,
      risk,
      reason: `"${toolName}" is classified MEDIUM risk. Pass --allow-medium-risk to enable.`,
    };
  }
  if (risk === 'low' && !policy.allowLow) {
    return {
      allowed: false,
      risk,
      reason: `"${toolName}" is classified LOW risk but all actions are blocked by policy.`,
    };
  }

  return { allowed: true, risk };
}

/** Build a policy object from CLI flags. */
export function buildPolicy(flags: {
  allowHighRisk?: boolean;
  allowMediumRisk?: boolean;
}): RiskPolicy {
  return {
    allowLow: true,
    allowMedium: flags.allowMediumRisk ?? true,
    allowHigh: flags.allowHighRisk ?? false,
  };
}
