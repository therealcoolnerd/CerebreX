/**
 * Opens a trace JSON file in the CerebreX visual dashboard.
 * Writes a self-contained HTML file to a temp directory and opens
 * the default system browser.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import chalk from 'chalk';

// Inline dashboard HTML — embedded at build time so the CLI is self-contained.
// This is the content of apps/dashboard/src/index.html with a data-injection hook.
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CerebreX — Trace Explorer</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0d0d0f; --surface: #16161a; --border: #2a2a30;
      --text: #e8e8f0; --muted: #6b6b80;
      --cyan: #00c8e0; --green: #22d3a0; --yellow: #f5a623;
      --red: #f56060; --blue: #6090f5; --purple: #a560f5;
    }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
    .logo { font-size: 18px; font-weight: 700; color: var(--cyan); letter-spacing: -0.5px; }
    .logo span { color: var(--muted); font-weight: 400; }
    .header-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
    .app { display: flex; flex: 1; overflow: hidden; height: calc(100vh - 53px); }
    .sidebar { width: 280px; min-width: 220px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
    .sidebar-header { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); display: flex; justify-content: space-between; align-items: center; }
    .session-list { flex: 1; overflow-y: auto; padding: 8px; }
    .session-item { padding: 10px 12px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; margin-bottom: 2px; transition: background 0.1s; }
    .session-item:hover { background: rgba(255,255,255,0.05); }
    .session-item.active { background: rgba(0,200,224,0.08); border-color: var(--cyan); }
    .session-name { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .session-meta { font-size: 11px; color: var(--muted); margin-top: 3px; }
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .trace-header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .trace-title { font-size: 16px; font-weight: 600; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; }
    .badge-green { background: rgba(34,211,160,0.15); color: var(--green); }
    .badge-yellow { background: rgba(245,166,35,0.15); color: var(--yellow); }
    .stats-row { display: flex; gap: 24px; margin-left: auto; }
    .stat { text-align: right; }
    .stat-value { font-size: 15px; font-weight: 600; color: var(--cyan); }
    .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .timeline { flex: 1; overflow-y: auto; padding: 16px 24px; }
    .step { display: flex; gap: 16px; margin-bottom: 8px; position: relative; }
    .step::before { content: ''; position: absolute; left: 19px; top: 36px; bottom: -8px; width: 2px; background: var(--border); }
    .step:last-child::before { display: none; }
    .step-icon { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; border: 2px solid transparent; }
    .step-body { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: border-color 0.1s; }
    .step-body:hover { border-color: var(--muted); }
    .step-body.expanded { border-color: var(--cyan); }
    .step-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .step-type { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 2px 6px; border-radius: 4px; }
    .step-name { font-size: 13px; font-weight: 500; }
    .step-meta { margin-left: auto; display: flex; gap: 12px; align-items: center; }
    .step-meta span { font-size: 11px; color: var(--muted); }
    .step-details { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
    .step-details.show { display: block; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .detail-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 6px; }
    .detail-value { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; color: var(--text); }
    .type-tool_call { background: rgba(0,200,224,0.12); color: var(--cyan); }
    .icon-tool_call { background: rgba(0,200,224,0.12); border-color: var(--cyan); }
    .type-llm_call { background: rgba(160,96,245,0.12); color: var(--purple); }
    .icon-llm_call { background: rgba(160,96,245,0.12); border-color: var(--purple); }
    .type-memory_read,.type-memory_write { background: rgba(34,211,160,0.12); color: var(--green); }
    .icon-memory_read,.icon-memory_write { background: rgba(34,211,160,0.12); border-color: var(--green); }
    .type-error { background: rgba(245,96,96,0.12); color: var(--red); }
    .icon-error { background: rgba(245,96,96,0.12); border-color: var(--red); }
    .type-custom { background: rgba(245,166,35,0.12); color: var(--yellow); }
    .icon-custom { background: rgba(245,166,35,0.12); border-color: var(--yellow); }
    button { font-family: inherit; cursor: pointer; }
    .btn { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; border: 1px solid var(--border); background: var(--surface); color: var(--text); transition: background 0.1s; }
    .btn:hover { background: rgba(255,255,255,0.06); }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  </style>
</head>
<body>
<header>
  <div class="logo">CerebreX <span>Trace Explorer</span></div>
  <div class="header-right">
    <label class="btn" for="file-input">Load Another Trace</label>
    <input type="file" id="file-input" accept=".json" multiple style="display:none" />
  </div>
</header>
<div class="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Sessions</span>
      <span id="session-count" style="color: var(--cyan)">0</span>
    </div>
    <div class="session-list" id="session-list"></div>
  </div>
  <div class="main" id="main">
    <div id="empty-state" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px;">Loading trace...</div>
    <div id="trace-view" style="display:none; flex-direction:column; flex:1; overflow:hidden;">
      <div class="trace-header" id="trace-header"></div>
      <div class="timeline" id="timeline"></div>
    </div>
  </div>
</div>
<script>
const sessions = new Map();
let activeSession = null;
const ICONS = { tool_call:'🔧', llm_call:'🤖', memory_read:'📖', memory_write:'💾', error:'❌', custom:'⚡' };
const getIcon = t => ICONS[t] || ICONS.custom;
const fmtMs = ms => !ms ? '–' : ms < 1000 ? ms+'ms' : (ms/1000).toFixed(1)+'s';
const fmtTok = t => !t ? '' : t < 1000 ? t+' tok' : (t/1000).toFixed(1)+'k tok';
const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch { return iso||''; } };

function loadTrace(data, name) {
  const s = typeof data === 'string' ? JSON.parse(data) : data;
  const id = s.session || name || 'trace-'+Date.now();
  sessions.set(id, s);
  renderSidebar();
  selectSession(id);
}

function renderSidebar() {
  document.getElementById('session-count').textContent = sessions.size;
  const list = document.getElementById('session-list');
  list.innerHTML = '';
  for (const [id, s] of sessions) {
    const steps = s.steps||[];
    const ms = steps.reduce((a,b)=>a+(b.latencyMs||0),0);
    const el = document.createElement('div');
    el.className = 'session-item'+(activeSession===id?' active':'');
    el.innerHTML = '<div class="session-name">'+escHtml(s.session||id)+'</div><div class="session-meta">'+steps.length+' steps · '+fmtMs(ms)+'</div>';
    el.addEventListener('click', ()=>selectSession(id));
    list.appendChild(el);
  }
}

function selectSession(id) { activeSession=id; renderSidebar(); renderTrace(id); }

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderTrace(id) {
  const s = sessions.get(id);
  const steps = s.steps||[];
  document.getElementById('empty-state').style.display='none';
  const tv = document.getElementById('trace-view');
  tv.style.display='flex';
  const ms = steps.reduce((a,b)=>a+(b.latencyMs||0),0);
  const tok = steps.reduce((a,b)=>a+(b.tokens||0),0);
  const errs = steps.filter(x=>x.type==='error').length;
  document.getElementById('trace-header').innerHTML =
    '<div class="trace-title">'+escHtml(s.session||id)+'</div>'+
    (errs?'<span class="badge badge-yellow">'+errs+' error'+(errs>1?'s':'')+'</span>':'<span class="badge badge-green">Clean</span>')+
    '<div class="stats-row">'+
    '<div class="stat"><div class="stat-value">'+steps.length+'</div><div class="stat-label">Steps</div></div>'+
    '<div class="stat"><div class="stat-value">'+fmtMs(ms)+'</div><div class="stat-label">Time</div></div>'+
    (tok?'<div class="stat"><div class="stat-value">'+fmtTok(tok)+'</div><div class="stat-label">Tokens</div></div>':'')+
    '</div>';
  const tl = document.getElementById('timeline');
  tl.innerHTML='';
  if (!steps.length) { tl.innerHTML='<div style="color:var(--muted);padding:32px;text-align:center">No steps recorded</div>'; return; }
  steps.forEach((step,i)=>{
    const type=step.type||'custom', name=escHtml(step.toolName||step.name||type);
    const el=document.createElement('div');
    el.className='step';
    const hasDetails=!!(step.inputs||step.outputs||step.error);
    el.innerHTML=
      '<div class="step-icon icon-'+type+'">'+getIcon(type)+'</div>'+
      '<div class="step-body" id="sb'+i+'">'+
        '<div class="step-top">'+
          '<span class="step-type type-'+type+'">'+type.replace('_',' ')+'</span>'+
          '<span class="step-name">'+name+'</span>'+
          '<div class="step-meta">'+
            (step.latencyMs?'<span>⏱ '+fmtMs(step.latencyMs)+'</span>':'')+
            (step.tokens?'<span>'+fmtTok(step.tokens)+'</span>':'')+
          '</div>'+
        '</div>'+
        (hasDetails?
          '<div class="step-details" id="sd'+i+'">'+
            '<div class="detail-grid">'+
              (step.inputs?'<div><div class="detail-label">Inputs</div><div class="detail-value">'+escHtml(JSON.stringify(step.inputs,null,2))+'</div></div>':'')+
              (step.outputs?'<div><div class="detail-label">Outputs</div><div class="detail-value">'+escHtml(JSON.stringify(step.outputs,null,2))+'</div></div>':'')+
              (step.error?'<div style="grid-column:span 2"><div class="detail-label" style="color:var(--red)">Error</div><div class="detail-value" style="color:var(--red)">'+escHtml(step.error)+'</div></div>':'')+
            '</div>'+
          '</div>'
        :'')+
      '</div>';
    if (hasDetails) {
      el.querySelector('#sb'+i).addEventListener('click',()=>{
        el.querySelector('#sd'+i).classList.toggle('show');
        el.querySelector('#sb'+i).classList.toggle('expanded');
      });
    }
    tl.appendChild(el);
  });
}

// Load embedded trace data
const __TRACE_DATA__ = TRACE_DATA_PLACEHOLDER;
if (__TRACE_DATA__) loadTrace(__TRACE_DATA__, __TRACE_DATA__.session);

// File input
document.getElementById('file-input').addEventListener('change', e=>{
  for (const f of e.target.files) {
    const r=new FileReader();
    r.onload=ev=>{ try { loadTrace(ev.target.result, f.name.replace('.json','')); } catch(e2) { alert('Could not parse '+f.name+': '+e2.message); } };
    r.readAsText(f);
  }
});
</script>
</body>
</html>`;

export async function openTraceInBrowser(tracePath: string, sessionId: string): Promise<void> {
  const traceData = JSON.parse(fs.readFileSync(tracePath, 'utf-8')) as unknown;

  // Inject trace data into the HTML template
  const html = DASHBOARD_HTML.replace(
    'TRACE_DATA_PLACEHOLDER',
    JSON.stringify(traceData)
  );

  // Sanitize sessionId before embedding in the file path — prevents shell injection
  // if a malicious value were ever passed through (e.g. from a crafted trace file).
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const tmpFile = path.join(os.tmpdir(), `cerebrex-trace-${safeId}.html`);
  fs.writeFileSync(tmpFile, html);

  console.log(chalk.cyan(`\n  🌐 Opening trace in browser...\n`));
  console.log(chalk.dim(`  File: ${tmpFile}\n`));

  // Use execFile (no shell interpolation) — passes tmpFile as a direct argument,
  // not as part of a shell string. Prevents command injection via path characters.
  await new Promise<void>((resolve) => {
    if (process.platform === 'win32') {
      execFile('cmd', ['/c', 'start', '', tmpFile], () => resolve());
    } else if (process.platform === 'darwin') {
      execFile('open', [tmpFile], () => resolve());
    } else {
      execFile('xdg-open', [tmpFile], () => resolve());
    }
  });
}
