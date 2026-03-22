/**
 * @cerebrex/registry — Registry API Client
 * Handles all communication with the CerebreX package registry.
 */

import type { RegistryPackage } from '@cerebrex/types';
import { RegistryError } from '@cerebrex/core';

const DEFAULT_REGISTRY_URL = 'https://registry.cerebrex.dev';

export class RegistryClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(options?: { registryUrl?: string; authToken?: string }) {
    this.baseUrl = options?.registryUrl || DEFAULT_REGISTRY_URL;
    if (options?.authToken) this.authToken = options.authToken;
  }

  // ── Search ───────────────────────────────────────────────────────────────────
  async search(query: string, limit = 20): Promise<RegistryPackage[]> {
    const url = new URL(`${this.baseUrl}/api/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    const res = await this.fetch(url.toString());
    const data = await res.json() as { packages: RegistryPackage[] };
    return data.packages;
  }

  // ── Get Package ──────────────────────────────────────────────────────────────
  async getPackage(name: string, version = 'latest'): Promise<RegistryPackage> {
    const res = await this.fetch(`${this.baseUrl}/api/packages/${encodeURIComponent(name)}/${version}`);
    return res.json() as Promise<RegistryPackage>;
  }

  // ── Publish ──────────────────────────────────────────────────────────────────
  async publish(tarball: Buffer, manifest: Partial<RegistryPackage>): Promise<{ url: string }> {
    if (!this.authToken) {
      throw new RegistryError('Authentication required to publish. Run: cerebrex auth login');
    }

    const formData = new FormData();
    formData.append('tarball', new Blob([tarball], { type: 'application/gzip' }));
    formData.append('manifest', JSON.stringify(manifest));

    const res = await this.fetch(`${this.baseUrl}/api/publish`, {
      method: 'POST',
      body: formData,
    });

    return res.json() as Promise<{ url: string }>;
  }

  // ── Download ─────────────────────────────────────────────────────────────────
  async download(name: string, version = 'latest'): Promise<Buffer> {
    const res = await this.fetch(
      `${this.baseUrl}/api/packages/${encodeURIComponent(name)}/${version}/tarball`
    );
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ── Private fetch with error handling ────────────────────────────────────────
  private async fetch(url: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': 'cerebrex-cli/0.1.0',
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...(options?.headers as Record<string, string> || {}),
    };

    const res = await globalThis.fetch(url, { ...options, headers });

    if (!res.ok) {
      // Sanitize error — never bubble raw server errors to the user
      if (res.status === 401) throw new RegistryError('Authentication failed. Run: cerebrex auth login');
      if (res.status === 404) throw new RegistryError(`Package not found`);
      if (res.status === 409) throw new RegistryError(`Version already exists in the registry`);
      if (res.status >= 500) throw new RegistryError(`Registry server error. Please try again later.`);
      throw new RegistryError(`Registry error: ${res.status}`);
    }

    return res;
  }
}
