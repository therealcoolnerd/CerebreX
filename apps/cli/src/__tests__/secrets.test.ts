/**
 * Secret Detection — findHardcodedSecret
 * Tests the validate command's regex-based secret scanner.
 */

import { describe, it, expect } from 'bun:test';
import { findHardcodedSecret } from '../commands/other-commands.js';

describe('findHardcodedSecret — detects known patterns', () => {
  it('detects OpenAI/Anthropic sk- keys', () => {
    expect(findHardcodedSecret('const key = "sk-abcdefghij1234567890XYZ"')).not.toBeNull();
    expect(findHardcodedSecret('apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz1234"')).not.toBeNull();
  });

  it('detects Google API keys', () => {
    expect(findHardcodedSecret('AIzaSyDAbcDefGHIJklmNOpqRSTuvwXYZ12345678')).not.toBeNull();
  });

  it('detects GitHub PATs (ghp_)', () => {
    // Pattern: ghp_ + exactly 36 alphanumeric chars
    expect(findHardcodedSecret('const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"')).not.toBeNull();
  });

  it('detects Slack bot tokens (xoxb-)', () => {
    // Split across concatenation so GitHub push protection doesn't flag source
    const fakeSlack = 'xoxb-' + '12345678901-12345678901-abcdefghijklmnopqrstuvwx';
    expect(findHardcodedSecret(`token: "${fakeSlack}"`)).not.toBeNull();
  });

  it('detects hardcoded password assignments', () => {
    expect(findHardcodedSecret('password = "supersecret123"')).not.toBeNull();
    expect(findHardcodedSecret("passwd: 'hunter2hunter2'")).not.toBeNull();
    expect(findHardcodedSecret('api_key = "real-api-key-here"')).not.toBeNull();
    expect(findHardcodedSecret('apikey = "real-api-key-here"')).not.toBeNull();
    expect(findHardcodedSecret('secret = "my-secret-value"')).not.toBeNull();
  });

  it('detects hardcoded Bearer tokens', () => {
    expect(findHardcodedSecret('Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature"')).not.toBeNull();
  });
});

describe('findHardcodedSecret — no false positives on safe content', () => {
  it('allows env var references', () => {
    expect(findHardcodedSecret('const key = process.env.API_KEY')).toBeNull();
    expect(findHardcodedSecret('Authorization: `Bearer ${this.env.API_KEY}`')).toBeNull();
  });

  it('allows placeholder comments', () => {
    expect(findHardcodedSecret('// API_KEY=your-api-key-here')).toBeNull();
    expect(findHardcodedSecret('# secret=<your-secret>')).toBeNull();
  });

  it('allows short values that look like config keys', () => {
    expect(findHardcodedSecret('password = "short"')).toBeNull();  // < 8 chars
  });

  it('allows normal code without secrets', () => {
    const safeCode = `
      import { z } from 'zod';
      const schema = z.object({ name: z.string() });
      async function handler(req: Request) {
        const token = req.headers.get('Authorization');
        if (!token) throw new Error('Unauthorized');
      }
    `;
    expect(findHardcodedSecret(safeCode)).toBeNull();
  });

  it('allows wrangler.toml binding declarations', () => {
    const wranglerToml = `
name = "my-worker"
[vars]
ENVIRONMENT = "production"
[[d1_databases]]
binding = "DB"
database_id = "abc123"
    `;
    expect(findHardcodedSecret(wranglerToml)).toBeNull();
  });
});
