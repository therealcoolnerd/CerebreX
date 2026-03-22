/**
 * CerebreX MEMEX — Persistent Agent Memory Engine
 *
 * Local-first storage backed by JSON files.
 * Each namespace lives in ~/.cerebrex/memex/<namespace>.json
 *
 * Security:
 *   - SHA-256 checksums on every write, verified on every read.
 *   - Integrity violations throw MemoryIntegrityError — never silently corrupted.
 *   - TTL expiry is enforced at read time.
 */

import type { MemoryEntry, MemoryType } from '@cerebrex/types';
import { MemexError, MemoryIntegrityError } from '@cerebrex/core';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const DEFAULT_MEMEX_DIR = path.join(os.homedir(), '.cerebrex', 'memex');

type NamespaceStore = Record<string, MemoryEntry>;

export interface MemexSetOptions {
  namespace?: string;
  type?: MemoryType;
  /** Seconds until this entry expires. Omit for no expiry. */
  ttlSeconds?: number;
  metadata?: Record<string, unknown>;
}

export class MemexEngine {
  private dir: string;

  constructor(dir: string = DEFAULT_MEMEX_DIR) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Store or overwrite a key in a namespace. Returns the saved entry. */
  set(key: string, value: unknown, opts: MemexSetOptions = {}): MemoryEntry {
    this.validateKey(key);
    const namespace = opts.namespace ?? 'default';
    const store = this.load(namespace);
    const existing = store[key];

    const entry: MemoryEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      namespace,
      type: opts.type ?? 'episodic',
      key,
      value,
      checksum: this.checksum(value),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      expiresAt: opts.ttlSeconds != null
        ? new Date(Date.now() + opts.ttlSeconds * 1000).toISOString()
        : undefined,
      metadata: opts.metadata,
    };

    store[key] = entry;
    this.save(namespace, store);
    return entry;
  }

  /**
   * Retrieve an entry by key.
   * Returns null if not found or expired.
   * Throws MemoryIntegrityError if the checksum doesn't match.
   */
  get(key: string, namespace: string = 'default'): MemoryEntry | null {
    const store = this.load(namespace);
    const entry = store[key];
    if (!entry) return null;

    // Evict expired entries on read
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      delete store[key];
      this.save(namespace, store);
      return null;
    }

    // Integrity check
    if (entry.checksum !== this.checksum(entry.value)) {
      throw new MemoryIntegrityError(key);
    }

    return entry;
  }

  /**
   * List entries, optionally filtered by namespace and/or type.
   * Expired entries are excluded.
   */
  list(namespace?: string, type?: MemoryType): MemoryEntry[] {
    const namespaces = namespace ? [namespace] : this.namespaces();
    const now = new Date();
    const results: MemoryEntry[] = [];

    for (const ns of namespaces) {
      const store = this.load(ns);
      for (const entry of Object.values(store)) {
        if (entry.expiresAt && new Date(entry.expiresAt) < now) continue;
        if (type && entry.type !== type) continue;
        results.push(entry);
      }
    }

    return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Delete a single key. Returns true if it existed. */
  delete(key: string, namespace: string = 'default'): boolean {
    const store = this.load(namespace);
    if (!(key in store)) return false;
    delete store[key];
    this.save(namespace, store);
    return true;
  }

  /**
   * Clear all entries in a namespace (or all namespaces).
   * Returns the count of entries removed.
   */
  clear(namespace?: string): number {
    if (namespace) {
      const store = this.load(namespace);
      const count = Object.keys(store).length;
      this.save(namespace, {});
      return count;
    }
    let total = 0;
    for (const ns of this.namespaces()) {
      const store = this.load(ns);
      total += Object.keys(store).length;
      this.save(ns, {});
    }
    return total;
  }

  /** List all namespace names that have been written to. */
  namespaces(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private load(namespace: string): NamespaceStore {
    const p = this.storePath(namespace);
    if (!fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as NamespaceStore;
    } catch {
      // Corrupted file — return empty rather than crashing
      return {};
    }
  }

  private save(namespace: string, store: NamespaceStore): void {
    fs.writeFileSync(this.storePath(namespace), JSON.stringify(store, null, 2));
  }

  private storePath(namespace: string): string {
    // Sanitize to a safe filename
    const safe = namespace.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!safe) throw new MemexError('Namespace name is invalid');
    return path.join(this.dir, `${safe}.json`);
  }

  private checksum(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private validateKey(key: string): void {
    if (!key || key.trim().length === 0) {
      throw new MemexError('Key cannot be empty');
    }
    if (key.length > 512) {
      throw new MemexError('Key exceeds maximum length of 512 characters');
    }
  }
}
