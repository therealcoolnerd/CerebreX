/**
 * CerebreX config management
 * Stores user config at ~/.cerebrex/config.json
 * 
 * Security: API tokens are stored in OS keychain via keytar when available.
 * We NEVER write secrets to the config file in plaintext.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';

const CONFIG_DIR = path.join(os.homedir(), '.cerebrex');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface CerebreXConfig {
  version: string;
  defaultTransport: 'stdio' | 'sse' | 'streamable-http';
  defaultOutputDir: string;
  registryUrl: string;
  // NOTE: cloudflare token is NOT stored here — use `wrangler login`
}

const DEFAULTS: CerebreXConfig = {
  version: '1',
  defaultTransport: 'streamable-http',
  defaultOutputDir: './cerebrex-output',
  registryUrl: 'https://registry.therealcool.site',
};

export function getConfig(): CerebreXConfig {
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Partial<CerebreXConfig>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(updates: Partial<CerebreXConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const current = getConfig();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...updates }, null, 2));
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
