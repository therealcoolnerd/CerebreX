/**
 * Publish all built MCP packages to the CerebreX registry.
 */

import { readFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const REGISTRY = 'https://registry.therealcool.site';

const credsPath = join(os.homedir(), '.cerebrex', '.credentials');
const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
const TOKEN = creds.token;

console.log(`Registry: ${REGISTRY}`);
console.log(`User: ${creds.username}`);

const PACKAGES = ['hive-mcp', 'fetch-mcp', 'datetime-mcp', 'kvstore-mcp'];

for (const pkgName of PACKAGES) {
  const pkgDir = join(__dir, 'packages', pkgName);
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const { name, version, description = '', keywords = [] } = pkgJson;

  console.log(`\n── Publishing ${name}@${version} ──`);

  // Stage files in a home-dir subfolder (no spaces, no drive letters for tar)
  const stageBase = join(os.homedir(), 'cbrx-stage', pkgName);
  const stageDir = join(stageBase, 'package');
  mkdirSync(stageDir, { recursive: true });

  // Copy dist + package.json + README
  cpSync(join(pkgDir, 'dist'), join(stageDir, 'dist'), { recursive: true });
  cpSync(join(pkgDir, 'package.json'), join(stageDir, 'package.json'));
  if (existsSync(join(pkgDir, 'README.md'))) {
    cpSync(join(pkgDir, 'README.md'), join(stageDir, 'README.md'));
  }

  // Create tarball in ~/cbrx-tars/ (Unix-style path avoids Windows tar C: issue)
  const tarFile = `cbrx-${pkgName}-${version}.tgz`;
  const tarPathWin = join(os.homedir(), 'cbrx-tars', tarFile);
  // tar needs unix-style paths: ~/... expands correctly in bash
  const bashPath = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';
  execSync(`mkdir -p ~/cbrx-tars && tar -czf ~/cbrx-tars/${tarFile} -C ~/cbrx-stage/${pkgName} package`, { shell: bashPath });
  console.log(`  tarball: ${tarPathWin} (${Math.round(readFileSync(tarPathWin).length / 1024)}KB)`);

  // Publish via multipart form
  const tarball = readFileSync(tarPathWin);
  const boundary = '----CerebreXBoundary' + Date.now();

  function encodeField(name, value) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  function encodeFile(fieldName, filename, data) {
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/gzip\r\n\r\n`;
    const footer = '\r\n';
    return { header: Buffer.from(header), data, footer: Buffer.from(footer) };
  }

  const fields = [
    Buffer.from(encodeField('name', name)),
    Buffer.from(encodeField('version', version)),
    Buffer.from(encodeField('description', description)),
    Buffer.from(encodeField('tags', JSON.stringify(keywords))),
  ];
  const fileEnc = encodeFile('tarball', `${pkgName}-${version}.tgz`, tarball);
  const closing = Buffer.from(`--${boundary}--\r\n`);

  const body = Buffer.concat([
    ...fields,
    fileEnc.header,
    fileEnc.data,
    fileEnc.footer,
    closing,
  ]);

  const res = await fetch(`${REGISTRY}/v1/packages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });

  const data = await res.json();
  if (data.success) {
    console.log(`  ✓ published — id: ${data.id}`);
  } else {
    console.log(`  ✗ failed: ${data.error || JSON.stringify(data)}`);
  }
}

console.log('\n✓ done');
