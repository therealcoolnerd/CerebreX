/**
 * JWT — signToken / verifyToken
 * Tests the HIVE coordinator's custom HMAC-SHA256 JWT implementation.
 */

import { describe, it, expect } from 'bun:test';
import { signToken, verifyToken } from '../commands/hive.js';

const SECRET = 'test-secret-at-least-32-chars-long!!';

describe('signToken', () => {
  it('produces a 3-part dot-delimited string', () => {
    const token = signToken({ sub: 'agent-1', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    expect(token.split('.')).toHaveLength(3);
  });

  it('encodes alg=HS256 and typ=JWT in header', () => {
    const token = signToken({}, SECRET);
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });

  it('includes kid in header', () => {
    const token = signToken({}, SECRET);
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    expect(header.kid).toBeDefined();
  });

  it('injects jti (unique ID) into every token', () => {
    const t1 = signToken({ sub: 'x' }, SECRET);
    const t2 = signToken({ sub: 'x' }, SECRET);
    const p1 = JSON.parse(Buffer.from(t1.split('.')[1], 'base64url').toString());
    const p2 = JSON.parse(Buffer.from(t2.split('.')[1], 'base64url').toString());
    expect(p1.jti).toBeDefined();
    expect(p2.jti).toBeDefined();
    expect(p1.jti).not.toBe(p2.jti);
  });

  it('injects nbf claim', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signToken({}, SECRET);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.nbf).toBeGreaterThanOrEqual(before);
  });
});

describe('verifyToken', () => {
  it('verifies a freshly signed token', () => {
    const token = signToken({ sub: 'agent-1' }, SECRET);
    const payload = verifyToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect((payload as any).sub).toBe('agent-1');
  });

  it('returns null for wrong secret', () => {
    const token = signToken({ sub: 'x' }, SECRET);
    expect(verifyToken(token, 'wrong-secret')).toBeNull();
  });

  it('returns null for tampered payload', () => {
    const token = signToken({ sub: 'agent-1', role: 'user' }, SECRET);
    const [h, , s] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: 'admin', role: 'admin', jti: 'x', nbf: 0 })).toString('base64url');
    expect(verifyToken(`${h}.${evil}.${s}`, SECRET)).toBeNull();
  });

  it('returns null for tampered header', () => {
    const token = signToken({}, SECRET);
    const [, b, s] = token.split('.');
    const evilHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyToken(`${evilHeader}.${b}.${s}`, SECRET)).toBeNull();
  });

  it('returns null when alg is not HS256', async () => {
    const payload = { sub: 'x', nbf: 0 };
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    expect(verifyToken(`${header}.${body}.${sig}`, SECRET)).toBeNull();
  });

  it('returns null for expired token', () => {
    const token = signToken({ sub: 'x', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('returns null for token with nbf in the future', async () => {
    const token = signToken({ sub: 'x' }, SECRET);
    // Manually craft a token with nbf far in the future
    const [h] = token.split('.');
    const futurePayload = { sub: 'x', nbf: Math.floor(Date.now() / 1000) + 9999, jti: 'test' };
    const body = Buffer.from(JSON.stringify(futurePayload)).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update(`${h}.${body}`).digest('base64url');
    expect(verifyToken(`${h}.${body}.${sig}`, SECRET)).toBeNull();
  });

  it('returns null for a malformed token (wrong segment count)', () => {
    expect(verifyToken('not.a.valid.jwt.at.all', SECRET)).toBeNull();
    expect(verifyToken('only.two', SECRET)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyToken('', SECRET)).toBeNull();
  });
});
