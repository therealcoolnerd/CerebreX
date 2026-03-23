/**
 * @cerebrex/registry — Registry API Client
 * Handles all communication with the CerebreX package registry.
 */

import type { RegistryPackage } from '@cerebrex/types';
import { RegistryError } from '@cerebrex/core';

const DEFAULT_REGISTRY_URL = 'https://registry.therealcool.site';

export class RegistryClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(options?: { registryUrl?: string; authToken?: string }) {
    this.baseUrl = (options?.registryUrl || DEFAULT_REGISTRY_URL).replace(/\/$/, '');
    if (options?.authToken) this.authToken = options.authToken;
  }

  // ── Search ───────────────────────────────────────────────────────────────────
  async search(query: string, limit = 20): Promise<RegistryPackage[]> {
    const url = new URL(`${this.baseUrl}/v1/packages`);
    if (query) url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    const res = await this.apiFetch(url.toString());
    const data = await res.json() as { packages: RegistryPackage[] };
    return data.packages || [];
  }

  // ── Get Package ──────────────────────────────────────────────────────────────
  async getPackage(name: string, version = 'latest'): Promise<RegistryPackage> {
    const res = await this.apiFetch(
      `${this.baseUrl}/v1/packages/${encodeURIComponent(name)}/${version}`
    );
    return res.json() as Promise<RegistryPackage>;
  }

  // ── Publish ──────────────────────────────────────────────────────────────────
  async publish(
    tarball: Buffer,
    manifest: { name?: string; version?: string; description?: string; tags?: string[] }
  ): Promise<{ url: string }> {
    if (!this.authToken) {
      throw new RegistryError('Authentication required to publish. Run: cerebrex auth login');
    }

    // Worker expects: { name, version, description, tags, tarball: base64 }
    const body = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      tags: manifest.tags || [],
      tarball: tarball.toString('base64'),
    };

    const res = await this.apiFetch(`${this.baseUrl}/v1/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { url?: string };
    return { url: data.url || `${this.baseUrl}/v1/packages/${manifest.name}/${manifest.version}` };
  }

  // ── Download ─────────────────────────────────────────────────────────────────
  async download(name: string, version = 'latest'): Promise<Buffer> {
    const res = await this.apiFetch(
      `${this.baseUrl}/v1/packages/${encodeURIComponent(name)}/${version}/download`
    );
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ── Private fetch with error handling ────────────────────────────────────────
  private async apiFetch(url: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': 'cerebrex-cli/0.3.0',
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...(options?.headers as Record<string, string> || {}),
    };

    const res = await globalThis.fetch(url, { ...options, headers });

    if (!res.ok) {
      if (res.status === 401) throw new RegistryError('Authentication failed. Run: cerebrex auth login');
      if (res.status === 404) throw new RegistryError('Package not found');
      if (res.status === 409) throw new RegistryError('Version already exists in the registry');
      if (res.status >= 500) throw new RegistryError('Registry server error. Please try again later.');
      throw new RegistryError(`Registry error: ${res.status}`);
    }

    return res;
  }
}
