/**
 * CerebreX TRACE — HTTP Event Server
 * Spins up a local HTTP server that agents push trace events to.
 * Runs as a long-lived process started by `cerebrex trace start`.
 *
 * Agent integration:
 *   POST http://localhost:7432/step  — record one trace step
 *   POST http://localhost:7432/stop  — finalize session and exit
 *   GET  http://localhost:7432/health — liveness probe
 */

import type { TraceStep } from '@cerebrex/types';
import { TraceRecorder } from './recorder.js';
import http from 'node:http';

export async function startTraceServer(
  sessionId: string,
  port: number,
  outputDir: string
): Promise<void> {
  const recorder = new TraceRecorder({ sessionId, outputDir, port });
  await recorder.start();

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      // Read the full request body as a string
      const readBody = (): Promise<string> =>
        new Promise((ok, fail) => {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => ok(Buffer.concat(chunks).toString('utf-8')));
          req.on('error', fail);
        });

      const reply = (status: number, body: unknown): void => {
        const payload = JSON.stringify(body);
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '127.0.0.1',
        });
        res.end(payload);
      };

      (async () => {
        // ── POST /step — record a trace step ────────────────────────────────
        if (req.method === 'POST' && url.pathname === '/step') {
          try {
            const raw = await readBody();
            const step = JSON.parse(raw) as Omit<TraceStep, 'id' | 'timestamp'>;

            // Validate required field
            if (!step.type) {
              reply(400, { error: 'Missing required field: type' });
              return;
            }

            recorder.recordStep(step);
            reply(200, { ok: true });
          } catch {
            reply(400, { error: 'Invalid JSON payload' });
          }
          return;
        }

        // ── POST /stop — finalize session and exit ───────────────────────────
        if (req.method === 'POST' && url.pathname === '/stop') {
          const summary = await recorder.stop();
          reply(200, summary);
          // Give the response time to flush before we close
          setTimeout(() => {
            server.close(() => resolve());
          }, 80);
          return;
        }

        // ── GET /health ──────────────────────────────────────────────────────
        if (req.method === 'GET' && url.pathname === '/health') {
          reply(200, { ok: true, sessionId });
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      })().catch((err) => {
        reply(500, { error: 'Internal server error' });
        console.error('[trace server]', err);
      });
    });

    server.listen(port, '127.0.0.1');

    server.on('listening', () => {
      // Server is ready — the caller already printed the startup message
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(`Port ${port} is already in use. Choose another with --port <port>.`)
        );
      } else {
        reject(err);
      }
    });

    // Graceful shutdown on Ctrl+C
    const shutdown = async (signal: string) => {
      process.stderr.write(`\n[trace] Received ${signal} — saving session...\n`);
      await recorder.stop().catch(() => {});
      server.close(() => resolve());
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  });
}
