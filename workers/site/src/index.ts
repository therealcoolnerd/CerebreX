const SITE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
  ].join('; '),
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const whitepaperUrl = `${url.protocol}//${url.host}/whitepaper`;

    if (url.pathname === '/whitepaper') {
      return new Response(WHITEPAPER_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...SITE_SECURITY_HEADERS,
        },
      });
    }
    return new Response(HTML.replaceAll('__WHITEPAPER_URL__', whitepaperUrl), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...SITE_SECURITY_HEADERS,
      },
    });
  },
};

// ─────────────────────────────────────────────
// MAIN LANDING PAGE
// ─────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>a real cool co. - Something Cool is Loading</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23000'/%3E%3Ctext x='50' y='35' font-family='monospace' font-size='20' fill='%23fff' text-anchor='middle'%3Ea%3C/text%3E%3Ctext x='50' y='55' font-family='monospace' font-size='14' fill='%23fff' text-anchor='middle'%3Ereal%3C/text%3E%3Ctext x='50' y='75' font-family='monospace' font-size='14' fill='%23fff' text-anchor='middle'%3Ecool%3C/text%3E%3Ctext x='50' y='90' font-family='monospace' font-size='12' fill='%23fff' text-anchor='middle'%3Eco.%3C/text%3E%3C/svg%3E">
    <meta name="description" content="creative studio building the future one cool project at a time. we make stuff that doesn't suck. something cool is loading, stay tuned.">
    <meta name="keywords" content="creative studio, CerebreX, MCP, AI agents, developer tools, agent infrastructure, open source">
    <meta name="author" content="a real cool co.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://therealcool.site">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://therealcool.site">
    <meta property="og:title" content="a real cool co. - Something Cool is Loading">
    <meta property="og:description" content="creative studio building the future one cool project at a time. we make stuff that doesn't suck. something cool is loading, stay tuned.">
    <meta property="og:site_name" content="a real cool co.">
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:creator" content="@therealcool.site">
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "a real cool co.",
        "url": "https://therealcool.site",
        "description": "creative studio building the future one cool project at a time.",
        "sameAs": [
            "https://tiktok.com/@a.real.cool.co",
            "https://www.youtube.com/@arealcoolcompany",
            "https://github.com/arealcoolco/CerebreX",
            "https://www.linkedin.com/company/a-real-cool-co",
            "https://mastodon.social/@arealcoolcompany",
            "https://bsky.app/profile/therealcool.site"
        ]
    }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-black: #000000;
            --primary-white: #ffffff;
            --glow-white: #ffffff;
            --glow-white-dim: rgba(255,255,255,0.3);
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            background: var(--primary-black);
            color: var(--primary-white);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            overflow-x: hidden;
            cursor: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4K'), auto;
            min-height: 100vh;
        }
        body::before {
            content: '';
            position: fixed; top:0; left:0; width:100%; height:100%;
            background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px),
                        repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px);
            pointer-events: none; z-index:1;
            animation: scanlineFlicker 0.1s linear infinite;
        }
        body::after {
            content:'';
            position:fixed; top:0; left:0; width:100%; height:100%;
            background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%);
            pointer-events:none; z-index:2;
        }
        .bg-layer { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:-1; }
        .static-screen {
            background: repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.08) 1px, rgba(255,255,255,0.08) 2px),
                        repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px);
            animation: staticFlicker 0.15s linear infinite;
        }
        .noise-overlay {
            position:fixed; top:0; left:0; width:100%; height:100%;
            opacity:0.15; z-index:3; pointer-events:none;
            background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxmaWx0ZXIgaWQ9Im5vaXNlIiB4PSIwJSIgeT0iMCUiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPgogICAgICA8ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9IjAuOSIgbnVtT2N0YXZlcz0iNCIgcmVzdWx0PSJub2lzZSIgc2VlZD0iMSIvPgogICAgICA8ZmVDb2xvck1hdHJpeCBpbj0ibm9pc2UiIHR5cGU9InNhdHVyYXRlIiB2YWx1ZXM9IjAiLz4KICAgIDwvZmlsdGVyPgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InVybCgjbm9pc2UpIiBvcGFjaXR5PSIwLjciLz4KPC9zdmc+');
            animation: noiseShift 0.2s linear infinite;
            mix-blend-mode: screen;
        }
        .glitch-bars { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:4; }
        .glitch-bar {
            position:absolute; left:0; width:100%; height:1px;
            background: linear-gradient(90deg, transparent, var(--glow-white), transparent);
            opacity:0; animation: glitchFlicker 4s infinite;
            box-shadow: 0 0 10px var(--glow-white);
        }
        .glitch-bar:nth-child(1) { top:15%; animation-delay:0s; }
        .glitch-bar:nth-child(2) { top:35%; animation-delay:1.5s; }
        .glitch-bar:nth-child(3) { top:65%; animation-delay:3s; }
        .glitch-bar:nth-child(4) { top:85%; animation-delay:0.8s; }

        .container {
            min-height:100vh; display:flex; flex-direction:column;
            align-items:center; justify-content:center;
            padding:2rem; position:relative; z-index:5; gap:3rem;
            animation: fadeIn 1s ease-out;
        }
        .logo-section { display:flex; flex-direction:column; align-items:center; gap:1.5rem; }
        .logo-placeholder {
            width:200px; height:400px; background:var(--primary-black);
            border:2px solid var(--primary-white);
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            font-family:'Inter',sans-serif; font-weight:300; font-size:2rem;
            color:var(--primary-white); text-align:center; line-height:0.9;
            letter-spacing:-0.02em; transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
            position:relative; overflow:hidden;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
        }
        .logo-placeholder::before {
            content:''; position:absolute; top:-50%; left:-50%; width:200%; height:200%;
            background: radial-gradient(circle, var(--glow-white-dim) 0%, transparent 70%);
            opacity:0; transition:opacity 0.3s ease; z-index:-1;
        }
        .logo-placeholder:hover::before { opacity:1; }
        .logo-placeholder:hover {
            box-shadow: 0 0 40px rgba(255,255,255,0.4), inset 0 0 20px rgba(255,255,255,0.1);
            transform:scale(1.02);
            text-shadow: 0 0 15px rgba(255,255,255,0.8);
        }
        .tagline {
            font-family:'JetBrains Mono',monospace; font-size:1.2rem; font-weight:400;
            text-transform:lowercase; letter-spacing:0.1em;
            position:relative; overflow:hidden;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
            margin-bottom:0.5rem;
        }
        .tagline::after {
            content:''; position:absolute; bottom:-2px; left:0; width:100%; height:2px;
            background: linear-gradient(90deg, var(--primary-white), var(--glow-white), var(--primary-white));
            animation: typewriter 2s ease-out;
            box-shadow: 0 0 10px var(--glow-white);
        }
        .social-links { display:flex; gap:2rem; align-items:center; justify-content:center; flex-wrap:wrap; }
        .social-link {
            display:flex; align-items:center; justify-content:center;
            width:50px; height:50px;
            transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
            text-decoration:none; border-radius:4px; position:relative; overflow:hidden;
        }
        .social-link::before { content:''; position:absolute; inset:0; background:rgba(255,255,255,0.1); opacity:0; transition:opacity 0.3s ease; }
        .social-link:hover::before { opacity:1; }
        .social-link:hover { transform:scale(1.1); filter:drop-shadow(0 0 15px rgba(255,255,255,0.6)); }
        .social-icon { width:32px; height:32px; fill:var(--primary-white); transition:all 0.3s ease; z-index:1; }

        .projects-section { display:flex; flex-direction:column; align-items:center; gap:2rem; margin-top:2rem; width:100%; max-width:660px; }
        .project-item {
            display:flex; flex-direction:column; align-items:center; gap:1.2rem;
            padding:2.5rem 2rem; border:1px solid rgba(255,255,255,0.3);
            background:rgba(0,0,0,0.5); backdrop-filter:blur(10px);
            width:100%; text-align:center;
            transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
            text-decoration:none; color:inherit; position:relative; overflow:hidden;
        }
        .project-item::before {
            content:''; position:absolute; inset:0;
            background:linear-gradient(45deg, transparent, rgba(255,255,255,0.05), transparent);
            opacity:0; transition:opacity 0.3s ease;
            pointer-events:none;
        }
        .project-item:hover::before { opacity:1; }
        .project-item:hover {
            border-color:var(--glow-white);
            box-shadow: 0 0 30px rgba(255,255,255,0.2), inset 0 0 20px rgba(255,255,255,0.05);
            transform:translateY(-4px);
        }
        .beta-badge {
            display:inline-block;
            font-family:'JetBrains Mono',monospace; font-size:0.65rem; font-weight:700;
            text-transform:uppercase; letter-spacing:0.15em;
            border:1px solid rgba(255,255,255,0.5);
            padding:0.2rem 0.7rem;
            color:rgba(255,255,255,0.7);
            background:rgba(255,255,255,0.05);
        }
        .cerebrex-logo {
            width:90px; height:90px;
            border:2px solid rgba(255,255,255,0.8);
            display:flex; align-items:center; justify-content:center;
            font-family:'JetBrains Mono',monospace; font-weight:700;
            font-size:0.85rem; letter-spacing:0.05em;
            color:#fff; background:rgba(255,255,255,0.04);
            transition:all 0.3s ease;
            position:relative; overflow:hidden;
        }
        .cerebrex-logo::before {
            content:'';
            position:absolute; inset:0;
            background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 70%);
            opacity:0; transition:opacity 0.3s ease;
        }
        .project-item:hover .cerebrex-logo {
            transform:scale(1.08);
            border-color:#fff;
            box-shadow: 0 0 20px rgba(255,255,255,0.4);
        }
        .project-item:hover .cerebrex-logo::before { opacity:1; }
        .cerebrex-logo svg { width:56px; height:56px; }
        .project-title {
            font-family:'JetBrains Mono',monospace; font-size:1.6rem; font-weight:700;
            text-transform:lowercase; letter-spacing:0.05em;
        }
        .project-description {
            font-family:'Inter',sans-serif; font-size:0.95rem;
            line-height:1.65; opacity:0.85; max-width:520px;
        }
        .test-block {
            width:100%; background:rgba(255,255,255,0.04);
            border:1px solid rgba(255,255,255,0.15);
            padding:1rem 1.2rem; text-align:left;
        }
        .test-block-label {
            font-family:'JetBrains Mono',monospace; font-size:0.65rem;
            text-transform:uppercase; letter-spacing:0.15em;
            color:rgba(255,255,255,0.4); margin-bottom:0.5rem;
        }
        .test-block code {
            font-family:'JetBrains Mono',monospace; font-size:0.82rem;
            color:rgba(255,255,255,0.85); display:block; line-height:1.8;
        }
        .cta-row { display:flex; gap:1rem; align-items:center; justify-content:center; flex-wrap:wrap; margin-top:0.4rem; }
        .btn-primary {
            font-family:'JetBrains Mono',monospace; font-size:0.85rem; font-weight:700;
            text-transform:lowercase; letter-spacing:0.08em;
            padding:0.75rem 1.8rem;
            background:#fff; color:#000;
            border:2px solid #fff;
            text-decoration:none;
            transition:all 0.25s ease;
            cursor:pointer; display:inline-block;
        }
        .btn-primary:hover {
            background:transparent; color:#fff;
            box-shadow: 0 0 25px rgba(255,255,255,0.4);
        }
        .btn-ghost {
            font-family:'JetBrains Mono',monospace; font-size:0.85rem; font-weight:400;
            text-transform:lowercase; letter-spacing:0.08em;
            padding:0.75rem 1.8rem;
            background:transparent; color:rgba(255,255,255,0.7);
            border:1px solid rgba(255,255,255,0.35);
            text-decoration:none;
            transition:all 0.25s ease;
            display:inline-block;
        }
        .btn-ghost:hover {
            border-color:#fff; color:#fff;
            box-shadow: 0 0 15px rgba(255,255,255,0.2);
        }
        .audio-controls { position:fixed; bottom:2rem; right:2rem; z-index:20; }
        .music-btn {
            width:50px; height:50px; border-radius:50%;
            background:rgba(0,0,0,0.8); border:1px solid rgba(255,255,255,0.5);
            color:var(--primary-white); cursor:pointer;
            display:flex; align-items:center; justify-content:center;
            transition:all 0.3s ease; backdrop-filter:blur(10px);
            box-shadow: 0 0 15px rgba(255,255,255,0.2);
        }
        .music-btn:hover { background:rgba(255,255,255,0.1); transform:scale(1.1); box-shadow:0 0 25px rgba(255,255,255,0.4); }
        .music-btn.active { background:rgba(255,255,255,0.2); box-shadow:0 0 30px rgba(255,255,255,0.6); }
        .spotify-player {
            position:fixed; bottom:6rem; right:2rem; width:320px; height:380px;
            background:var(--primary-black); border:2px solid var(--glow-white);
            opacity:0; visibility:hidden; transform:translateY(20px);
            transition:all 0.3s cubic-bezier(0.4,0,0.2,1); z-index:15;
            box-shadow:0 0 30px rgba(255,255,255,0.3);
        }
        .spotify-player.active { opacity:1; visibility:visible; transform:translateY(0); }
        .spotify-player iframe { width:100%; height:100%; filter:grayscale(1) contrast(1.2) brightness(0.9) hue-rotate(180deg); }
        .player-header {
            position:absolute; top:0; left:0; right:0; height:40px;
            background:var(--primary-black); border-bottom:1px solid var(--glow-white);
            display:flex; align-items:center; justify-content:space-between;
            padding:0 1rem; font-family:'JetBrains Mono',monospace; font-size:0.8rem;
            font-weight:600; z-index:16; text-shadow:0 0 5px var(--glow-white);
        }
        .close-player {
            background:none; border:none; color:var(--glow-white);
            cursor:pointer; font-size:1.2rem; width:20px; height:20px;
            display:flex; align-items:center; justify-content:center;
            transition:all 0.3s ease;
        }
        .close-player:hover { background:rgba(255,255,255,0.1); }
        .tv-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:var(--primary-white); z-index:10000; display:flex; align-items:center; justify-content:center; opacity:1; visibility:visible; }
        .tv-turn-on { animation:tvTurnOn 1.5s ease-out forwards; }
        .boot-sequence { position:fixed; top:0; left:0; width:100%; height:100%; background:var(--primary-black); color:var(--primary-white); font-family:'JetBrains Mono',monospace; font-size:0.9rem; z-index:9998; padding:2rem; overflow:hidden; opacity:0; visibility:hidden; }
        .boot-sequence.active { opacity:1; visibility:visible; }
        .boot-line { margin:0.2rem 0; opacity:0; animation:bootLineAppear 0.1s ease forwards; }
        .loading { position:fixed; top:0; left:0; width:100%; height:100%; background:var(--primary-black); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:9999; opacity:0; visibility:hidden; }
        .loading.show { opacity:1; visibility:visible; }
        .loading.hide { animation:fadeOut 1s ease forwards; }
        .ascii-logo { font-family:'JetBrains Mono',monospace; font-size:1rem; line-height:1; white-space:pre; text-align:center; margin:2rem 0; opacity:0; text-shadow:0 0 20px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.2); }
        .ascii-logo.show { opacity:1; animation:asciiAppear 2s ease-in-out forwards; }
        .loading-text { font-family:'JetBrains Mono',monospace; font-size:1.5rem; font-weight:400; text-transform:lowercase; letter-spacing:0.2em; animation:pulse 1s ease-in-out infinite; text-shadow:0 0 20px var(--glow-white); }
        @media (max-width:768px) {
            .container { gap:2rem; }
            .logo-placeholder { width:150px; height:300px; font-size:1.5rem; }
            .tagline { font-size:1rem; }
            .social-links { gap:1.5rem; }
            .social-link { width:40px; height:40px; }
            .social-icon { width:24px; height:24px; }
            .projects-section { padding:0 1rem; }
            .project-item { padding:1.75rem 1.25rem; }
            .cta-row { flex-direction:column; }
            .btn-primary, .btn-ghost { width:100%; text-align:center; }
            .spotify-player { width:calc(100vw - 2rem); right:1rem; height:300px; bottom:4rem; }
        }
        @keyframes scanlineFlicker { 0%,100%{opacity:1} 50%{opacity:0.95} }
        @keyframes staticFlicker { 0%,100%{opacity:1} 50%{opacity:0.94} }
        @keyframes noiseShift { 0%{transform:translate(0,0)} 25%{transform:translate(-0.5px,0.5px)} 50%{transform:translate(0.5px,-0.5px)} 75%{transform:translate(-0.5px,-0.5px)} 100%{transform:translate(0,0)} }
        @keyframes glitchFlicker { 0%,95%,100%{opacity:0} 2%,8%{opacity:0.8} }
        @keyframes typewriter { 0%{width:0} 100%{width:100%} }
        @keyframes fadeIn { 0%{opacity:0;transform:translateY(20px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes tvTurnOn { 0%{transform:scaleY(0.001) scaleX(1);opacity:1;background:var(--primary-white)} 30%{transform:scaleY(0.01) scaleX(1);opacity:1} 60%{transform:scaleY(0.1) scaleX(1);opacity:1;background:rgba(255,255,255,0.8)} 80%{transform:scaleY(0.5) scaleX(1);opacity:0.8} 100%{transform:scaleY(1) scaleX(1);opacity:0;visibility:hidden;background:transparent} }
        @keyframes bootLineAppear { to{opacity:1} }
        @keyframes asciiAppear { 0%{opacity:0;transform:translateY(20px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes fadeOut { to{opacity:0;visibility:hidden} }
        @keyframes pulse { 0%,100%{opacity:1;text-shadow:0 0 20px var(--glow-white)} 50%{opacity:0.3;text-shadow:0 0 10px var(--glow-white)} }
        @keyframes cursorFade { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0.5)} }
    </style>
</head>
<body>
    <div class="tv-overlay tv-turn-on" id="tvOverlay"></div>
    <div class="boot-sequence" id="bootSequence"><div id="bootLines"></div></div>
    <div class="loading" id="loadingScreen">
        <div class="ascii-logo" id="asciiLogo"> ██████╗ ██████╗  ██████╗ ██╗
██╔════╝██╔═══██╗██╔═══██╗██║
██║     ██║   ██║██║   ██║██║
██║     ██║   ██║██║   ██║██║
╚██████╗╚██████╔╝╚██████╔╝███████╗
 ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝

        a real cool co.</div>
        <div class="loading-text">something cool is loading</div>
    </div>

    <div class="container">
        <div class="logo-section">
            <div class="logo-placeholder">a<br>real<br>cool<br>co.</div>
            <h1 class="tagline">something cool is loading</h1>
            <div class="social-links">
                <a href="https://bsky.app/profile/therealcool.site" class="social-link" target="_blank" rel="noopener" title="Bluesky">
                    <svg class="social-icon" viewBox="0 0 24 24"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-2.67-.297-5.568.628-6.383 3.364C.378 17.6 0 22.541 0 23.23c0 .688.139 1.86.902 2.202.659.299 1.664.621 4.3-1.24 2.752-1.942 5.711-5.881 6.798-7.995 1.087 2.114 4.046 6.053 6.798 7.995 2.636 1.861 3.641 1.539 4.3 1.24.763-.342.902-1.514.902-2.202 0-.689-.378-5.65-.624-6.479-.815-2.736-3.713-3.66-6.383-3.364-.139.016-.277.034-.415.056.138-.017.276-.036.415-.056 2.67.296 5.568-.628 6.383-3.364.246-.829.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.202-.659-.299-1.664-.621-4.3 1.24-2.752 1.942-5.711 5.881-6.798 7.995z"/></svg>
                </a>
                <a href="https://mastodon.social/@arealcoolcompany" class="social-link" target="_blank" rel="noopener" title="Mastodon">
                    <svg class="social-icon" viewBox="0 0 24 24"><path d="M23.193 7.879c0-5.206-3.411-6.732-3.411-6.732C18.062.357 15.108.025 12.041 0h-.076c-3.068.025-6.02.357-7.74 1.147 0 0-3.411 1.526-3.411 6.732 0 1.192-.023 2.618.015 4.129.124 5.092.934 10.109 5.641 11.355 2.17.574 4.034.695 5.535.612 2.722-.15 4.25-.972 4.25-.972l-.09-1.975s-1.945.613-4.129.538c-2.165-.074-4.449-.233-4.799-2.891a5.499 5.499 0 0 1-.048-.745s2.125.519 4.817.642c1.646.075 3.19-.097 4.758-.283 3.007-.359 5.625-2.212 5.954-3.905.517-2.665.475-6.507.475-6.507zm-4.024 6.709h-2.497V8.469c0-1.29-.543-1.944-1.628-1.944-1.2 0-1.802.776-1.802 2.312v3.349h-2.483v-3.349c0-1.536-.602-2.312-1.802-2.312-1.085 0-1.628.655-1.628 1.944v6.119H4.832V8.284c0-1.289.328-2.313.987-3.07.679-.757 1.568-1.146 2.677-1.146 1.278 0 2.246.491 2.886 1.474L12 6.585l.618-1.043c.64-.983 1.608-1.474 2.886-1.474 1.109 0 1.998.389 2.677 1.146.659.757.987 1.781.987 3.07v6.304z"/></svg>
                </a>
                <a href="https://www.linkedin.com/company/a-real-cool-co" class="social-link" target="_blank" rel="noopener" title="LinkedIn">
                    <svg class="social-icon" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
                <a href="https://www.youtube.com/@arealcoolcompany" class="social-link" target="_blank" rel="noopener" title="YouTube">
                    <svg class="social-icon" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
                <a href="https://tiktok.com/@a.real.cool.co" class="social-link" target="_blank" rel="noopener" title="TikTok">
                    <svg class="social-icon" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                </a>
            </div>
        </div>

        <!-- CerebreX Project Tile -->
        <div class="projects-section">
            <div class="project-item" data-href="__WHITEPAPER_URL__">
                <div class="cerebrex-logo">
                    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="28" cy="28" r="20" stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
                        <circle cx="28" cy="28" r="12" stroke="white" stroke-width="1.5" fill="none" opacity="0.6"/>
                        <circle cx="28" cy="28" r="4" fill="white" opacity="0.9"/>
                        <circle cx="28" cy="8" r="2.5" fill="white" opacity="0.7"/>
                        <circle cx="28" cy="48" r="2.5" fill="white" opacity="0.7"/>
                        <circle cx="8" cy="28" r="2.5" fill="white" opacity="0.7"/>
                        <circle cx="48" cy="28" r="2.5" fill="white" opacity="0.7"/>
                        <line x1="28" y1="10" x2="28" y2="16" stroke="white" stroke-width="1" opacity="0.5"/>
                        <line x1="28" y1="40" x2="28" y2="46" stroke="white" stroke-width="1" opacity="0.5"/>
                        <line x1="10" y1="28" x2="16" y2="28" stroke="white" stroke-width="1" opacity="0.5"/>
                        <line x1="40" y1="28" x2="46" y2="28" stroke="white" stroke-width="1" opacity="0.5"/>
                    </svg>
                </div>
                <span class="beta-badge">beta</span>
                <div class="project-title">cerebrex</div>
                <div class="project-description">
                    the open-source Agent Infrastructure OS for Claude and other AI agents — v0.9.4.
                    8 live modules: FORGE, TRACE, MEMEX, KAIROS, HIVE, AUTH, REGISTRY, ULTRAPLAN.
                    <strong style="color:rgba(255,255,255,0.9)">26× faster startup than LangChain. 42× faster than CrewAI.</strong>
                    Python SDK live. built for developers who want production-grade agent infrastructure without the overhead.
                </div>
                <div class="test-block">
                    <div class="test-block-label">try it now</div>
                    <code>npm install -g cerebrex</code>
                    <code>cerebrex memex set my-agent "agent initialized" --key context</code>
                    <code>cerebrex kairos start my-agent --interval 300000</code>
                </div>
                <div class="cta-row">
                    <a href="__WHITEPAPER_URL__" class="btn-primary">read the whitepaper →</a>
                    <a href="https://registry.therealcool.site" class="btn-ghost" target="_blank" rel="noopener">try it live</a>
                    <a href="https://github.com/arealcoolco/CerebreX" class="btn-ghost" target="_blank" rel="noopener">github</a>
                </div>
                <div style="margin-top:0.5rem;font-family:'JetBrains Mono',monospace;font-size:0.62rem;letter-spacing:0.15em;color:rgba(255,255,255,0.35);text-transform:uppercase;">click tile to read the full whitepaper →</div>
            </div>
        </div>
    </div>

    <div class="bg-layer static-screen"></div>
    <div class="noise-overlay"></div>
    <div class="glitch-bars">
        <div class="glitch-bar"></div><div class="glitch-bar"></div>
        <div class="glitch-bar"></div><div class="glitch-bar"></div>
    </div>

    <div class="audio-controls">
        <button class="music-btn" onclick="toggleSpotifyPlayer()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
        </button>
    </div>
    <div class="spotify-player" id="spotifyPlayer">
        <div class="player-header">
            <span>now playing</span>
            <button class="close-player" onclick="toggleSpotifyPlayer()">&#x2715;</button>
        </div>
        <iframe src="https://open.spotify.com/embed/playlist/3uf994YwtZzjP6R2aRWVSe?utm_source=generator"
            width="100%" height="352" frameBorder="0" allowfullscreen=""
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy">
        </iframe>
    </div>

    <script>
        const bootMessages = [
            'BIOS Version 2.10.1337','Memory Test: 16384KB OK','Initializing CPU... OK',
            'Loading OS Kernel...','Mounting file systems...','Starting network services...',
            'Loading display drivers...','Initializing audio system...','Starting user interface...',
            'Loading applications...','Checking system integrity...','All systems operational.',
            'Welcome to therealcool.site','','something cool is loading...'
        ];
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelector('.container').style.opacity = '0';
            document.querySelector('.bg-layer').style.opacity = '0';
            document.querySelector('.noise-overlay').style.opacity = '0';
            document.querySelector('.glitch-bars').style.opacity = '0';
            startPageSequence();
        });
        function startPageSequence() { setTimeout(startBootSequence, 1500); }
        function startBootSequence() {
            const bootSequence = document.getElementById('bootSequence');
            const bootLines = document.getElementById('bootLines');
            document.getElementById('tvOverlay').style.display = 'none';
            bootSequence.classList.add('active');
            let i = 0;
            function next() {
                if (i < bootMessages.length) {
                    const line = document.createElement('div');
                    line.className = 'boot-line'; line.textContent = bootMessages[i];
                    bootLines.appendChild(line);
                    setTimeout(() => { line.style.opacity = '1'; }, 50);
                    i++;
                    setTimeout(next, i === bootMessages.length - 1 ? 1000 : 150);
                } else {
                    setTimeout(() => {
                        bootSequence.style.opacity = '0';
                        setTimeout(() => { bootSequence.style.display = 'none'; showLoadingScreen(); }, 500);
                    }, 800);
                }
            }
            next();
        }
        function showLoadingScreen() {
            const ls = document.getElementById('loadingScreen');
            const al = document.getElementById('asciiLogo');
            ls.classList.add('show');
            setTimeout(() => al.classList.add('show'), 500);
            setTimeout(() => {
                ls.classList.remove('show'); ls.classList.add('hide');
                setTimeout(() => { ls.style.display = 'none'; showMainContent(); }, 1000);
            }, 4000);
        }
        function showMainContent() {
            ['container','bg-layer','noise-overlay','glitch-bars'].forEach(c => {
                const el = document.querySelector('.' + c);
                if (el) { el.style.transition = 'opacity 1s ease'; el.style.opacity = '1'; }
            });
        }
        let isPlayerOpen = false;
        function toggleSpotifyPlayer() {
            const player = document.getElementById('spotifyPlayer');
            const btn = document.querySelector('.music-btn');
            isPlayerOpen = !isPlayerOpen;
            player.classList.toggle('active', isPlayerOpen);
            btn.classList.toggle('active', isPlayerOpen);
        }
        document.addEventListener('click', (e) => {
            const player = document.getElementById('spotifyPlayer');
            const btn = document.querySelector('.music-btn');
            if (isPlayerOpen && !player.contains(e.target) && !btn.contains(e.target)) toggleSpotifyPlayer();
        });
        // Make project tiles clickable (navigate to whitepaper unless clicking inner link/button)
        document.querySelectorAll('[data-href]').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', function(e) {
                if (!e.target.closest('a, button')) window.location.href = this.dataset.href;
            });
        });
        document.addEventListener('mousemove', (e) => {
            const c = document.createElement('div');
            c.style.cssText = 'position:fixed;width:4px;height:4px;background:rgba(255,255,255,0.8);pointer-events:none;z-index:9999;border-radius:50%;left:' + e.clientX + 'px;top:' + e.clientY + 'px;animation:cursorFade 0.8s ease-out forwards;box-shadow:0 0 10px rgba(255,255,255,0.6);';
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 800);
        });
        setInterval(() => {
            const els = document.querySelectorAll('.social-link,.logo-placeholder,.project-item');
            const el = els[Math.floor(Math.random() * els.length)];
            if (el) { el.style.boxShadow = '0 0 50px rgba(255,255,255,0.6)'; setTimeout(() => el.style.boxShadow = '', 200); }
        }, 5000);
        const s = document.createElement('style');
        s.textContent = '@keyframes cursorFade{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.5)}}';
        document.head.appendChild(s);
    </script>
