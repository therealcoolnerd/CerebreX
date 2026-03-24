export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const whitepaperUrl = `${url.protocol}//${url.host}/whitepaper`;

    if (url.pathname === '/whitepaper') {
      return new Response(WHITEPAPER_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }
    return new Response(HTML.replaceAll('__WHITEPAPER_URL__', whitepaperUrl), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
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
                    the open-source MCP registry and agent infrastructure OS for Claude and other AI agents.
                    browse, install, and publish MCP servers in one command — with a hosted registry, CLI tooling,
                    and a growing library of official packages for GitHub, NASA, weather, and more.
                    built for developers who want to extend their AI agents without the overhead.
                </div>
                <div class="test-block">
                    <div class="test-block-label">try it now</div>
                    <code>npm install -g cerebrex</code>
                    <code>cerebrex install @arealcoolco/github-mcp</code>
                    <code>cerebrex configure @arealcoolco/github-mcp --env GITHUB_TOKEN=your_token</code>
                </div>
                <div class="cta-row">
                    <a href="__WHITEPAPER_URL__" class="btn-primary">get early access →</a>
                    <a href="https://github.com/arealcoolco/CerebreX" class="btn-ghost" target="_blank" rel="noopener">view on github</a>
                </div>
                <div style="margin-top:0.5rem;font-family:'JetBrains Mono',monospace;font-size:0.62rem;letter-spacing:0.15em;color:rgba(255,255,255,0.35);text-transform:uppercase;">click tile to explore the full vision →</div>
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
// WHITEPAPER PAGE — IMMERSIVE SCROLL EXPERIENCE
// ─────────────────────────────────────────────
const WHITEPAPER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CerebreX — The Agent Infrastructure OS</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23000'/%3E%3Ctext x='50' y='65' font-family='monospace' font-size='60' fill='%23fff' text-anchor='middle'%3E✦%3C/text%3E%3C/svg%3E">
    <meta name="description" content="A Real Cool Co. — a stealth studio building cutting-edge AI infrastructure through an Afro Futurist lens. CerebreX: the open-source Agent Infrastructure OS.">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="CerebreX — Agent Infrastructure OS">
    <meta property="og:description" content="The registry, CLI, and platform layer for AI agents. Built by A Real Cool Co.">
    <meta property="og:type" content="website">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap" rel="stylesheet">
    <style>
        :root {
            --black: #000;
            --white: #fff;
            --off-white: #f0ede6;
            --dim: rgba(255,255,255,0.5);
            --dimmer: rgba(255,255,255,0.25);
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

        /* ── PROGRESS BAR ── */
        #progress {
            position: fixed; top: 0; left: 0; height: 2px;
            background: var(--white); width: 0%; z-index: 1000;
            transition: width 0.1s linear;
            box-shadow: 0 0 8px rgba(255,255,255,0.6);
        }

        /* ── SCANLINES ── */
        body::before {
            content:'';
            position:fixed; top:0; left:0; width:100%; height:100%;
            background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px);
            pointer-events:none; z-index:900;
        }

        /* ── NAV ── */
        nav {
            position: fixed; top: 0; left: 0; right: 0;
            display: flex; align-items: center; justify-content: space-between;
            padding: 1.5rem 3rem;
            border-bottom: 1px solid var(--rule);
            background: rgba(0,0,0,0.9);
            backdrop-filter: blur(20px);
            z-index: 50;
        }
        .nav-logo {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.1em;
            text-decoration: none; color: var(--white);
            opacity: 0.8; transition: opacity 0.2s;
        }
        .nav-logo:hover { opacity: 1; }
        .nav-right {
            display: flex; gap: 2rem; align-items: center;
        }
        .nav-link {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem; text-transform: lowercase;
            letter-spacing: 0.08em; color: var(--dim);
            text-decoration: none; transition: color 0.2s;
        }
        .nav-link:hover { color: var(--white); }

        /* ── HERO ── */
        .hero {
            min-height: 100vh;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 8rem 3rem 6rem;
            text-align: center;
            position: relative;
            border-bottom: 1px solid var(--rule);
        }
        .hero-eyebrow {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem; text-transform: uppercase;
            letter-spacing: 0.25em; color: var(--dim);
            margin-bottom: 2.5rem;
        }
        .hero-mark {
            font-size: 5rem; line-height: 1; margin-bottom: 3rem;
            animation: markPulse 6s ease-in-out infinite;
            display: block;
        }
        @keyframes markPulse {
            0%,100% { text-shadow: 0 0 40px rgba(255,255,255,0.15); }
            50% { text-shadow: 0 0 80px rgba(255,255,255,0.4), 0 0 120px rgba(255,255,255,0.1); }
        }
        .hero-title {
            font-family: 'Playfair Display', serif;
            font-size: clamp(2.8rem, 7vw, 6rem);
            font-weight: 900; line-height: 1.05;
            letter-spacing: -0.02em;
            max-width: 900px;
            margin-bottom: 2rem;
        }
        .hero-title em {
            font-style: italic; color: var(--dim);
        }
        .hero-subtitle {
            font-family: 'Inter', sans-serif;
            font-size: clamp(1rem, 2vw, 1.25rem);
            font-weight: 300; line-height: 1.7;
            color: var(--dim); max-width: 600px;
            margin-bottom: 3.5rem;
        }
        .hero-cta {
            display: flex; gap: 1.2rem; align-items: center; justify-content: center; flex-wrap: wrap;
        }
        .btn-solid {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.08em;
            padding: 0.9rem 2.2rem;
            background: var(--white); color: var(--black);
            border: 2px solid var(--white);
            text-decoration: none; transition: all 0.25s ease;
            display: inline-block;
        }
        .btn-solid:hover {
            background: transparent; color: var(--white);
            box-shadow: 0 0 30px rgba(255,255,255,0.3);
        }
        .btn-outline {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; font-weight: 400;
            text-transform: lowercase; letter-spacing: 0.08em;
            padding: 0.9rem 2.2rem;
            background: transparent; color: var(--dim);
            border: 1px solid rgba(255,255,255,0.3);
            text-decoration: none; transition: all 0.25s ease;
            display: inline-block;
        }
        .btn-outline:hover {
            border-color: var(--white); color: var(--white);
            box-shadow: 0 0 20px rgba(255,255,255,0.15);
        }
        .scroll-hint {
            position: absolute; bottom: 2.5rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
            animation: bounceDown 2s ease-in-out infinite;
        }
        @keyframes bounceDown {
            0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)}
        }

        /* ── CONTENT WRAPPER ── */
        .content {
            max-width: 760px;
            margin: 0 auto;
            padding: 0 2rem;
        }

        /* ── SECTIONS ── */
        section {
            padding: 7rem 0;
            border-bottom: 1px solid var(--rule);
        }
        section:last-of-type { border-bottom: none; }

        .section-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.68rem; text-transform: uppercase;
            letter-spacing: 0.25em; color: var(--dimmer);
            margin-bottom: 3rem;
            display: flex; align-items: center; gap: 1rem;
        }
        .section-label::after {
            content: ''; flex: 1; height: 1px;
            background: var(--rule);
        }

        /* ── PULL QUOTE ── */
        .pull-quote {
            font-family: 'Playfair Display', serif;
            font-size: clamp(1.6rem, 4vw, 2.6rem);
            font-weight: 400; line-height: 1.3;
            letter-spacing: -0.01em;
            margin: 3rem 0;
            padding-left: 2rem;
            border-left: 2px solid rgba(255,255,255,0.4);
            color: var(--off-white);
        }
        .pull-quote em { font-style: italic; color: var(--dim); }

        /* ── BODY TEXT ── */
        .body-text {
            font-size: 1.05rem; font-weight: 300;
            line-height: 1.85; color: rgba(255,255,255,0.78);
            margin-bottom: 1.75rem;
        }
        .body-text strong {
            font-weight: 600; color: var(--white);
        }

        /* ── MANIFESTO LINES ── */
        .manifesto {
            margin: 3.5rem 0;
        }
        .manifesto-line {
            font-family: 'Inter', sans-serif;
            font-size: clamp(1rem, 2.5vw, 1.4rem);
            font-weight: 700; line-height: 1.4;
            padding: 1.2rem 0;
            border-bottom: 1px solid var(--rule);
            display: flex; align-items: flex-start; gap: 1.5rem;
            opacity: 0;
            transform: translateX(-20px);
            transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .manifesto-line.visible {
            opacity: 1; transform: translateX(0);
        }
        .manifesto-line .num {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; font-weight: 400;
            color: var(--dimmer); padding-top: 0.3rem;
            min-width: 1.8rem;
        }

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
            font-size: 3rem; font-weight: 900;
            line-height: 1; margin-bottom: 0.5rem;
        }
        .stat-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; text-transform: uppercase;
            letter-spacing: 0.15em; color: var(--dim);
        }

        /* ── TIMELINE ── */
        .timeline { margin: 3rem 0; }
        .timeline-item {
            display: grid; grid-template-columns: 120px 1fr;
            gap: 2rem; padding: 2rem 0;
            border-bottom: 1px solid var(--rule);
            opacity: 0; transform: translateY(16px);
            transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .timeline-item.visible { opacity: 1; transform: translateY(0); }
        .timeline-phase {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; text-transform: uppercase;
            letter-spacing: 0.15em; color: var(--dimmer);
            padding-top: 0.2rem;
        }
        .timeline-title {
            font-family: 'Inter', sans-serif;
            font-size: 1rem; font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .timeline-desc {
            font-size: 0.9rem; font-weight: 300;
            line-height: 1.65; color: rgba(255,255,255,0.6);
        }
        .timeline-badge {
            display: inline-block;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.12em;
            border: 1px solid rgba(255,255,255,0.35);
            padding: 0.15rem 0.6rem; margin-bottom: 0.5rem;
            color: rgba(255,255,255,0.6);
        }
        .timeline-badge.active {
            border-color: var(--white);
            color: var(--white);
            background: rgba(255,255,255,0.06);
        }

        /* ── CODE BLOCK ── */
        .code-block {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.12);
            padding: 1.5rem 1.75rem;
            margin: 2rem 0;
        }
        .code-block-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.62rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            margin-bottom: 0.75rem;
        }
        .code-block code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.88rem; color: rgba(255,255,255,0.85);
            display: block; line-height: 1.9;
        }

        /* ── ACCESS SECTION ── */
        .access-section {
            text-align: center;
            padding: 7rem 0;
        }
        .access-title {
            font-family: 'Playfair Display', serif;
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 900; line-height: 1.1;
            margin-bottom: 1.5rem;
        }
        .access-sub {
            font-size: 1rem; font-weight: 300;
            line-height: 1.7; color: var(--dim);
            max-width: 480px; margin: 0 auto 3rem;
        }
        .email-form {
            display: flex; gap: 0; max-width: 480px; margin: 0 auto;
            border: 1px solid rgba(255,255,255,0.4);
        }
        .email-form input {
            flex: 1; background: transparent; border: none; outline: none;
            color: var(--white); padding: 1rem 1.25rem;
            font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;
            caret-color: var(--white);
        }
        .email-form input::placeholder { color: var(--dimmer); }
        .email-form button {
            background: var(--white); color: var(--black);
            border: none; padding: 1rem 1.75rem; cursor: pointer;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; font-weight: 700;
            text-transform: lowercase; letter-spacing: 0.08em;
            transition: all 0.25s ease; white-space: nowrap;
        }
        .email-form button:hover { background: var(--off-white); }
        .form-note {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.68rem; color: var(--dimmer);
            margin-top: 1rem; letter-spacing: 0.05em;
        }

        /* ── FOOTER ── */
        footer {
            padding: 3rem;
            border-top: 1px solid var(--rule);
            display: flex; align-items: center; justify-content: space-between;
            flex-wrap: wrap; gap: 1rem;
        }
        .footer-left {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem; color: var(--dimmer);
            letter-spacing: 0.06em;
        }
        .footer-right {
            display: flex; gap: 2rem;
        }
        .footer-link {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem; color: var(--dimmer);
            text-decoration: none; letter-spacing: 0.06em;
            transition: color 0.2s;
        }
        .footer-link:hover { color: var(--white); }

        /* ── DIVIDER ── */
        .divider {
            display: flex; align-items: center; gap: 2rem;
            margin: 4rem 0;
        }
        .divider span {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1rem; color: var(--dimmer);
        }
        .divider::before, .divider::after {
            content: ''; flex: 1; height: 1px;
            background: var(--rule);
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 768px) {
            nav { padding: 1.25rem 1.5rem; }
            .nav-right { gap: 1.2rem; }
            .hero { padding: 7rem 1.5rem 5rem; }
            .hero-mark { font-size: 3.5rem; }
            section { padding: 4.5rem 0; }
            .content { padding: 0 1.5rem; }
            .stat-grid { grid-template-columns: 1fr; }
            .stat-cell { border-right: none; }
            .stat-cell:nth-last-child(-n+2) { border-bottom: 1px solid var(--rule); }
            .stat-cell:last-child { border-bottom: none; }
            .timeline-item { grid-template-columns: 1fr; gap: 0.5rem; }
            .timeline-phase { padding-top: 0; }
            .email-form { flex-direction: column; }
            .email-form input, .email-form button { width: 100%; }
            footer { flex-direction: column; padding: 2rem 1.5rem; }
        }

        /* ── MODULE GRID ── */
        .module-grid {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 0; margin: 3rem 0;
            border: 1px solid var(--rule);
        }
        .module-cell {
            padding: 1.75rem 1.5rem;
            border-right: 1px solid var(--rule);
            border-bottom: 1px solid var(--rule);
            transition: background 0.3s ease;
        }
        .module-cell:nth-child(3n) { border-right: none; }
        .module-cell:nth-last-child(-n+3) { border-bottom: none; }
        .module-cell:hover { background: rgba(255,255,255,0.04); }
        .module-id {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            margin-bottom: 0.6rem;
        }
        .module-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1rem; font-weight: 700;
            margin-bottom: 0.4rem;
        }
        .module-tag {
            display: inline-block;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.55rem; text-transform: uppercase;
            letter-spacing: 0.12em;
            border: 1px solid rgba(255,255,255,0.2);
            padding: 0.1rem 0.5rem; color: var(--dim);
        }
        .module-tag.live { border-color: rgba(255,255,255,0.6); color: var(--white); }
        .module-desc {
            font-size: 0.82rem; font-weight: 300;
            line-height: 1.6; color: var(--dim);
            margin-top: 0.6rem;
        }

        /* ── FEATURE LIST ── */
        .feature-list {
            margin: 2rem 0; list-style: none;
        }
        .feature-list li {
            display: flex; align-items: flex-start; gap: 1rem;
            padding: 0.75rem 0; border-bottom: 1px solid var(--rule);
            font-size: 0.95rem; font-weight: 300;
            line-height: 1.6; color: rgba(255,255,255,0.75);
            opacity: 0; transform: translateX(-12px);
            transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .feature-list li.visible { opacity: 1; transform: translateX(0); }
        .feature-list li::before {
            content: '→';
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem; color: var(--dimmer);
            padding-top: 0.15rem; flex-shrink: 0;
        }
        .feature-list li strong { color: var(--white); font-weight: 600; }

        /* ── MODULE HEADER ── */
        .module-header {
            display: flex; align-items: center; gap: 1.5rem;
            margin-bottom: 3.5rem;
        }
        .module-number {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; text-transform: uppercase;
            letter-spacing: 0.2em; color: var(--dimmer);
            white-space: nowrap;
        }
        .module-title-lg {
            font-family: 'JetBrains Mono', monospace;
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 700; letter-spacing: 0.04em;
        }
        .module-status {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem; text-transform: uppercase;
            letter-spacing: 0.15em;
            border: 1px solid rgba(255,255,255,0.25);
            padding: 0.2rem 0.6rem; color: var(--dim);
            white-space: nowrap; align-self: flex-start; margin-top: 0.5rem;
        }
        .module-status.live { border-color: var(--white); color: var(--white); }

        /* ── SECTION DIVIDER WITH GLYPH ── */
        .glyph-divider {
            text-align: center; padding: 4rem 0;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; letter-spacing: 0.3em;
            text-transform: uppercase; color: var(--dimmer);
        }

        /* ── QUICKSTART STEPS ── */
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
            color: rgba(255,255,255,0.15); line-height: 1;
            padding-top: 0.1rem;
        }
        .step-content {}
        .step-title {
            font-size: 0.95rem; font-weight: 600;
            margin-bottom: 0.4rem;
        }
        .step-code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem; color: rgba(255,255,255,0.7);
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            padding: 0.5rem 0.75rem; margin-top: 0.5rem;
            display: block;
        }

        /* ── REVEAL ANIMATION ── */
        .reveal {
            opacity: 0; transform: translateY(24px);
            transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .reveal.visible { opacity: 1; transform: translateY(0); }

        @keyframes fadeSlideUp {
            from { opacity:0; transform:translateY(30px); }
            to { opacity:1; transform:translateY(0); }
        }
        .fade-in { opacity:0; animation: fadeSlideUp 0.8s ease forwards; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.25s; }
        .delay-3 { animation-delay: 0.4s; }
        .delay-4 { animation-delay: 0.55s; }
        .delay-5 { animation-delay: 0.7s; }

        @media (max-width: 768px) {
            nav { padding: 1.25rem 1.5rem; }
            .nav-right { gap: 1rem; }
            .hero { padding: 7rem 1.5rem 5rem; }
            .hero-mark { font-size: 3.5rem; }
            section { padding: 4.5rem 0; }
            .content { padding: 0 1.5rem; }
            .module-grid { grid-template-columns: 1fr; }
            .module-cell { border-right: none; }
            .module-cell:nth-last-child(-n+3) { border-bottom: 1px solid var(--rule); }
            .module-cell:last-child { border-bottom: none; }
            .stat-grid { grid-template-columns: 1fr; }
            .stat-cell { border-right: none; }
            .stat-cell:nth-last-child(-n+2) { border-bottom: 1px solid var(--rule); }
            .stat-cell:last-child { border-bottom: none; }
            .timeline-item { grid-template-columns: 1fr; gap: 0.5rem; }
            .module-header { flex-direction: column; gap: 0.75rem; }
            .email-form { flex-direction: column; }
            .email-form input, .email-form button { width: 100%; }
            footer { flex-direction: column; padding: 2rem 1.5rem; }
            .step { grid-template-columns: 2rem 1fr; gap: 1rem; }
        }
    </style>
</head>
<body>
    <div id="progress"></div>

    <!-- NAV -->
    <nav>
        <a href="/" class="nav-logo">a real cool co.</a>
        <div class="nav-right">
            <a href="#cerebrex" class="nav-link">modules</a>
            <a href="#proof" class="nav-link">proof</a>
            <a href="#mission" class="nav-link">mission</a>
            <a href="#access" class="nav-link">access</a>
            <a href="https://github.com/arealcoolco/CerebreX" class="nav-link" target="_blank" rel="noopener">github</a>
        </div>
    </nav>

    <!-- HERO -->
    <div class="hero">
        <p class="hero-eyebrow fade-in delay-1">a real cool co. × cerebrex — the agent infrastructure os</p>
        <pre class="fade-in delay-2" style="font-family:'JetBrains Mono',monospace;font-size:clamp(0.4rem,1.1vw,0.75rem);line-height:1.1;white-space:pre;text-align:center;margin:2rem 0;color:rgba(255,255,255,0.9);text-shadow:0 0 20px rgba(255,255,255,0.5),0 0 40px rgba(255,255,255,0.2);">
 ██████╗███████╗██████╗ ███████╗██████╗ ██████╗ ███████╗██╗  ██╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝
██║     █████╗  ██████╔╝█████╗  ██████╔╝██████╔╝█████╗   ╚███╔╝
██║     ██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██╗██╔══╝   ██╔██╗
╚██████╗███████╗██║  ██║███████╗██████╔╝██║  ██║███████╗██╔╝ ██╗
 ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝</pre>
        <h1 class="hero-title fade-in delay-3">
            the <em>operating system</em><br>for AI agents.
        </h1>
        <p class="hero-subtitle fade-in delay-4">
            registry. tooling. memory. auth. orchestration. observability.<br>
            everything your agents need to work in the real world — in one open-source platform.
        </p>
        <div class="hero-cta fade-in delay-5">
            <a href="#access" class="btn-solid">request early access</a>
            <a href="#cerebrex" class="btn-outline">read the docs →</a>
        </div>
        <div class="scroll-hint">
            <span>scroll to explore</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 11L3 5h10L8 11z"/>
            </svg>
        </div>
    </div>

    <!-- STUDIO -->
    <section id="studio">
        <div class="content">
            <div class="section-label reveal">00 — the studio</div>

            <div class="pull-quote reveal">
                we don't do press releases.<br>
                we do <em>proof of work.</em>
            </div>

            <p class="body-text reveal">
                <strong>A Real Cool Co.</strong> is a stealth studio. We don't announce things before they exist.
                We build first. We ship. We let the work carry the weight of the introduction.
                There are no decks. There is no pitch. There is just the thing we made,
                and the question it asks of the world.
            </p>

            <p class="body-text reveal">
                We are building at the intersection of Afro Futurism and artificial intelligence —
                the belief that technology is not neutral, and that the people who build the tools
                determine the shape of the future. We intend to be in that room. Not as observers. As architects.
            </p>

            <div class="manifesto reveal">
                <div class="manifesto-line"><span class="num">01</span><span>Technology is not neutral. It reflects who builds it, and why.</span></div>
                <div class="manifesto-line"><span class="num">02</span><span>The future belongs to those who build it without waiting for permission.</span></div>
                <div class="manifesto-line"><span class="num">03</span><span>Making things that matter is more important than making things that trend.</span></div>
                <div class="manifesto-line"><span class="num">04</span><span>Infrastructure is culture. The tools we give people shape what they imagine is possible.</span></div>
                <div class="manifesto-line"><span class="num">05</span><span>Stealth is not secrecy. It is the discipline of building before broadcasting.</span></div>
                <div class="manifesto-line"><span class="num">06</span><span>AI is the most significant creative and technical medium of our generation.</span></div>
                <div class="manifesto-line"><span class="num">07</span><span>We will not be spectators to the future being built around us. We will be its architects.</span></div>
            </div>
        </div>
    </section>

    <!-- WHAT IS CEREBREX -->
    <section id="cerebrex">
        <div class="content">
            <div class="section-label reveal">01 — what is cerebrex</div>

            <div class="pull-quote reveal">
                the problem with AI tooling is not intelligence.<br>
                <em>it's infrastructure.</em>
            </div>

            <p class="body-text reveal">
                AI agents are capable of extraordinary things. But connecting them to the real world —
                to GitHub, to databases, to your internal APIs — requires custom wiring that developers build
                from scratch, every time. The same integrations get built by a hundred different teams.
                None of them talk to each other. None of them share the work.
            </p>

            <p class="body-text reveal">
                <strong>CerebreX is the open-source Agent Infrastructure OS.</strong> A registry, CLI, and
                platform layer that gives AI agents everything they need to operate in the real world.
                Browse, install, publish, and configure MCP (Model Context Protocol) servers the same way
                you manage any other dependency. One command. One source of truth. One growing ecosystem.
            </p>

            <div class="section-label reveal" style="margin-top:3rem;" id="modules">the six modules</div>

            <div class="module-grid reveal">
                <div class="module-cell">
                    <div class="module-id">01</div>
                    <div class="module-name">FORGE</div>
                    <span class="module-tag live">live</span>
                    <div class="module-desc">scaffold new MCP tools from battle-tested templates in seconds.</div>
                </div>
                <div class="module-cell">
                    <div class="module-id">02</div>
                    <div class="module-name">TRACE</div>
                    <span class="module-tag live">live</span>
                    <div class="module-desc">real-time observability for every MCP call your agent makes.</div>
                </div>
                <div class="module-cell">
                    <div class="module-id">03</div>
                    <div class="module-name">MEMEX</div>
                    <span class="module-tag live">live</span>
                    <div class="module-desc">persistent, structured memory for agents across all sessions.</div>
                </div>
                <div class="module-cell">
                    <div class="module-id">04</div>
                    <div class="module-name">AUTH</div>
                    <span class="module-tag live">live</span>
                    <div class="module-desc">zero-trust token auth with granular permission scopes.</div>
                </div>
                <div class="module-cell">
                    <div class="module-id">05</div>
                    <div class="module-name">REGISTRY</div>
                    <span class="module-tag live">live</span>
                    <div class="module-desc">the npm for agent tools — browse, publish, install, version.</div>
                </div>
                <div class="module-cell">
                    <div class="module-id">06</div>
                    <div class="module-name">HIVE</div>
                    <span class="module-tag live">live</span>
                    <div class="module-desc">multi-agent orchestration with shared memory and roles.</div>
                </div>
            </div>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- MODULE: FORGE -->
    <section id="forge">
        <div class="content">
            <div class="module-header">
                <div>
                    <div class="module-number">module 01</div>
                    <div class="module-title-lg">FORGE</div>
                </div>
                <span class="module-status live">live</span>
            </div>

            <div class="pull-quote reveal">
                stop writing boilerplate.<br>
                <em>start building tools.</em>
            </div>

            <p class="body-text reveal">
                Every MCP server starts the same way — package.json, tsconfig, tool schema definitions,
                test scaffolding, a publish config. Developers repeat this setup across every new project.
                FORGE eliminates that friction entirely.
            </p>

            <p class="body-text reveal">
                One command scaffolds a fully wired MCP server with the correct structure, TypeScript config,
                schema validation, and a test suite ready to run. You start at the point where the actual
                work begins — writing the tool logic — not wrestling with project setup.
            </p>

            <div class="code-block reveal">
                <div class="code-block-label">scaffold a new MCP server</div>
                <code>cerebrex forge my-weather-tool</code>
                <code style="color:rgba(255,255,255,0.4);margin-top:0.5rem;"># creates:</code>
                <code style="color:rgba(255,255,255,0.5);">my-weather-tool/</code>
                <code style="color:rgba(255,255,255,0.5);">  ├── src/index.ts     # tool implementation</code>
                <code style="color:rgba(255,255,255,0.5);">  ├── src/schema.ts    # tool schema + types</code>
                <code style="color:rgba(255,255,255,0.5);">  ├── tests/           # test suite</code>
                <code style="color:rgba(255,255,255,0.5);">  ├── package.json     # pre-configured</code>
                <code style="color:rgba(255,255,255,0.5);">  └── tsconfig.json    # ready to compile</code>
            </div>

            <ul class="feature-list">
                <li><strong>Template library</strong> — starter templates for REST APIs, databases, file systems, and more</li>
                <li><strong>Schema validation</strong> — tool definitions pre-wired with Zod validation and type inference</li>
                <li><strong>Test scaffold</strong> — test suite with mock MCP client included from day one</li>
                <li><strong>Publish-ready</strong> — package.json pre-configured for cerebrex publish</li>
                <li><strong>TypeScript first</strong> — tsconfig, strict types, and build scripts included by default</li>
            </ul>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- MODULE: TRACE -->
    <section id="trace">
        <div class="content">
            <div class="module-header">
                <div>
                    <div class="module-number">module 02</div>
                    <div class="module-title-lg">TRACE</div>
                </div>
                <span class="module-status live">live</span>
            </div>

            <div class="pull-quote reveal">
                every call your agent makes.<br>
                every token it uses.<br>
                <em>every error it throws.</em>
            </div>

            <p class="body-text reveal">
                When an AI agent fails, you need to know why. Which MCP tool was called?
                What parameters did it pass? What did the server return? How long did it take?
                Without visibility into these calls, debugging is guesswork.
            </p>

            <p class="body-text reveal">
                TRACE gives you a real-time execution dashboard for every MCP call your agents make.
                Run it locally during development, or use the hosted Trace Explorer at
                <strong>registry.therealcool.site/trace</strong> to inspect live agent sessions from anywhere.
            </p>

            <div class="code-block reveal">
                <div class="code-block-label">start tracing agent calls</div>
                <code>cerebrex trace --live</code>
                <code style="color:rgba(255,255,255,0.4);margin-top:0.5rem;"># or pipe from your agent output:</code>
                <code>my-agent | cerebrex trace --pipe</code>
                <code style="color:rgba(255,255,255,0.4);margin-top:0.5rem;"># hosted explorer:</code>
                <code>open https://registry.therealcool.site/trace</code>
            </div>

            <ul class="feature-list">
                <li><strong>Real-time dashboard</strong> — watch MCP calls stream in as your agent executes</li>
                <li><strong>Full request/response</strong> — see every parameter sent and every result returned</li>
                <li><strong>Latency tracking</strong> — identify slow tools and bottlenecks in your pipeline</li>
                <li><strong>Error surface</strong> — exceptions, timeouts, and schema violations highlighted immediately</li>
                <li><strong>Hosted Explorer</strong> — shareable trace sessions for async debugging and collaboration</li>
                <li><strong>Session replay</strong> — re-run a captured trace to reproduce issues exactly</li>
            </ul>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- MODULE: MEMEX -->
    <section id="memex">
        <div class="content">
            <div class="module-header">
                <div>
                    <div class="module-number">module 03</div>
                    <div class="module-title-lg">MEMEX</div>
                </div>
                <span class="module-status live">live</span>
            </div>

            <div class="pull-quote reveal">
                agents that can't remember<br>
                can't <em>learn.</em>
            </div>

            <p class="body-text reveal">
                Every conversation with an AI agent starts from zero. It has no memory of what it did
                yesterday, no context about your project, no recollection of decisions already made.
                For simple tasks, this is fine. For anything complex — building software, managing workflows,
                running ongoing processes — it is a fundamental limitation.
            </p>

            <p class="body-text reveal">
                MEMEX is the persistent memory layer for CerebreX agents. Structured, queryable,
                scoped to agents and users — it gives your agents the ability to remember context
                across sessions, accumulate knowledge over time, and make decisions informed by history.
                The missing primitive for AI agents that need to do real work.
            </p>

            <div class="code-block reveal">
                <div class="code-block-label">persistent agent memory — live now</div>
                <code style="color:rgba(255,255,255,0.5);"># store a memory via CLI</code>
                <code>cerebrex memex set "project:stack" "next.js, postgres, redis" --namespace dev</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># recall it across any session</code>
                <code>cerebrex memex get "project:stack" --namespace dev</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># cloud-backed via memex-mcp</code>
                <code>cerebrex install @arealcoolco/memex-mcp</code>
            </div>

            <ul class="feature-list">
                <li><strong>Cross-session persistence</strong> — memories survive restarts, reboots, and re-deployments</li>
                <li><strong>Structured storage</strong> — typed key-value with semantic tagging and namespace isolation</li>
                <li><strong>Agent-scoped</strong> — each agent maintains its own memory, with optional sharing across a HIVE</li>
                <li><strong>TTL support</strong> — memories expire on schedule, keeping the context window relevant</li>
                <li><strong>Semantic search</strong> — recall memories by meaning, not just by key</li>
            </ul>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- MODULE: AUTH -->
    <section id="auth">
        <div class="content">
            <div class="module-header">
                <div>
                    <div class="module-number">module 04</div>
                    <div class="module-title-lg">AUTH</div>
                </div>
                <span class="module-status live">live</span>
            </div>

            <div class="pull-quote reveal">
                not every agent should have<br>
                <em>every key.</em>
            </div>

            <p class="body-text reveal">
                When AI agents have access to APIs, databases, and services — access control is not
                optional. An agent that can read should not automatically be able to write.
                A community package should not inherit the credentials of your admin account.
                Trust must be explicit, scoped, and revocable.
            </p>

            <p class="body-text reveal">
                CerebreX AUTH is a zero-trust token system with granular permission scopes, JWT signing,
                rate limiting, and a three-tier role model. Create tokens with exactly the access they need —
                nothing more. Revoke them instantly. Audit every request.
            </p>

            <div class="code-block reveal">
                <div class="code-block-label">create a scoped access token</div>
                <code>cerebrex auth token create \</code>
                <code>  --name "ci-publish-bot" \</code>
                <code>  --scope publish:packages \</code>
                <code>  --expires 90d</code>
                <code style="color:rgba(255,255,255,0.4);margin-top:0.5rem;"># available scopes:</code>
                <code style="color:rgba(255,255,255,0.5);">read:packages   publish:packages</code>
                <code style="color:rgba(255,255,255,0.5);">admin:packages  admin:users  admin:*</code>
            </div>

            <ul class="feature-list">
                <li><strong>Granular scopes</strong> — read, publish, and admin permissions assigned independently</li>
                <li><strong>Role system</strong> — admin, publisher, and user tiers with cascade permission logic</li>
                <li><strong>JWT signing</strong> — stateless token verification with configurable expiry</li>
                <li><strong>Rate limiting</strong> — per-token and per-IP rate limits enforced at the edge</li>
                <li><strong>Token management</strong> — create, list, rotate, and revoke tokens via CLI or dashboard</li>
                <li><strong>Audit log</strong> — every authenticated request logged with token ID and timestamp</li>
            </ul>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- MODULE: REGISTRY -->
    <section id="registry">
        <div class="content">
            <div class="module-header">
                <div>
                    <div class="module-number">module 05</div>
                    <div class="module-title-lg">REGISTRY</div>
                </div>
                <span class="module-status live">live</span>
            </div>

            <div class="pull-quote reveal">
                npm changed how developers share code.<br>
                <em>cerebrex does the same for agents.</em>
            </div>

            <p class="body-text reveal">
                The CerebreX Registry is the public index of MCP servers — tools that give AI agents
                the ability to browse the web, query databases, read files, call APIs, and interact
                with the world. It is live at <strong>registry.therealcool.site</strong>, open to browse
                without an account, and open to publish with one.
            </p>

            <p class="body-text reveal">
                Official packages from A Real Cool Co. provide battle-tested integrations with GitHub,
                NASA, and OpenWeatherMap. Community packages extend the ecosystem with custom tools
                for any service or workflow. Version pinning, featured packages, download tracking,
                and deprecation management — everything you expect from a modern package registry.
            </p>

            <div class="code-block reveal">
                <div class="code-block-label">install & publish MCP packages</div>
                <code style="color:rgba(255,255,255,0.5);"># install an official package</code>
                <code>cerebrex install @arealcoolco/github-mcp</code>
                <code>cerebrex install @arealcoolco/nasa-mcp</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># publish your own</code>
                <code>cerebrex publish --access public</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># search the registry</code>
                <code>cerebrex search github</code>
            </div>

            <ul class="feature-list">
                <li><strong>Open registry</strong> — browse and install packages without authentication</li>
                <li><strong>Scoped packages</strong> — publish under your own namespace (@yourname/tool-name)</li>
                <li><strong>Official packages</strong> — curated first-party integrations from A Real Cool Co.</li>
                <li><strong>Version management</strong> — semver, pinning, and deprecation support built in</li>
                <li><strong>Featured packages</strong> — highlighted tools curated by the registry maintainers</li>
                <li><strong>Download tracking</strong> — see how many times your package has been installed</li>
                <li><strong>Registry UI</strong> — browser-based dashboard at registry.therealcool.site</li>
            </ul>

            <div style="margin-top:2.5rem;" class="reveal">
                <a href="https://registry.therealcool.site" class="btn-outline" target="_blank" rel="noopener" style="display:inline-block;">browse the registry →</a>
            </div>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- MODULE: HIVE -->
    <section id="hive">
        <div class="content">
            <div class="module-header">
                <div>
                    <div class="module-number">module 06</div>
                    <div class="module-title-lg">HIVE</div>
                </div>
                <span class="module-status live">live</span>
            </div>

            <div class="pull-quote reveal">
                one agent is a tool.<br>
                a network of agents<br>
                <em>is a system.</em>
            </div>

            <p class="body-text reveal">
                The most powerful AI applications are not single-agent systems. They are networks —
                a researcher, a planner, a coder, a reviewer, each with their own role, memory,
                and tool access, coordinated toward a shared goal. Building these networks today
                requires bespoke orchestration code that is brittle, complex, and hard to reason about.
            </p>

            <p class="body-text reveal">
                HIVE is the CerebreX multi-agent orchestration layer — live today. Register agents,
                assign JWT-signed identities, dispatch tasks, and inspect running state from the CLI
                or through the cloud API at <strong>registry.therealcool.site</strong>.
                Deploy locally in seconds. Install <strong>@arealcoolco/hive-mcp</strong> to
                give any AI agent direct access to your HIVE from inside a conversation.
            </p>

            <div class="code-block reveal">
                <div class="code-block-label">multi-agent coordination — live now</div>
                <code style="color:rgba(255,255,255,0.5);"># spin up a local coordinator</code>
                <code>cerebrex hive init --name my-hive && cerebrex hive start</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># register agents with JWT identities</code>
                <code>cerebrex hive register --id researcher --name "Researcher" --capabilities search,summarize</code>
                <code>cerebrex hive register --id writer --name "Writer" --capabilities write,edit</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># dispatch tasks</code>
                <code>cerebrex hive send --agent researcher --type search --payload '{"query":"..."}' --token JWT</code>
                <code style="color:rgba(255,255,255,0.5);margin-top:0.5rem;"># install the hive-mcp to give Claude access</code>
                <code>cerebrex install @arealcoolco/hive-mcp</code>
            </div>

            <ul class="feature-list">
                <li><strong>JWT agent identity</strong> — every agent in the HIVE holds a signed, scoped JWT token</li>
                <li><strong>Role assignment</strong> — define each agent's capability set and access scope at registration</li>
                <li><strong>Task dispatch</strong> — send typed tasks to individual agents; agents report results back</li>
                <li><strong>State persistence</strong> — HIVE state survives restarts; cloud HIVE backed by D1</li>
                <li><strong>hive-mcp tool</strong> — install @arealcoolco/hive-mcp to manage your HIVE from inside Claude</li>
                <li><strong>TRACE integration</strong> — every inter-agent call is observable in the Trace Explorer</li>
            </ul>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- USE CASES -->
    <section id="usecases">
        <div class="content">
            <div class="section-label reveal">02 — what you can build with it</div>

            <div class="pull-quote reveal">
                the infrastructure is boring.<br>
                <em>what you build on it isn't.</em>
            </div>

            <p class="body-text reveal">
                CerebreX is not a product for a single use case. It is an infrastructure layer —
                the primitive that powers the work above it. Here is a sample of what becomes
                possible when your agents have memory, tooling, auth, and coordination built in.
            </p>

            <div class="timeline reveal">
                <div class="timeline-item">
                    <div class="timeline-phase">use case 01</div>
                    <div>
                        <div class="timeline-title">Personal AI that actually knows you</div>
                        <div class="timeline-desc">
                            Use MEMEX to store your preferences, work history, and context across every session.
                            Your AI assistant remembers that you prefer TypeScript, that your team is on a
                            deploy freeze this week, and that you asked it to draft the quarterly report last Tuesday.
                            No more repeating yourself. No more starting from zero.
                        </div>
                    </div>
                </div>
                <div class="timeline-item">
                    <div class="timeline-phase">use case 02</div>
                    <div>
                        <div class="timeline-title">Automated development pipelines</div>
                        <div class="timeline-desc">
                            FORGE generates MCP servers from your internal OpenAPI specs. TRACE records
                            every tool call during development. REGISTRY distributes the tools to your team.
                            AUTH ensures only the right agents can publish to production. The entire dev
                            toolchain for AI agents — in one system.
                        </div>
                    </div>
                </div>
                <div class="timeline-item">
                    <div class="timeline-phase">use case 03</div>
                    <div>
                        <div class="timeline-title">Multi-agent research pipelines</div>
                        <div class="timeline-desc">
                            A HIVE of three agents: a researcher that queries GitHub and NASA APIs,
                            an analyst that processes the data, a writer that composes the report.
                            Each has a defined role, scoped tool access, and shares memory.
                            The coordinator routes tasks. You review the output.
                        </div>
                    </div>
                </div>
                <div class="timeline-item">
                    <div class="timeline-phase">use case 04</div>
                    <div>
                        <div class="timeline-title">Auditable business automation</div>
                        <div class="timeline-desc">
                            TRACE logs every decision your agents make. MEMEX records the context they acted on.
                            AUTH scopes what they were permitted to do. If something goes wrong, you can replay
                            the exact sequence of events. Not guesswork — a complete audit trail.
                        </div>
                    </div>
                </div>
                <div class="timeline-item">
                    <div class="timeline-phase">use case 05</div>
                    <div>
                        <div class="timeline-title">Open ecosystem of shareable tools</div>
                        <div class="timeline-desc">
                            Publish an MCP server for your internal API. Share it with your team.
                            Browse community tools in the registry. Install NASA, GitHub, and weather
                            integrations in one command. The tools exist. The infrastructure to share
                            them now exists too.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- PROOF OF WORK -->
    <section id="proof">
        <div class="content">
            <div class="section-label reveal">03 — proof of work</div>

            <div class="pull-quote reveal">
                we don't do press releases.<br>
                <em>we ship.</em>
            </div>

            <p class="body-text reveal">
                CerebreX is live. Every module described in this document is deployed and running.
                This is not a roadmap. This is a receipt.
            </p>

            <div class="stat-grid reveal">
                <div class="stat-cell">
                    <div class="stat-number">6</div>
                    <div class="stat-label">modules live</div>
                </div>
                <div class="stat-cell">
                    <div class="stat-number">9</div>
                    <div class="stat-label">packages in registry</div>
                </div>
                <div class="stat-cell">
                    <div class="stat-number">8</div>
                    <div class="stat-label">official featured tools</div>
                </div>
                <div class="stat-cell">
                    <div class="stat-number">1</div>
                    <div class="stat-label">command to install</div>
                </div>
            </div>

            <ul class="feature-list">
                <li><strong>Registry is live</strong> — registry.therealcool.site — browse, search, and install without an account</li>
                <li><strong>CLI on npm</strong> — <code style="font-family:'JetBrains Mono',monospace;font-size:0.85em;">npm install -g cerebrex</code> — install in one command, works today</li>
                <li><strong>MEMEX cloud API</strong> — agents can store and retrieve cross-session memories via the registry backend</li>
                <li><strong>HIVE cloud API</strong> — create, manage, and query agent coordination configs from anywhere</li>
                <li><strong>8 official MCP packages</strong> — memex-mcp, hive-mcp, fetch-mcp, datetime-mcp, kvstore-mcp, github-mcp, nasa-mcp, openweathermap-mcp</li>
                <li><strong>Open source</strong> — every line is on GitHub. Fork it. Run it. Own it.</li>
            </ul>

            <div style="margin-top:2.5rem;" class="reveal">
                <a href="https://registry.therealcool.site" class="btn-outline" target="_blank" rel="noopener" style="display:inline-block;margin-right:1rem;">see the live registry →</a>
                <a href="https://github.com/arealcoolco/CerebreX" class="btn-outline" target="_blank" rel="noopener" style="display:inline-block;">read the source →</a>
            </div>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- DATA SOVEREIGNTY / WHY OPEN SOURCE -->
    <section id="mission">
        <div class="content">
            <div class="section-label reveal">04 — why this must be open source</div>

            <div class="pull-quote reveal">
                companies own the AI.<br>
                you should own<br>
                <em>what it knows about you.</em>
            </div>

            <p class="body-text reveal">
                The AI companies are building extraordinary things. Models that write code, reason through
                problems, and plan complex tasks with remarkable capability. But they are also building
                something else — a centralized infrastructure layer where your agent's memory,
                your tool configurations, your workflow data, and your coordination logic all live
                on their servers, under their terms, subject to their pricing and their decisions
                about what your agents are permitted to do.
            </p>

            <p class="body-text reveal">
                <strong>This is the arrangement the industry is defaulting into.</strong> Not because
                anyone chose it, but because no one built the alternative. Until now.
            </p>

            <div class="manifesto reveal">
                <div class="manifesto-line"><span class="num">01</span><span>Your agent's memory is your data. It should live where you control it.</span></div>
                <div class="manifesto-line"><span class="num">02</span><span>If you can't audit what your agent did, you cannot be accountable for it.</span></div>
                <div class="manifesto-line"><span class="num">03</span><span>Agents that act without a human in the loop are liability, not leverage.</span></div>
                <div class="manifesto-line"><span class="num">04</span><span>The infrastructure layer should never be a black box owned by one company.</span></div>
                <div class="manifesto-line"><span class="num">05</span><span>Open source is not idealism. It is the only structural guarantee of long-term trust.</span></div>
                <div class="manifesto-line"><span class="num">06</span><span>AI accountability starts with observability. You cannot hold accountable what you cannot see.</span></div>
                <div class="manifesto-line"><span class="num">07</span><span>The developer who builds the standard wins the ecosystem. Let it be an open one.</span></div>
            </div>

            <p class="body-text reveal">
                CerebreX is the infrastructure layer between the AI companies and you. The registry
                that you can self-host. The memory system where your data stays local unless you choose
                otherwise. The coordination layer you can inspect, fork, and run on your own terms.
                The audit trail that proves what your agents did and why.
            </p>

            <p class="body-text reveal">
                This is not anti-AI. It is pro-human. The most powerful agents in the world are
                the ones humans trust enough to deploy broadly — and trust comes from transparency,
                auditability, and control. CerebreX is how you build agents people can trust.
            </p>

            <p class="body-text reveal">
                <strong>This is what it means to keep humans in the loop.</strong>
                Not a checkbox. Not a disclaimer. Infrastructure that makes it structurally impossible
                for agents to operate without accountability.
            </p>
        </div>
    </section>

    <div class="glyph-divider">— ✦ —</div>

    <!-- QUICKSTART -->
    <section id="quickstart">
        <div class="content">
            <div class="section-label reveal">05 — quickstart</div>

            <div class="pull-quote reveal">
                from zero to deployed<br>
                <em>in five steps.</em>
            </div>

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
                        <div class="step-title">Browse and install packages</div>
                        <code class="step-code">cerebrex search github</code>
                        <code class="step-code">cerebrex install @arealcoolco/github-mcp</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">03</div>
                    <div class="step-content">
                        <div class="step-title">Scaffold a new tool with FORGE</div>
                        <code class="step-code">cerebrex forge my-tool</code>
                        <code class="step-code">cd my-tool && npm run dev</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">04</div>
                    <div class="step-content">
                        <div class="step-title">Trace your agent in real time</div>
                        <code class="step-code">cerebrex trace --live</code>
                    </div>
                </div>
                <div class="step">
                    <div class="step-num">05</div>
                    <div class="step-content">
                        <div class="step-title">Publish to the registry</div>
                        <code class="step-code">cerebrex auth token create --scope publish:packages</code>
                        <code class="step-code">cerebrex publish --access public</code>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ACCESS -->
    <section id="access">
        <div class="content">
            <div class="access-section">
                <div class="section-label" style="justify-content:center;text-align:center;">06 — early access</div>
                <h2 class="access-title reveal">be part of what's<br><em>being built.</em></h2>
                <p class="access-sub reveal">
                    we are in early days. if you want to build with us, use what we make,
                    or watch something real take shape — leave your email.
                    no spam. no noise. just signal.
                </p>
                <form class="email-form reveal" id="accessForm" onsubmit="handleSubmit(event)">
                    <input type="email" placeholder="your@email.com" required id="emailInput" autocomplete="email">
                    <button type="submit" id="submitBtn">join the list →</button>
                </form>
                <p class="form-note" id="formNote">we move quietly. you'll hear from us when it matters.</p>

                <div style="margin-top:3rem; display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;" class="reveal">
                    <a href="https://registry.therealcool.site" class="btn-outline" target="_blank" rel="noopener">browse the registry</a>
                    <a href="https://github.com/arealcoolco/CerebreX" class="btn-outline" target="_blank" rel="noopener">view on github</a>
                </div>
            </div>
        </div>
    </section>

    <!-- FOOTER -->
    <footer>
        <div class="footer-left">
            © 2026 a real cool co. — all rights reserved<br>
            <span style="opacity:0.5;">built quietly. shipped with intention.</span>
        </div>
        <div class="footer-right">
            <a href="/" class="footer-link">home</a>
            <a href="https://registry.therealcool.site" class="footer-link">registry</a>
            <a href="https://github.com/arealcoolco/CerebreX" class="footer-link" target="_blank" rel="noopener">github</a>
            <a href="https://bsky.app/profile/therealcool.site" class="footer-link" target="_blank" rel="noopener">bluesky</a>
        </div>
    </footer>

    <script>
        // ── Scroll progress bar
        const prog = document.getElementById('progress');
        window.addEventListener('scroll', () => {
            const h = document.body.scrollHeight - window.innerHeight;
            prog.style.width = (window.scrollY / h * 100) + '%';
        });

        // ── Intersection observer — reveal + manifesto + steps + feature list items
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    setTimeout(() => entry.target.classList.add('visible'), i * 60);
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.reveal, .manifesto-line, .step, .feature-list li').forEach(el => revealObserver.observe(el));

        // ── Email form
        function handleSubmit(e) {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const note = document.getElementById('formNote');
            btn.textContent = 'noted ✓';
            btn.style.background = 'rgba(255,255,255,0.85)';
            btn.disabled = true;
            note.textContent = 'we got you. watch this space.';
            note.style.color = 'rgba(255,255,255,0.6)';
        }

        // ── Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                const target = document.querySelector(a.getAttribute('href'));
                if (target) target.scrollIntoView({ behavior: 'smooth' });
            });
        });

        // ── Cursor trail
        let lastTrail = 0;
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastTrail < 80) return;
            lastTrail = now;
            const c = document.createElement('div');
            c.style.cssText = 'position:fixed;width:3px;height:3px;background:rgba(255,255,255,0.4);pointer-events:none;z-index:950;border-radius:50%;left:' + e.clientX + 'px;top:' + e.clientY + 'px;transition:opacity 0.6s ease,transform 0.6s ease;';
            document.body.appendChild(c);
            requestAnimationFrame(() => { c.style.opacity = '0'; c.style.transform = 'scale(0.3)'; });
            setTimeout(() => c.remove(), 600);
        });
    </script>
</body>
</html>`;
