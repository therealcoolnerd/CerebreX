/**
 * CerebreX TRACE — Agent Execution Recorder
 * Intercepts and stores every step of an agent run.
 * 
 * Security: traces are stored locally. Never transmitted without consent.
 */

import type { TraceSession, TraceStep, TraceSummary } from '@cerebrex/types';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

interface RecorderConfig {
  sessionId: string;
  outputDir: string;
  port: number;
}

export class TraceRecorder {
  private sessionId: string;
  private outputDir: string;
  private port: number;
  private session: TraceSession;
  private pidFile: string;

  constructor(config: RecorderConfig) {
    this.sessionId = config.sessionId;
    this.outputDir = config.outputDir;
    this.port = config.port;
    this.pidFile = path.join(config.outputDir, `${config.sessionId}.pid`);
    this.session = {
      sessionId: config.sessionId,
      startTime: new Date().toISOString(),
      steps: [],
      totalTokens: 0,
    };
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.outputDir, { recursive: true });
    // Write a PID file so stop() can find us
    fs.writeFileSync(this.pidFile, JSON.stringify({ port: this.port, pid: process.pid }));
    // Save empty session immediately
    this.save();
  }

  async stop(): Promise<TraceSummary> {
    this.session.endTime = new Date().toISOString();
    const start = new Date(this.session.startTime).getTime();
    const end = new Date(this.session.endTime).getTime();
    this.session.durationMs = end - start;
    this.session.totalTokens = this.session.steps.reduce((sum, s) => sum + (s.tokens || 0), 0);

    const filePath = this.save();
    // Clean up PID file
    if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);

    return {
      sessionId: this.sessionId,
      stepCount: this.session.steps.length,
      totalTokens: this.session.totalTokens,
      durationMs: this.session.durationMs,
      filePath,
    };
  }

  recordStep(step: Omit<TraceStep, 'id' | 'timestamp'>): void {
    const fullStep: TraceStep = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...step,
    };
    this.session.steps.push(fullStep);
    this.save(); // persist after every step
  }

  private save(): string {
    const filePath = path.join(this.outputDir, `${this.sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.session, null, 2));
    return filePath;
  }

  static attach(sessionId: string, outputDir: string): TraceRecorder {
    const recorder = new TraceRecorder({ sessionId, outputDir, port: 0 });
    const filePath = path.join(outputDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      recorder.session = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TraceSession;
    }
    return recorder;
  }
}