</body>
</html>`;


// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// WHITEPAPER PAGE — CEREBREX TECHNICAL DOCUMENT
// ─────────────────────────────────────────────
const WHITEPAPER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CerebreX Whitepaper — The Agent Infrastructure OS</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23000'/%3E%3Ctext x='50' y='65' font-family='monospace' font-size='60' fill='%23fff' text-anchor='middle'%3E✦%3C/text%3E%3C/svg%3E">
    <meta name="description" content="CerebreX Whitepaper — the complete technical specification for the open-source Agent Infrastructure OS. Architecture, benchmarks, modules, and SDK documentation.">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="CerebreX Whitepaper — Agent Infrastructure OS">
    <meta property="og:description" content="The complete technical document. 8 modules, real benchmarks, and a Python SDK. Built by A Real Cool Co.">
    <meta property="og:type" content="website">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap" rel="stylesheet">
    <style>
        :root {
            --black: #000;
            --white: #fff;
            --off-white: #f0ede6;
            --dim: rgba(255,255,255,0.5);
            --dimmer: rgba(255,255,255,0.25);
            --dimmest: rgba(255,255,255,0.12);
            --rule: rgba(255,255,255,0.1);
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior: smooth; }
        body {
            background: var(--black);
            color: var(--white);
            font-family: 'Inter', sans-serif;
            overflow-x: hidden;
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }

        /* ── SCANLINES ── */
        body::before {
            content:'';
            position:fixed; top:0; left:0; width:100%; height:100%;
            background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.006) 3px, rgba(255,255,255,0.006) 4px);
            pointer-events:none; z-index:900;
        }

        /* ── PROGRESS BAR ── */
        #progress {
            position: fixed; top: 0; left: 0; height: 2px;
            background: var(--white); width: 0%; z-index: 1000;
            box-shadow: 0 0 8px rgba(255,255,255,0.5);
        }

        /* ── NAV ── */
        nav {
            position: fixed; top: 0; left: 0; right: 0;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 2.5rem; height: 52px;
            border-bottom: 1px solid var(--rule);
            background: rgba(0,0,0,0.92);
            backdrop-filter: blur(20px);
            z-index: 50;
        }
        .nav-logo {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.08em;
            text-decoration: none; color: var(--white);
        }
        .nav-links {
            display: flex; gap: 0; align-items: center;
        }
        .nav-links a {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; text-transform: lowercase;
            letter-spacing: 0.06em; color: var(--dim);
            text-decoration: none; padding: 0 1rem;
            border-left: 1px solid var(--rule);
            transition: color 0.2s; line-height: 52px;
        }
        .nav-links a:hover { color: var(--white); }
        .nav-links a.active { color: var(--white); }
        .nav-links .nav-cta {
            color: var(--white);
            border: 1px solid rgba(255,255,255,0.35);
            border-left: 1px solid rgba(255,255,255,0.35);
            margin-left: 1rem; padding: 0.4rem 1rem; line-height: normal;
            transition: all 0.2s;
        }
        .nav-links .nav-cta:hover { background: rgba(255,255,255,0.08); }
        @media (max-width: 700px) {
            .nav-links { display: none; }
        }

        /* ── HERO ── */
        .hero {
            min-height: 100vh;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 8rem 2rem 6rem;
            text-align: center;
            position: relative;
            border-bottom: 1px solid var(--rule);
        }
        .hero-eyebrow {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.68rem; text-transform: uppercase;
            letter-spacing: 0.3em; color: var(--dimmer);
            margin-bottom: 2.5rem;
            display: flex; align-items: center; gap: 1.5rem;
        }
        .hero-eyebrow::before, .hero-eyebrow::after {
            content: ''; flex: 0 0 40px; height: 1px; background: var(--rule);
        }
        .hero-title {
            font-family: 'Playfair Display', serif;
            font-size: clamp(3rem, 8vw, 6.5rem);
            font-weight: 900; line-height: 1.02;
            letter-spacing: -0.02em;
            max-width: 900px;
            margin-bottom: 1.5rem;
        }
        .hero-title em { font-style: italic; color: var(--dim); }
        .hero-thesis {
            font-family: 'Inter', sans-serif;
            font-size: clamp(1rem, 2vw, 1.2rem);
            font-weight: 300; line-height: 1.75;
            color: var(--dim); max-width: 620px;
            margin-bottom: 3.5rem;
        }
        .hero-stats {
            display: flex; gap: 3rem; align-items: center; justify-content: center;
            flex-wrap: wrap; margin-bottom: 3.5rem;
        }
        .hero-stat {
            text-align: center;
        }
        .hero-stat-num {
            font-family: 'Playfair Display', serif;
            font-size: 2.8rem; font-weight: 900; line-height: 1;
            margin-bottom: 0.3rem;
        }
        .hero-stat-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dim);
        }
        .hero-divider {
            width: 1px; height: 40px; background: var(--rule);
        }
        .hero-cta {
            display: flex; gap: 1rem; align-items: center; justify-content: center; flex-wrap: wrap;
        }
        .btn-solid {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.08em;
            padding: 0.85rem 2rem;
            background: var(--white); color: var(--black);
            border: 2px solid var(--white);
            text-decoration: none; transition: all 0.25s ease;
            display: inline-block;
        }
        .btn-solid:hover { background: transparent; color: var(--white); box-shadow: 0 0 30px rgba(255,255,255,0.25); }
        .btn-outline {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; font-weight: 400;
            text-transform: lowercase; letter-spacing: 0.08em;
            padding: 0.85rem 2rem;
            background: transparent; color: var(--dim);
            border: 1px solid rgba(255,255,255,0.3);
            text-decoration: none; transition: all 0.25s ease;
            display: inline-block;
        }
        .btn-outline:hover { border-color: var(--white); color: var(--white); box-shadow: 0 0 20px rgba(255,255,255,0.12); }
        .scroll-hint {
            position: absolute; bottom: 2.5rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.25em; color: var(--dimmer);
            display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
            animation: bounceDown 2s ease-in-out infinite;
        }
        @keyframes bounceDown { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }

        /* ── CONTENT ── */
        .content { max-width: 760px; margin: 0 auto; padding: 0 2rem; }

        section {
            padding: 7rem 0;
            border-bottom: 1px solid var(--rule);
        }
        section:last-of-type { border-bottom: none; }

        .section-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; text-transform: uppercase;
            letter-spacing: 0.28em; color: var(--dimmer);
            margin-bottom: 3rem;
            display: flex; align-items: center; gap: 1rem;
        }
        .section-label::after { content: ''; flex: 1; height: 1px; background: var(--rule); }

        /* ── PULL QUOTE ── */
        .pull-quote {
            font-family: 'Playfair Display', serif;
            font-size: clamp(1.5rem, 3.5vw, 2.4rem);
            font-weight: 400; line-height: 1.35;
            margin: 3rem 0;
            padding-left: 2rem;
            border-left: 2px solid rgba(255,255,255,0.35);
            color: var(--off-white);
        }
        .pull-quote em { font-style: italic; color: var(--dim); }

        /* ── BODY TEXT ── */
        .body-text {
            font-size: 1.05rem; font-weight: 300;
            line-height: 1.88; color: rgba(255,255,255,0.75);
            margin-bottom: 1.75rem;
        }
        .body-text strong { font-weight: 600; color: var(--white); }
        .body-text code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85em; background: rgba(255,255,255,0.07);
            padding: 0.1em 0.4em; border-radius: 2px;
        }

        /* ── CODE BLOCK ── */
        .code-block {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            padding: 1.5rem;
            margin: 2rem 0;
            overflow-x: auto;
            position: relative;
        }
        .code-block-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            margin-bottom: 0.75rem;
        }
        .code-block code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; line-height: 1.7;
            color: rgba(255,255,255,0.8);
            display: block; white-space: pre;
        }
        .copy-btn {
            position: absolute; top: 1rem; right: 1rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.15em;
            background: none; border: 1px solid var(--rule);
            color: var(--dimmer); padding: 0.25rem 0.6rem;
            cursor: pointer; transition: all 0.2s;
        }
        .copy-btn:hover { border-color: rgba(255,255,255,0.4); color: var(--white); }

        /* ── STAT GRID ── */
        .stat-grid {
            display: grid; grid-template-columns: repeat(2, 1fr);
            gap: 0; margin: 3rem 0;
            border: 1px solid var(--rule);
        }
        .stat-cell {
            padding: 2rem;
            border-right: 1px solid var(--rule);
            border-bottom: 1px solid var(--rule);
        }
        .stat-cell:nth-child(even) { border-right: none; }
        .stat-cell:nth-last-child(-n+2) { border-bottom: none; }
        .stat-number {
            font-family: 'Playfair Display', serif;
            font-size: 3rem; font-weight: 900; line-height: 1;
            margin-bottom: 0.4rem;
        }
        .stat-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.68rem; text-transform: uppercase;
            letter-spacing: 0.15em; color: var(--dim);
        }
        .stat-sub {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.62rem; color: var(--dimmer);
            margin-top: 0.3rem;
        }

        /* ── COMPARISON TABLE ── */
        .compare-table {
            width: 100%; border-collapse: collapse;
            margin: 2.5rem 0; font-family: 'JetBrains Mono', monospace;
            font-size: 0.78rem;
        }
        .compare-table th {
            text-transform: uppercase; letter-spacing: 0.15em;
            font-size: 0.62rem; color: var(--dimmer);
            padding: 0.75rem 1rem; text-align: left;
            border-bottom: 1px solid var(--rule);
        }
        .compare-table th:first-child { padding-left: 0; }
        .compare-table td {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            color: rgba(255,255,255,0.7);
        }
        .compare-table td:first-child { padding-left: 0; color: var(--white); font-weight: 700; }
        .compare-table td.yes { color: var(--white); }
        .compare-table td.no { color: var(--dimmer); }
        .compare-table tr.highlight td { color: var(--white); }

        /* ── MODULE CARD ── */
        .module-grid {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 1px; background: var(--rule);
            border: 1px solid var(--rule);
            margin: 3rem 0;
        }
        .module-card {
            background: var(--black);
            padding: 2rem;
            transition: background 0.2s;
        }
        .module-card:hover { background: rgba(255,255,255,0.02); }
        .module-card-id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            margin-bottom: 0.75rem;
            display: flex; align-items: center; gap: 0.5rem;
        }
        .module-badge {
            display: inline-block;
            border: 1px solid rgba(255,255,255,0.3);
            padding: 0.1rem 0.4rem;
            font-size: 0.55rem; letter-spacing: 0.1em;
            color: var(--dim);
        }
        .module-badge.live { border-color: var(--white); color: var(--white); }
        .module-card-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.2rem; font-weight: 700;
            letter-spacing: 0.05em;
            margin-bottom: 0.6rem;
        }
        .module-card-desc {
            font-size: 0.82rem; font-weight: 300;
            line-height: 1.65; color: rgba(255,255,255,0.55);
        }
        @media (max-width: 550px) { .module-grid { grid-template-columns: 1fr; } }

        /* ── MODULE DEEP DIVE ── */
        .module-header {
            display: flex; align-items: flex-start; gap: 1.5rem;
            margin-bottom: 3rem;
        }
        .module-num {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            padding-top: 0.5rem; white-space: nowrap;
        }
        .module-title-lg {
            font-family: 'JetBrains Mono', monospace;
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 700; letter-spacing: 0.04em;
        }
        .module-status {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.58rem; text-transform: uppercase;
            letter-spacing: 0.15em;
            border: 1px solid rgba(255,255,255,0.25);
            padding: 0.18rem 0.55rem; color: var(--dim);
            white-space: nowrap; align-self: flex-start; margin-top: 0.6rem;
        }
        .module-status.live { border-color: var(--white); color: var(--white); }

        /* ── FEATURE LIST ── */
        .feature-list { margin: 2rem 0; list-style: none; }
        .feature-list li {
            display: flex; align-items: flex-start; gap: 1rem;
            padding: 0.75rem 0; border-bottom: 1px solid var(--rule);
            font-size: 0.95rem; font-weight: 300;
            line-height: 1.6; color: rgba(255,255,255,0.72);
            opacity: 0; transform: translateX(-12px);
            transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .feature-list li.visible { opacity: 1; transform: translateX(0); }
        .feature-list li::before {
            content: '→';
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem; color: var(--dimmer);
            padding-top: 0.15rem; flex-shrink: 0;
        }
        .feature-list li strong { color: var(--white); font-weight: 600; }

        /* ── STEPS ── */
        .steps { margin: 2rem 0; }
        .step {
            display: grid; grid-template-columns: 3rem 1fr;
            gap: 1.5rem; padding: 1.5rem 0;
            border-bottom: 1px solid var(--rule);
            opacity: 0; transform: translateY(12px);
            transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .step.visible { opacity: 1; transform: translateY(0); }
        .step-num {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.5rem; font-weight: 700;
            color: rgba(255,255,255,0.12); line-height: 1;
        }
        .step-title { font-size: 0.95rem; font-weight: 600; margin-bottom: 0.4rem; }
        .step-code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem; color: rgba(255,255,255,0.65);
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            padding: 0.5rem 0.75rem; margin-top: 0.4rem;
            display: block;
        }

        /* ── GLYPH DIVIDER ── */
        .glyph-divider {
            text-align: center; padding: 4rem 0;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; letter-spacing: 0.35em;
            text-transform: uppercase; color: var(--dimmer);
        }

        /* ── MANIFESTO ── */
        .manifesto { margin: 3.5rem 0; }
        .manifesto-line {
            font-family: 'Inter', sans-serif;
            font-size: clamp(1rem, 2.5vw, 1.35rem);
            font-weight: 700; line-height: 1.4;
            padding: 1.2rem 0;
            border-bottom: 1px solid var(--rule);
            display: flex; align-items: flex-start; gap: 1.5rem;
            opacity: 0; transform: translateX(-20px);
            transition: opacity 0.55s ease, transform 0.55s ease;
        }
        .manifesto-line.visible { opacity: 1; transform: translateX(0); }
        .manifesto-line .num {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; font-weight: 400;
            color: var(--dimmer); padding-top: 0.3rem; min-width: 1.8rem;
        }

        /* ── REVEAL ── */
        .reveal {
            opacity: 0; transform: translateY(24px);
            transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        /* ── ACCESS FORM ── */
        .access-form {
            display: flex; gap: 0; margin: 2.5rem 0;
        }
        .access-form input {
            flex: 1; background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.25);
            border-right: none;
            color: var(--white); font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; padding: 0.85rem 1rem;
            outline: none;
        }
        .access-form input::placeholder { color: var(--dimmer); }
        .access-form input:focus { border-color: rgba(255,255,255,0.5); }
        .access-form button {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.78rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.08em;
            background: var(--white); color: var(--black);
            border: none; padding: 0.85rem 1.5rem;
            cursor: pointer; white-space: nowrap; transition: all 0.2s;
        }
        .access-form button:hover { background: rgba(255,255,255,0.85); }
        .access-form button:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── FOOTER ── */
        footer {
            padding: 4rem 0; text-align: center;
            border-top: 1px solid var(--rule);
        }
        .footer-links {
            display: flex; gap: 2rem; justify-content: center;
            flex-wrap: wrap; margin-bottom: 2rem;
        }
        .footer-links a {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem; text-transform: lowercase;
            letter-spacing: 0.08em; color: var(--dimmer);
            text-decoration: none; transition: color 0.2s;
        }
        .footer-links a:hover { color: var(--white); }
        .footer-copy {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; color: var(--dimmest);
            letter-spacing: 0.1em;
        }

        @media (max-width: 600px) {
            .hero-stats { gap: 1.5rem; }
            .hero-divider { display: none; }
            .stat-grid { grid-template-columns: 1fr; }
            .stat-cell { border-right: none; }
            .stat-cell:nth-child(even) { border-right: none; }
            .stat-cell:nth-last-child(-n+2) { border-bottom: 1px solid var(--rule); }
            .stat-cell:last-child { border-bottom: none; }
            .access-form { flex-direction: column; }
            .access-form input { border-right: 1px solid rgba(255,255,255,0.25); border-bottom: none; }
            .compare-table { font-size: 0.7rem; }
        }
    </style>
</head>
<body>
    <div id="progress"></div>

    <nav>
        <a href="/" class="nav-logo">cerebrex</a>
        <div class="nav-links">
            <a href="#problem">problem</a>
            <a href="#architecture">architecture</a>
            <a href="#benchmarks">benchmarks</a>
            <a href="#sdk">sdk</a>
            <a href="#quickstart">quickstart</a>
            <a href="https://registry.therealcool.site" class="nav-cta" target="_blank" rel="noopener">try it live →</a>
        </div>
    </nav>

    <!-- ── HERO ── -->
    <div class="hero">
        <div class="hero-eyebrow">whitepaper — v0.9.4</div>
        <h1 class="hero-title">The Agent Infrastructure <em>OS</em></h1>
        <p class="hero-thesis">
            AI agents are powerful. The infrastructure around them is broken.
            CerebreX is the open-source operating system that gives every agent
            persistent memory, autonomous scheduling, multi-agent coordination,
            end-to-end observability, and a package ecosystem —
            all in one coherent platform.
        </p>
        <div class="hero-stats">
            <div class="hero-stat">
                <div class="hero-stat-num">8</div>
                <div class="hero-stat-label">live modules</div>
            </div>
            <div class="hero-divider"></div>
            <div class="hero-stat">
                <div class="hero-stat-num">26×</div>
                <div class="hero-stat-label">faster than LangChain</div>
            </div>
            <div class="hero-divider"></div>
            <div class="hero-stat">
                <div class="hero-stat-num">0.01ms</div>
                <div class="hero-stat-label">memory read latency</div>
            </div>
            <div class="hero-divider"></div>
            <div class="hero-stat">
                <div class="hero-stat-num">27k</div>
                <div class="hero-stat-label">trace ops / sec</div>
            </div>
        </div>
        <div class="hero-cta">
            <a href="https://registry.therealcool.site" class="btn-solid" target="_blank" rel="noopener">try it live →</a>
            <a href="#quickstart" class="btn-outline">quickstart</a>
            <a href="https://github.com/arealcoolco/CerebreX" class="btn-outline" target="_blank" rel="noopener">github</a>
        </div>
        <div class="scroll-hint">
            <span>scroll</span>
            <svg width="12" height="16" viewBox="0 0 12 16" fill="none"><path d="M6 1v12M1 9l5 5 5-5" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
    </div>

    <!-- ── THE PROBLEM ── -->
    <section id="problem">
        <div class="content">
            <div class="section-label">01 — the problem</div>
            <div class="pull-quote reveal">
                Every team building AI agents reinvents the same infrastructure. <em>Over and over again.</em>
            </div>
            <p class="body-text reveal">
                The current generation of agent frameworks — LangChain, CrewAI, AutoGen, Semantic Kernel —
                solved the right problem at the wrong layer. They gave developers chains, crews, and graphs.
                But they left the hard parts completely exposed: <strong>where does memory persist between sessions?
                How does an agent act while you're asleep? What happens when two agents need to coordinate
                without stepping on each other? Who owns the package ecosystem?</strong>
            </p>
            <p class="body-text reveal">
                The result is every engineering team spending weeks building the same bespoke infrastructure:
                a custom memory layer bolted to Redis or Postgres, a cron job that half-works, a hand-rolled
                message bus for multi-agent coordination, a Datadog dashboard that never quite shows what you need.
                This work is expensive, fragile, and completely duplicated across the industry.
            </p>
            <div class="manifesto">
                <div class="manifesto-line">
                    <span class="num">01</span>
                    <span>Frameworks give you chains. Nobody gives you the OS underneath.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">02</span>
                    <span>Agents have no persistent memory. Every session starts from zero.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">03</span>
                    <span>Agents stop working the moment you close your laptop.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">04</span>
                    <span>Multi-agent coordination is solved differently by every team.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">05</span>
                    <span>There is no shared package registry for agent tooling. There should be.</span>
                </div>
            </div>
            <p class="body-text reveal">
                CerebreX is the answer. Not another framework. An <strong>operating system</strong> for agents —
                the layer that sits beneath your LLM calls and above your cloud infrastructure,
                providing every service an agent needs to be production-ready on day one.
            </p>
        </div>
    </section>

    <!-- ── ARCHITECTURE ── -->
    <section id="architecture">
        <div class="content">
            <div class="section-label">02 — architecture</div>
            <h2 class="reveal" style="font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3.5rem);font-weight:900;line-height:1.1;margin-bottom:2rem;">Eight modules. One coherent OS.</h2>
            <p class="body-text reveal">
                CerebreX is structured as eight production-ready modules, each deployable independently
                but designed to work as an integrated system. Every module is a Cloudflare Worker with
                its own D1 database, KV namespace, and Durable Object — stateful, globally distributed,
                zero cold-start infrastructure.
            </p>

            <div class="module-grid reveal">
                <div class="module-card">
                    <div class="module-card-id"><span>01</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">FORGE</div>
                    <div class="module-card-desc">MCP server scaffolding. Turn an OpenAPI spec into a deployed, validated MCP server in under 60 seconds.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>02</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">TRACE</div>
                    <div class="module-card-desc">Agent observability. Record every decision, tool call, and LLM response with structured step logging at 27,435 ops/sec.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>03</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">MEMEX</div>
                    <div class="module-card-desc">Three-layer persistent memory: index (facts), topics (structured knowledge), and transcripts (session history). 0.01ms reads.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>04</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">AUTH</div>
                    <div class="module-card-desc">Token-scoped API key management. Per-agent authentication with full audit trail and CLI-based key rotation.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>05</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">REGISTRY</div>
                    <div class="module-card-desc">The npm for MCP servers. Publish, discover, and install agent tooling. Open to browse — no account required.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>06</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">HIVE</div>
                    <div class="module-card-desc">Multi-agent coordination with risk gating. Swarms of agents that self-organize, share memory, and vote before destructive actions.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>07</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">KAIROS</div>
                    <div class="module-card-desc">Autonomous background daemons. Agents that run on a 5-minute tick loop — deciding whether to act or stay quiet — while you're offline.</div>
                </div>
                <div class="module-card">
                    <div class="module-card-id"><span>08</span><span class="module-badge live">live</span></div>
                    <div class="module-card-name">ULTRAPLAN</div>
                    <div class="module-card-desc">Opus-powered long-range planning. Decompose a goal into an approved task graph. Human-in-the-loop before any action is taken.</div>
                </div>
            </div>

            <!-- FORGE -->
            <div class="glyph-divider">✦ ── module 01 ── ✦</div>
            <div class="module-header">
                <div class="module-num">01 / 08</div>
                <div>
                    <div class="module-title-lg">FORGE</div>
                    <div class="module-status live">live — scaffolding engine</div>
                </div>
            </div>
            <div class="pull-quote reveal">From spec to deployed MCP server in under 60 seconds.</div>
            <p class="body-text reveal">
                FORGE is the scaffolding engine. Feed it an OpenAPI specification —
                a YAML or JSON file describing your API's endpoints, methods, and schemas —
                and it generates a fully-typed, validated MCP server ready to deploy on Cloudflare Workers.
                No boilerplate. No manual glue code.
            </p>
            <div class="code-block reveal">
                <div class="code-block-label">bash — generate a server</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>cerebrex build --spec ./my-api.yaml --name my-agent-server
# → validates spec (7 checks)
# → generates MCP server scaffold
# → writes to ./dist/my-agent-server/
# → deploys to Cloudflare Workers (optional)</code>
            </div>
            <ul class="feature-list">
                <li><strong>OpenAPI 3.x support</strong> — parse and validate any standard spec</li>
                <li><strong>Type-safe generation</strong> — TypeScript output with full type inference</li>
                <li><strong>7-point validation</strong> — checks required fields, path integrity, auth schemes</li>
                <li><strong>One-command deploy</strong> — wrangler integration included out of the box</li>
                <li><strong>MCP-native output</strong> — tools, resources, and prompts generated automatically</li>
            </ul>

            <!-- TRACE -->
            <div class="glyph-divider">✦ ── module 02 ── ✦</div>
            <div class="module-header">
                <div class="module-num">02 / 08</div>
                <div>
                    <div class="module-title-lg">TRACE</div>
                    <div class="module-status live">live — observability</div>
                </div>
            </div>
            <div class="pull-quote reveal">27,435 ops/sec. Every decision logged. Nothing lost.</div>
            <p class="body-text reveal">
                TRACE is the observability layer. Every agent action — tool calls, LLM responses,
                decisions, errors — is recorded as a structured step in an append-only session log.
                Sessions are retrievable by agent ID, time window, or outcome. The TRACE server
                runs locally on port 7432 and is accessible via the registry UI or CLI.
            </p>
            <div class="code-block reveal">
                <div class="code-block-label">python — recording steps</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>from cerebrex import CerebreXClient

async with CerebreXClient(api_key="cx-...") as client:
    session_id = await client.trace.create_session("my-agent")
    await client.trace.record_step(
        session_id, "tool_call",
        input={"tool": "web_search", "query": "CerebreX"},
        output={"results": [...]},
        duration_ms=312,
    )</code>
            </div>
            <ul class="feature-list">
                <li><strong>27,435 ops/sec</strong> — zero-overhead structured logging at production scale</li>
                <li><strong>Session grouping</strong> — correlate steps across multi-turn agent conversations</li>
                <li><strong>Browser viewer</strong> — drag-and-drop trace files at registry.therealcool.site</li>
                <li><strong>Structured output</strong> — every step has typed input, output, and duration_ms</li>
                <li><strong>CLI access</strong> — <code>cerebrex trace list</code> and <code>cerebrex trace view &lt;id&gt;</code></li>
            </ul>

            <!-- MEMEX -->
            <div class="glyph-divider">✦ ── module 03 ── ✦</div>
            <div class="module-header">
                <div class="module-num">03 / 08</div>
                <div>
                    <div class="module-title-lg">MEMEX</div>
                    <div class="module-status live">live — persistent memory</div>
                </div>
            </div>
            <div class="pull-quote reveal">Agents forget. MEMEX remembers.</div>
            <p class="body-text reveal">
                MEMEX is the memory layer — a three-tier persistent knowledge store that survives
                between sessions, across restarts, and through context window resets. It gives
                agents the ability to build up knowledge over time, not just within a single conversation.
            </p>
            <p class="body-text reveal">
                The three tiers serve different timescales. The <strong>index</strong> holds current facts
                (today's priorities, active context). <strong>Topics</strong> hold structured knowledge
                that evolves slowly (agent persona, project history, tool configurations). <strong>Transcripts</strong>
                capture the raw session history for consolidation and retrieval.
            </p>
            <div class="code-block reveal">
                <div class="code-block-label">python — assembling context from all three layers</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>from cerebrex import CerebreXClient

async with CerebreXClient(api_key="cx-...") as client:
    # Assemble a system prompt from all memory layers
    context = await client.memex.assemble_context(
        "my-agent",
        topics=["persona", "project-history", "tools"],
    )
    # context.system_prompt → ready to inject into Claude
    print(context.system_prompt)
    # {"index": 12, "topics": 847, "transcripts": 3241} ← token breakdown
    print(context.layers)</code>
            </div>
            <ul class="feature-list">
                <li><strong>0.01ms read latency</strong> — Cloudflare KV-backed, globally distributed</li>
                <li><strong>Three-layer architecture</strong> — index, topics, and transcripts with independent TTLs</li>
                <li><strong>Context assembly</strong> — one call produces a system prompt from all layers</li>
                <li><strong>25KB per layer</strong> — enforced size limits prevent context bloat</li>
                <li><strong>CLI-first</strong> — <code>cerebrex memex set/get/list</code> for any agent, any layer</li>
            </ul>

            <!-- KAIROS -->
            <div class="glyph-divider">✦ ── module 07 ── ✦</div>
            <div class="module-header">
                <div class="module-num">07 / 08</div>
                <div>
                    <div class="module-title-lg">KAIROS</div>
                    <div class="module-status live">live — autonomous daemons</div>
                </div>
            </div>
            <div class="pull-quote reveal">Your agent keeps working while you sleep.</div>
            <p class="body-text reveal">
                KAIROS gives every agent an autonomous background daemon — a Durable Object
                that wakes on a configurable tick interval (default: 5 minutes), asks Claude
                whether there is anything to act on, and either takes action or stays quiet.
                The decision and its reasoning are logged to D1. Every tick is auditable.
            </p>
            <div class="code-block reveal">
                <div class="code-block-label">bash — starting a daemon</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>cerebrex kairos start my-agent --interval 300000
# Agent wakes every 5 minutes
# → reads MEMEX context
# → asks Claude: "is there anything to do?"
# → if yes: executes queued tasks
# → logs decision + reasoning to D1

cerebrex kairos log my-agent --limit 10
# → shows last 10 tick decisions with reasoning</code>
            </div>
            <ul class="feature-list">
                <li><strong>Durable Object tick loop</strong> — survives Cloudflare restarts, guaranteed execution</li>
                <li><strong>Claude-native decision engine</strong> — the agent itself decides whether to act</li>
                <li><strong>Task queue integration</strong> — KAIROS processes tasks queued by ULTRAPLAN or external triggers</li>
                <li><strong>Full audit trail</strong> — every tick logged with reasoning, action, and result</li>
                <li><strong>Configurable interval</strong> — from 1-minute sprints to hourly background sweeps</li>
            </ul>

            <!-- HIVE -->
            <div class="glyph-divider">✦ ── module 06 ── ✦</div>
            <div class="module-header">
                <div class="module-num">06 / 08</div>
                <div>
                    <div class="module-title-lg">HIVE</div>
                    <div class="module-status live">live — multi-agent coordination</div>
                </div>
            </div>
            <div class="pull-quote reveal">Agents that coordinate. Not just communicate.</div>
            <p class="body-text reveal">
                HIVE is the multi-agent coordination layer. It lets you launch a swarm of agents
                around a shared goal, with a risk gate that requires quorum before any destructive
                action proceeds. Agents in a HIVE share a memory pool (via MEMEX) and coordinate
                through a structured message bus — not ad-hoc string passing.
            </p>
            <ul class="feature-list">
                <li><strong>Shared memory pool</strong> — all agents in a swarm read from the same MEMEX index</li>
                <li><strong>Risk gate voting</strong> — destructive actions require configurable quorum before execution</li>
                <li><strong>Role assignment</strong> — agents take on structured roles (orchestrator, executor, verifier)</li>
                <li><strong>Structured bus</strong> — typed message passing, not freeform string prompts</li>
                <li><strong>Audit-ready</strong> — every coordination decision logged and queryable</li>
            </ul>

            <!-- ULTRAPLAN -->
            <div class="glyph-divider">✦ ── module 08 ── ✦</div>
            <div class="module-header">
                <div class="module-num">08 / 08</div>
                <div>
                    <div class="module-title-lg">ULTRAPLAN</div>
                    <div class="module-status live">live — long-range planning</div>
                </div>
            </div>
            <div class="pull-quote reveal">Give an agent a goal. Get back an approved task graph.</div>
            <p class="body-text reveal">
                ULTRAPLAN uses Claude Opus 4 to decompose a high-level goal into a sequenced,
                dependency-aware task graph. The plan sits in a <code>pending</code> state until a human
                explicitly approves it. Only then does KAIROS begin executing the queued tasks.
                This makes long-horizon agent behavior auditable and reversible.
            </p>
            <div class="code-block reveal">
                <div class="code-block-label">python — creating and approving a plan</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>from cerebrex import CerebreXClient

async with CerebreXClient(api_key="cx-...") as client:
    # Claude Opus decomposes the goal
    plan = await client.ultraplan.create(
        "my-agent",
        goal="Audit all GitHub repos for security issues and open issues for findings",
    )
    print(plan.plan_id)  # "plan-abc123"
    print(plan.status)   # "pending" — waiting for human approval

    # Review the plan, then approve
    await client.ultraplan.approve(plan.plan_id)
    # KAIROS begins executing tasks in dependency order</code>
            </div>
        </div>
    </section>

    <!-- ── BENCHMARKS ── -->
    <section id="benchmarks">
        <div class="content">
            <div class="section-label">03 — benchmarks</div>
            <div class="pull-quote reveal">
                Real numbers. Real competition. <em>Measured, not estimated.</em>
            </div>
            <p class="body-text reveal">
                All benchmarks run on v0.9.4 against production endpoints. Competitor numbers
                measured with identical hardware and methodology. Full results at
                <code>benchmarks/results/v0.9.4.json</code> in the repository.
            </p>

            <div class="stat-grid reveal">
                <div class="stat-cell">
                    <div class="stat-number">26×</div>
                    <div class="stat-label">faster startup vs LangChain</div>
                    <div class="stat-sub">CerebreX ~80ms vs LangChain ~2,100ms</div>
                </div>
                <div class="stat-cell">
                    <div class="stat-number">42×</div>
                    <div class="stat-label">faster startup vs CrewAI</div>
                    <div class="stat-sub">CerebreX ~80ms vs CrewAI ~3,400ms</div>
                </div>
                <div class="stat-cell">
                    <div class="stat-number">0.01ms</div>
                    <div class="stat-label">MEMEX read p50 latency</div>
                    <div class="stat-sub">reads from Cloudflare KV edge cache</div>
                </div>
                <div class="stat-cell">
                    <div class="stat-number">27,435</div>
                    <div class="stat-label">TRACE ops / sec</div>
                    <div class="stat-sub">structured step recording throughput</div>
                </div>
            </div>

            <p class="body-text reveal" style="margin-top:2rem;">
                <strong>Competitive feature matrix</strong> — what CerebreX includes out of the box vs. what each competitor requires you to build yourself:
            </p>
            <table class="compare-table reveal">
                <thead>
                    <tr>
                        <th>capability</th>
                        <th>cerebrex</th>
                        <th>langchain</th>
                        <th>crewai</th>
                        <th>autogen</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="highlight">
                        <td>persistent memory</td>
                        <td class="yes">✓ built-in</td>
                        <td class="no">DIY</td>
                        <td class="no">DIY</td>
                        <td class="no">DIY</td>
                    </tr>
                    <tr>
                        <td>background daemons</td>
                        <td class="yes">✓ KAIROS</td>
                        <td class="no">—</td>
                        <td class="no">—</td>
                        <td class="no">—</td>
                    </tr>
                    <tr>
                        <td>multi-agent risk gating</td>
                        <td class="yes">✓ HIVE</td>
                        <td class="no">—</td>
                        <td class="no">partial</td>
                        <td class="no">—</td>
                    </tr>
                    <tr>
                        <td>structured observability</td>
                        <td class="yes">✓ TRACE</td>
                        <td class="no">DIY</td>
                        <td class="no">DIY</td>
                        <td class="no">DIY</td>
                    </tr>
                    <tr>
                        <td>package registry</td>
                        <td class="yes">✓ live</td>
                        <td class="no">—</td>
                        <td class="no">—</td>
                        <td class="no">—</td>
                    </tr>
                    <tr>
                        <td>long-range planning</td>
                        <td class="yes">✓ ULTRAPLAN</td>
                        <td class="no">DIY</td>
                        <td class="no">partial</td>
                        <td class="no">DIY</td>
                    </tr>
                    <tr>
                        <td>MCP scaffolding</td>
                        <td class="yes">✓ FORGE</td>
                        <td class="no">—</td>
                        <td class="no">—</td>
                        <td class="no">—</td>
                    </tr>
                    <tr>
                        <td>startup time</td>
                        <td class="yes">~80ms</td>
                        <td class="no">~2,100ms</td>
                        <td class="no">~3,400ms</td>
                        <td class="no">~1,800ms</td>
                    </tr>
                </tbody>
            </table>
            <p class="body-text reveal" style="font-size:0.85rem;color:var(--dimmer);">
                DIY = requires custom implementation by the engineering team.
                Competitor numbers measured April 2026. Full methodology in BENCHMARKS.md.
            </p>
        </div>
    </section>

    <!-- ── PYTHON SDK ── -->
    <section id="sdk">
        <div class="content">
            <div class="section-label">04 — python sdk</div>
            <div class="pull-quote reveal">
                Every module. One async client. Zero configuration.
            </div>
            <p class="body-text reveal">
                The CerebreX Python SDK is an async-first client library wrapping every REST API
                in the platform. Built with <code>httpx</code> and <code>pydantic v2</code> for type-safe,
                high-performance access to MEMEX, TRACE, KAIROS, HIVE, ULTRAPLAN, and the Registry.
                Available now on PyPI.
            </p>
            <div class="code-block reveal">
                <div class="code-block-label">bash — install</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>pip install cerebrex

# With LangChain integration
pip install "cerebrex[langchain]"

# With CrewAI integration
pip install "cerebrex[crewai]"</code>
            </div>
            <div class="code-block reveal">
                <div class="code-block-label">python — full agent session with MEMEX + TRACE</div>
                <button class="copy-btn" onclick="copyCode(this)">copy</button>
                <code>import asyncio
from cerebrex import CerebreXClient

async def run_agent():
    async with CerebreXClient(api_key="cx-your-key") as client:
        # Load persistent memory into system prompt
        ctx = await client.memex.assemble_context(
            "research-agent",
            topics=["persona", "project-history"],
        )

        # Start a trace session
        session_id = await client.trace.create_session("research-agent")

        # Your agent logic here — inject ctx.system_prompt into Claude
        # ...

        # Record what happened
        await client.trace.record_step(
            session_id, "research_complete",
            input={"query": "AI infrastructure trends"},
            output={"findings": 7, "sources": 12},
            duration_ms=4820,
        )

        # Update memory with new findings
        await client.memex.write_index(
            "research-agent",
            ctx.system_prompt + "\\n- Completed trend research 2026-04-11",
        )

asyncio.run(run_agent())</code>
            </div>
            <ul class="feature-list">
                <li><strong>Async-first</strong> — built on <code>httpx.AsyncClient</code> for non-blocking I/O</li>
                <li><strong>Pydantic v2 models</strong> — every API response is a typed, validated dataclass</li>
                <li><strong>Full coverage</strong> — MEMEX, TRACE, KAIROS, HIVE, ULTRAPLAN, Registry, AUTH</li>
                <li><strong>LangChain integration</strong> — inject MEMEX memory into LangChain agent prompts</li>
                <li><strong>CrewAI integration</strong> — use CerebreX tools inside a CrewAI crew</li>
                <li><strong>Typed exceptions</strong> — <code>AuthenticationError</code>, <code>NotFoundError</code>, <code>RateLimitError</code></li>
                <li><strong>Python 3.10+</strong> — tested on 3.10, 3.11, and 3.12 in CI</li>
            </ul>
        </div>
    </section>

    <!-- ── TRY IT LIVE ── -->
    <section id="try-live" style="background:rgba(255,255,255,0.02);border-top:1px solid var(--rule);">
        <div class="content" style="text-align:center;">
            <div class="section-label" style="justify-content:center;">05 — try it live</div>
            <h2 class="reveal" style="font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3.5rem);font-weight:900;line-height:1.1;margin-bottom:1.5rem;">
                CerebreX Project Example
            </h2>
            <p class="body-text reveal" style="max-width:580px;margin:0 auto 2.5rem;">
                Every module is live and interactive at <strong>registry.therealcool.site</strong>.
                Drop a trace file, query the package registry, explore the MEMEX API, and
                watch the KAIROS daemon status — all in your browser, no install required.
                This is what CerebreX looks like in production.
            </p>
            <div class="reveal" style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-bottom:2rem;">
                <a href="https://registry.therealcool.site" class="btn-solid" target="_blank" rel="noopener">open the project example →</a>
                <a href="https://registry.therealcool.site#trace" class="btn-outline" target="_blank" rel="noopener">try the trace viewer</a>
                <a href="https://registry.therealcool.site#registry" class="btn-outline" target="_blank" rel="noopener">browse the registry</a>
            </div>
            <div class="reveal" style="font-family:'JetBrains Mono',monospace;font-size:0.68rem;letter-spacing:0.15em;color:var(--dimmer);text-transform:uppercase;">
                registry.therealcool.site — live, no login required
            </div>
        </div>
    </section>

    <!-- ── QUICKSTART ── -->
    <section id="quickstart">
        <div class="content">
            <div class="section-label">06 — quickstart</div>
            <div class="pull-quote reveal">From zero to autonomous agent in five steps.</div>
            <div class="steps">
                <div class="step">
                    <div class="step-num">01</div>
                    <div class="step-content">
                        <div class="step-title">Install the CLI</div>
                        <code class="step-code">npm install -g cerebrex</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">02</div>
                    <div class="step-content">
                        <div class="step-title">Authenticate</div>
                        <code class="step-code">cerebrex auth login</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">03</div>
                    <div class="step-content">
                        <div class="step-title">Give your agent memory</div>
                        <code class="step-code">cerebrex memex set my-agent "Project: CerebreX integration" --key context</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">04</div>
                    <div class="step-content">
                        <div class="step-title">Start a background daemon</div>
                        <code class="step-code">cerebrex kairos start my-agent --interval 300000</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">05</div>
                    <div class="step-content">
                        <div class="step-title">Install community tooling from the registry</div>
                        <code class="step-code">cerebrex install @arealcoolco/github-mcp
cerebrex configure @arealcoolco/github-mcp --env GITHUB_TOKEN=ghp_...</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">06</div>
                    <div class="step-content">
                        <div class="step-title">Test your agent's behaviour</div>
                        <code class="step-code">cerebrex test init
cerebrex test run --verbose</code>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ── OPEN SOURCE ── -->
    <section id="open-source">
        <div class="content">
            <div class="section-label">07 — open source</div>
            <div class="pull-quote reveal">
                Infrastructure this important should belong to everyone. <em>Not a company.</em>
            </div>
            <p class="body-text reveal">
                CerebreX is <strong>Apache 2.0 licensed</strong>. Every line of the CLI, every worker,
                every SDK — open, forkable, auditable. We believe the operating system layer for AI agents
                should be a public good, not a commercial moat.
            </p>
            <p class="body-text reveal">
                Built by <strong>A Real Cool Co.</strong> — a creative studio building the future
                through an Afro Futurist lens. We ship real things. We open-source what matters.
                CerebreX is the thing that matters most right now.
            </p>
            <div class="manifesto" style="margin-top:3rem;">
                <div class="manifesto-line">
                    <span class="num">→</span>
                    <span>The agent OS should not be owned by a single company.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">→</span>
                    <span>Every agent deserves production-grade infrastructure on day one.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">→</span>
                    <span>Memory, autonomy, and coordination are not premium features.</span>
                </div>
                <div class="manifesto-line">
                    <span class="num">→</span>
                    <span>The community builds better tools than any one team. Let them share.</span>
                </div>
            </div>
            <div class="reveal" style="margin-top:3rem;display:flex;gap:1rem;flex-wrap:wrap;">
                <a href="https://github.com/arealcoolco/CerebreX" class="btn-solid" target="_blank" rel="noopener">star on github →</a>
                <a href="https://github.com/arealcoolco/CerebreX/blob/main/CONTRIBUTING.md" class="btn-outline" target="_blank" rel="noopener">contributing guide</a>
            </div>
        </div>
    </section>

    <!-- ── STAY UPDATED ── -->
    <section id="access">
        <div class="content">
            <div class="section-label">08 — stay updated</div>
            <h2 class="reveal" style="font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3rem);font-weight:900;line-height:1.1;margin-bottom:1rem;">
                Get notified when new modules ship.
            </h2>
            <p class="body-text reveal">
                The roadmap includes a cloud dashboard, MCP server marketplace,
                agent-to-agent billing, and a hosted multi-tenant HIVE — all free and open.
                Drop your email to hear about it first.
            </p>
            <div class="access-form reveal">
                <input type="email" id="emailInput" placeholder="your@email.com">
                <button id="submitBtn" onclick="submitEmail()">notify me</button>
            </div>
            <p class="reveal" style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--dimmer);letter-spacing:0.1em;margin-top:1rem;">
                no spam. just ship notes. unsubscribe any time.
            </p>
        </div>
    </section>

    <!-- ── FOOTER ── -->
    <footer>
        <div class="content">
            <div class="footer-links">
                <a href="/">home</a>
                <a href="#problem">the problem</a>
                <a href="#architecture">architecture</a>
                <a href="#benchmarks">benchmarks</a>
                <a href="#sdk">python sdk</a>
                <a href="#quickstart">quickstart</a>
                <a href="https://registry.therealcool.site" target="_blank" rel="noopener">project example</a>
                <a href="https://github.com/arealcoolco/CerebreX" target="_blank" rel="noopener">github</a>
                <a href="https://www.npmjs.com/package/cerebrex" target="_blank" rel="noopener">npm</a>
                <a href="https://pypi.org/project/cerebrex/" target="_blank" rel="noopener">pypi</a>
            </div>
            <div class="footer-copy">
                cerebrex v0.9.4 &mdash; apache 2.0 &mdash; a real cool co. &mdash; therealcool.site
            </div>
        </div>
    </footer>

    <script>
        // ── Progress bar
        const prog = document.getElementById('progress');
        window.addEventListener('scroll', () => {
            const total = document.documentElement.scrollHeight - window.innerHeight;
            prog.style.width = (window.scrollY / total * 100) + '%';
        });

        // ── Intersection observer for reveal animations
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('visible');
                    }, i * 60);
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.reveal, .manifesto-line, .feature-list li, .step, .timeline-item').forEach(el => {
            io.observe(el);
        });

        // ── Nav active state on scroll
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    navLinks.forEach(a => a.classList.remove('active'));
                    const active = document.querySelector('.nav-links a[href="#' + entry.target.id + '"]');
                    if (active) active.classList.add('active');
                }
            });
        }, { threshold: 0.4 });
        sections.forEach(s => observer.observe(s));

        // ── Copy code blocks
        function copyCode(btn) {
            const block = btn.closest('.code-block').querySelector('code');
            navigator.clipboard.writeText(block.textContent).then(() => {
                btn.textContent = 'copied!';
                setTimeout(() => btn.textContent = 'copy', 2000);
            });
        }

        // ── Email submit
        function submitEmail() {
            const email = document.getElementById('emailInput').value;
            const btn = document.getElementById('submitBtn');
            if (!email || !email.includes('@')) return;
            btn.disabled = true;
            btn.textContent = 'noted ✓';
        }

        // ── Smooth scroll
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                const target = document.querySelector(a.getAttribute('href'));
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        // ── Cursor trail
        let lastTrail = 0;
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastTrail < 80) return;
            lastTrail = now;
            const c = document.createElement('div');
            c.style.cssText = 'position:fixed;width:3px;height:3px;background:rgba(255,255,255,0.35);pointer-events:none;z-index:950;border-radius:50%;left:' + e.clientX + 'px;top:' + e.clientY + 'px;transition:opacity 0.6s ease,transform 0.6s ease;';
            document.body.appendChild(c);
            requestAnimationFrame(() => { c.style.opacity = '0'; c.style.transform = 'scale(0.3)'; });
            setTimeout(() => c.remove(), 600);
        });
    </script>
</body>
</html>`;
