/**
 * HelpKit AI Assistant Widget  v1.0
 * Drop-in: <script src="https://your-helpkit/embed/assistant.js"
 *            data-key="hk-xxx" data-page="dashboard" data-theme="dark"></script>
 */
(function () {
  'use strict';
  const script   = document.currentScript;
  const API_KEY  = script?.getAttribute('data-key') || window.HelpKitKey || '';
  const API_BASE = script?.getAttribute('data-api') || 'http://localhost:8092';
  const THEME    = script?.getAttribute('data-theme') || 'light';
  const PAGE_FN  = window.HelpKitPageFn || (() => script?.getAttribute('data-page') || document.title || 'home');

  const C = {
    yellow: '#FFE600', dark: '#2E2E38', white: '#fff',
    bg: THEME === 'dark' ? '#1E1E28' : '#fff',
    text: THEME === 'dark' ? '#E1E1E6' : '#2E2E38',
    muted: '#747480', border: '#E1E1E6',
    userBubble: '#2E2E38', userText: '#FFE600',
    aiBubble: THEME === 'dark' ? '#2E2E38' : '#F6F6FA', aiText: THEME === 'dark' ? '#E1E1E6' : '#3C3C48',
  };

  // ── Inject styles ──────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #hk-btn { position:fixed; right:16px; bottom:24px; z-index:99999;
      width:48px; height:48px; border-radius:50%; background:${C.yellow};
      border:none; cursor:pointer; box-shadow:0 2px 14px rgba(0,0,0,0.22);
      font-size:22px; display:flex; align-items:center; justify-content:center;
      transition:right 0.25s, transform 0.15s; }
    #hk-btn:hover { transform:scale(1.08); }
    #hk-panel { position:fixed; right:0; top:0; bottom:0; width:340px;
      background:${C.bg}; border-left:2px solid ${C.yellow};
      box-shadow:-4px 0 28px rgba(0,0,0,0.14); z-index:99998;
      display:flex; flex-direction:column; font-family:system-ui,-apple-system,sans-serif;
      transition:transform 0.25s; transform:translateX(100%); }
    #hk-panel.open { transform:translateX(0); }
    #hk-header { background:${C.dark}; color:${C.yellow}; padding:14px 16px;
      font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; flex-shrink:0; }
    #hk-badge { margin-left:auto; font-size:10px; font-weight:800; border-radius:4px; padding:2px 7px; }
    #hk-body { flex:1; overflow-y:auto; padding:14px; }
    #hk-input-area { padding:10px 12px; border-top:1px solid ${C.border};
      background:${THEME==='dark'?'#161620':C.white}; flex-shrink:0; }
    #hk-input-row { display:flex; gap:6px; align-items:flex-end; }
    #hk-input { flex:1; resize:none; border:1.5px solid ${C.border}; border-radius:8px;
      padding:7px 10px; font-size:12.5px; font-family:inherit; outline:none;
      background:${C.bg}; color:${C.text}; line-height:1.5; }
    #hk-input:focus { border-color:${C.yellow}; }
    #hk-send { width:36px; height:36px; border-radius:8px; border:none; flex-shrink:0;
      background:${C.yellow}; cursor:pointer; font-size:18px; font-weight:bold;
      display:flex; align-items:center; justify-content:center; }
    #hk-send:disabled { background:${C.border}; cursor:default; }
    #hk-footer { font-size:10px; color:${C.muted}; margin-top:5px; }
    .hk-bubble-row { display:flex; margin-bottom:8px; }
    .hk-bubble-row.user { flex-direction:row-reverse; }
    .hk-bubble { max-width:85%; padding:8px 11px; border-radius:10px;
      font-size:12.5px; line-height:1.55; white-space:pre-wrap; }
    .hk-bubble.user { background:${C.userBubble}; color:${C.userText};
      border-bottom-right-radius:2px; }
    .hk-bubble.ai { background:${C.aiBubble}; color:${C.aiText};
      border-bottom-left-radius:2px; }
    .hk-typing { color:${C.muted}; font-size:12px; padding:8px 11px; }
    .hk-chat-label { font-size:10px; font-weight:700; color:${C.muted};
      text-transform:uppercase; letter-spacing:0.5px; margin:12px 0 6px; }
  `;
  document.head.appendChild(style);

  // ── DOM ────────────────────────────────────────────────────────────────────
  const btn   = document.createElement('button');
  btn.id = 'hk-btn'; btn.title = 'AI Assistant'; btn.textContent = '🤖';

  const panel = document.createElement('div');
  panel.id = 'hk-panel';
  panel.innerHTML = `
    <div id="hk-header">🤖 AI Assistant
      <span id="hk-badge"></span>
    </div>
    <div id="hk-body"><div class="hk-typing">Loading…</div></div>
    <div id="hk-input-area">
      <div id="hk-input-row">
        <textarea id="hk-input" rows="2" placeholder="Ask anything…"></textarea>
        <button id="hk-send" disabled>↑</button>
      </div>
      <div id="hk-footer">Loading…</div>
    </div>`;
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const body   = panel.querySelector('#hk-body');
  const input  = panel.querySelector('#hk-input');
  const send   = panel.querySelector('#hk-send');
  const badge  = panel.querySelector('#hk-badge');
  const footer = panel.querySelector('#hk-footer');

  let open = false, llmActive = false, loading = false;
  const messages = [];

  // ── State helpers ──────────────────────────────────────────────────────────
  function setBadge(live) {
    llmActive = live;
    badge.style.background = live ? '#16a34a' : C.yellow;
    badge.style.color = live ? C.white : C.dark;
    badge.textContent = live ? '✦ AI LIVE' : 'DEMO MODE';
    footer.textContent = live
      ? '✦ Live AI · Enter to send · Shift+Enter for newline'
      : '⊙ Demo mode — configure LLM key in HelpKit admin';
  }

  function renderMessages() {
    let html = '';
    if (messages.length > 0) {
      html += '<div class="hk-chat-label">Chat</div>';
      messages.forEach(m => {
        html += `<div class="hk-bubble-row ${m.role}"><div class="hk-bubble ${m.role==='user'?'user':'ai'}">${escHtml(m.text)}</div></div>`;
      });
    }
    if (loading) html += '<div class="hk-bubble-row"><div class="hk-bubble ai hk-typing">…</div></div>';
    if (messages.length > 0 || loading) body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  function escHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  async function loadGuidance() {
    body.innerHTML = '<div class="hk-typing">Thinking…</div>';
    try {
      const r = await fetch(`${API_BASE}/api/widget/assistant/guidance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
        body: JSON.stringify({ page: PAGE_FN(), question: '' }),
      });
      const d = await r.json();
      setBadge(d.llm_active);
      body.innerHTML = `<div style="background:${C.aiBubble};border-radius:8px;padding:12px;font-size:12.5px;line-height:1.6;color:${C.aiText};margin-bottom:10px;">${escHtml(d.reply || 'Ask me anything!')}</div>`;
      send.disabled = false;
    } catch {
      body.innerHTML = '<div class="hk-typing">⚠ Could not connect to HelpKit. Check API key and server.</div>';
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || loading) return;
    input.value = '';
    send.disabled = true;
    messages.push({ role: 'user', text });
    loading = true;
    renderMessages();
    try {
      const r = await fetch(`${API_BASE}/api/widget/assistant/guidance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
        body: JSON.stringify({ page: PAGE_FN(), question: text, history: messages.slice(-6) }),
      });
      const d = await r.json();
      setBadge(d.llm_active);
      messages.push({ role: 'ai', text: d.reply || '…' });
    } catch {
      messages.push({ role: 'ai', text: '⚠ Request failed. Please try again.' });
    } finally {
      loading = false;
      send.disabled = false;
      renderMessages();
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    open = !open;
    panel.classList.toggle('open', open);
    btn.style.right = open ? '356px' : '16px';
    btn.textContent = open ? '✕' : '🤖';
    if (open && messages.length === 0) loadGuidance();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
  send.addEventListener('click', sendMessage);

  // Expose global API for host app to set page dynamically
  window.HelpKit = { setPage: (p) => { PAGE_FN = () => p; } };
})();
