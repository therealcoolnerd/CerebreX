/**
 * MEMEX — MemexEngine
 * Tests persistent memory storage, SHA-256 checksum integrity,
 * TTL expiry, and namespace isolation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MemexEngine } from '../core/memex/engine.js';
import { MemoryIntegrityError } from '@cerebrex/core';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';

// Use a fresh temp directory per test run
const testDir = path.join(os.tmpdir(), `cerebrex-memex-test-${crypto.randomUUID()}`);

let engine: MemexEngine;

beforeEach(() => {
  engine = new MemexEngine(testDir);
});

// Cleanup after all tests
process.on('exit', () => {
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('MemexEngine — set/get', () => {
  it('stores and retrieves a string value', () => {
    engine.set('greeting', 'hello world');
    const entry = engine.get('greeting');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('hello world');
  });

  it('stores and retrieves an object value', () => {
    const val = { name: 'Alice', score: 42, tags: ['a', 'b'] };
    engine.set('user', val);
    const entry = engine.get('user');
    expect(entry!.value).toEqual(val);
  });

  it('returns null for a missing key', () => {
    expect(engine.get('nonexistent')).toBeNull();
  });

  it('overwrites an existing key and preserves createdAt', () => {
    engine.set('counter', 1);
    const first = engine.get('counter')!;
    engine.set('counter', 2);
    const second = engine.get('counter')!;
    expect(second.value).toBe(2);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.id).toBe(first.id);
  });
});

describe('MemexEngine — checksum integrity', () => {
  it('entry has a sha256 checksum', () => {
    engine.set('data', { x: 1 });
    const entry = engine.get('data')!;
    expect(entry.checksum).toHaveLength(64); // hex sha256
  });

  it('throws MemoryIntegrityError if stored value is tampered externally', () => {
    engine.set('secret', 'real-value');

    // Directly tamper with the JSON file
    const nsFile = path.join(testDir, 'default.json');
    const raw = JSON.parse(fs.readFileSync(nsFile, 'utf-8'));
    raw['secret'].value = 'tampered-value'; // change value but keep old checksum
    fs.writeFileSync(nsFile, JSON.stringify(raw));

    expect(() => engine.get('secret')).toThrow(MemoryIntegrityError);
  });
});

describe('MemexEngine — TTL expiry', () => {
  it('returns null for an expired entry', async () => {
    engine.set('temp', 'will-expire', { ttlSeconds: 0.001 }); // 1ms
    await new Promise(r => setTimeout(r, 10));
    expect(engine.get('temp')).toBeNull();
  });

  it('returns the value before expiry', () => {
    engine.set('lasting', 'still-here', { ttlSeconds: 3600 });
    expect(engine.get('lasting')!.value).toBe('still-here');
  });
});

describe('MemexEngine — namespace isolation', () => {
  it('keys in different namespaces do not collide', () => {
    engine.set('key', 'ns-a-value', { namespace: 'ns-a' });
    engine.set('key', 'ns-b-value', { namespace: 'ns-b' });
    expect(engine.get('key', 'ns-a')!.value).toBe('ns-a-value');
    expect(engine.get('key', 'ns-b')!.value).toBe('ns-b-value');
  });

  it('lists entries only from the requested namespace', () => {
    engine.set('a', 1, { namespace: 'alpha' });
    engine.set('b', 2, { namespace: 'beta' });
    const alphaEntries = engine.list('alpha');
    expect(alphaEntries).toHaveLength(1);
    expect(alphaEntries[0].value).toBe(1);
  });
});

describe('MemexEngine — delete and clear', () => {
  it('delete removes a key and returns true', () => {
    engine.set('removeme', 42);
    expect(engine.delete('removeme')).toBe(true);
    expect(engine.get('removeme')).toBeNull();
  });

  it('delete returns false for a missing key', () => {
    expect(engine.delete('does-not-exist')).toBe(false);
  });

  it('clear removes all entries in a namespace', () => {
    engine.set('x', 1, { namespace: 'wipe' });
    engine.set('y', 2, { namespace: 'wipe' });
    const count = engine.clear('wipe');
    expect(count).toBe(2);
    expect(engine.list('wipe')).toHaveLength(0);
  });
});

describe('MemexEngine — key validation', () => {
  it('throws on empty key', () => {
    expect(() => engine.set('', 'val')).toThrow();
    expect(() => engine.set('   ', 'val')).toThrow();
  });

  it('throws on key exceeding 512 chars', () => {
    expect(() => engine.set('x'.repeat(513), 'val')).toThrow();
  });

  it('accepts a key exactly 512 chars long', () => {
    expect(() => engine.set('x'.repeat(512), 'val')).not.toThrow();
  });
});
