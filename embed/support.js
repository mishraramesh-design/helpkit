/**
 * HelpKit L1/L2/L3 Support Widget  v1.0
 * Drop-in: <script src="https://your-helpkit/embed/support.js"
 *            data-key="hk-xxx" data-role="L1"></script>
 */
(function () {
  'use strict';
  const script   = document.currentScript;
  const API_KEY  = script?.getAttribute('data-key') || window.HelpKitSupportKey || '';
  const API_BASE = script?.getAttribute('data-api') || 'http://localhost:8092';
  const DEF_ROLE = script?.getAttribute('data-role') || 'L1';

  const C = { yellow:'#FFE600', dark:'#2E2E38', white:'#fff', muted:'#747480', border:'#E1E1E6' };
  const ROLE_COLOR = { L1:'#16a34a', L2:'#0284c7', L3:'#7c3aed' };
  const ROLE_LABEL = { L1:'L1 — End User', L2:'L2 — Analyst', L3:'L3 — Developer' };

  const style = document.createElement('style');
  style.textContent = `
    #hks-btn { position:fixed; right:74px; bottom:24px; z-index:99999;
      width:48px; height:48px; border-radius:50%; background:${C.dark};
      border:2px solid ${C.yellow}; cursor:pointer;
      box-shadow:0 2px 14px rgba(0,0,0,0.22); font-size:18px;
      display:flex; align-items:center; justify-content:center; transition:right 0.25s; }
    #hks-panel { position:fixed; right:0; top:0; bottom:0; width:360px;
      background:#fff; border-left:2px solid ${C.dark};
      box-shadow:-4px 0 28px rgba(0,0,0,0.14); z-index:99997;
      display:flex; flex-direction:column; font-family:system-ui,-apple-system,sans-serif;
      transition:transform 0.25s; transform:translateX(100%); }
    #hks-panel.open { transform:translateX(0); }
    #hks-header { background:${C.dark}; color:${C.yellow}; padding:14px 16px;
      font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; flex-shrink:0; }
    #hks-role-tabs { display:flex; gap:4px; padding:10px 12px 0; flex-shrink:0; }
    .hks-tab { padding:5px 12px; border-radius:6px; border:1.5px solid ${C.border};
      background:#F6F6FA; cursor:pointer; font-size:11px; font-weight:700;
      color:#747480; transition:all 0.15s; }
    .hks-tab.active { color:#fff; border-color:transparent; }
    #hks-body { flex:1; overflow-y:auto; padding:12px; }
    #hks-input-area { padding:10px 12px; border-top:1px solid ${C.border};
      background:#FAFAFA; flex-shrink:0; }
    #hks-input-row { display:flex; gap:6px; align-items:flex-end; }
    #hks-input { flex:1; resize:none; border:1.5px solid ${C.border}; border-radius:8px;
      padding:7px 10px; font-size:12.5px; font-family:inherit; outline:none; line-height:1.5; }
    #hks-input:focus { border-color:${C.dark}; }
    #hks-send { width:36px; height:36px; border-radius:8px; border:none; flex-shrink:0;
      background:${C.dark}; color:${C.yellow}; cursor:pointer;
      font-size:18px; display:flex; align-items:center; justify-content:center; }
    #hks-send:disabled { background:${C.border}; color:#fff; cursor:default; }
    #hks-footer { font-size:10px; color:${C.muted}; margin-top:5px; }
    .hks-bubble-row { display:flex; margin-bottom:8px; }
    .hks-bubble-row.user { flex-direction:row-reverse; }
    .hks-bubble { max-width:88%; padding:9px 12px; border-radius:10px;
      font-size:12.5px; line-height:1.6; white-space:pre-wrap; }
    .hks-bubble.user { background:${C.dark}; color:${C.yellow}; border-bottom-right-radius:2px; }
    .hks-bubble.ai { background:#F6F6FA; color:#3C3C48; border-bottom-left-radius:2px; }
    .hks-mid-tag { display:inline-block; background:#FFF8DC; border:1px solid ${C.yellow};
      color:${C.dark}; font-size:10px; font-weight:700; border-radius:4px;
      padding:1px 5px; margin-bottom:4px; }
    .hks-welcome { background:#F6F6FA; border-radius:8px; padding:12px;
      font-size:12.5px; line-height:1.6; color:#3C3C48; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'hks-btn'; btn.title = 'Support Chat'; btn.innerHTML = '🎧';

  const panel = document.createElement('div');
  panel.id = 'hks-panel';
  panel.innerHTML = `
    <div id="hks-header">🎧 Support Chat
      <span id="hks-badge" style="margin-left:auto;font-size:10px;font-weight:800;border-radius:4px;padding:2px 7px;background:${C.yellow};color:${C.dark}">DEMO</span>
    </div>
    <div id="hks-role-tabs">
      <div class="hks-tab active" data-role="L1" style="background:${ROLE_COLOR.L1}">L1</div>
      <div class="hks-tab" data-role="L2">L2</div>
      <div class="hks-tab" data-role="L3">L3</div>
    </div>
    <div id="hks-body">
      <div class="hks-welcome">Hi! I'm your support assistant.<br><br>
        Share an error message or code (e.g. <b>APP-001</b>) and I'll help you diagnose it.<br><br>
        <b>L1</b> — plain language · <b>L2</b> — business analysis · <b>L3</b> — technical deep-dive
      </div>
    </div>
    <div id="hks-input-area">
      <div id="hks-input-row">
        <textarea id="hks-input" rows="2" placeholder="Describe your issue or paste an error code…"></textarea>
        <button id="hks-send">↑</button>
      </div>
      <div id="hks-footer">Select L1/L2/L3 above to match your technical level.</div>
    </div>`;
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const body   = panel.querySelector('#hks-body');
  const input  = panel.querySelector('#hks-input');
  const send   = panel.querySelector('#hks-send');
  const badge  = panel.querySelector('#hks-badge');
  const footer = panel.querySelector('#hks-footer');
  const tabs   = panel.querySelectorAll('.hks-tab');

  let open = false, role = DEF_ROLE, loading = false;
  const messages = [];

  function escHtml(t) {
    return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  }

  function renderMessages() {
    const welcome = body.querySelector('.hks-welcome');
    if (welcome && messages.length) welcome.remove();
    let html = '';
    messages.forEach(m => {
      const tag = m.matched_id ? `<div class="hks-mid-tag">${m.matched_id}</div><br>` : '';
      html += `<div class="hks-bubble-row ${m.role}"><div class="hks-bubble ${m.role==='user'?'user':'ai'}">${m.role==='ai'?tag:''}${escHtml(m.text)}</div></div>`;
    });
    if (loading) html += '<div class="hks-bubble-row"><div class="hks-bubble ai" style="color:#747480">…</div></div>';
    const existing = body.querySelectorAll('.hks-bubble-row');
    existing.forEach(e => e.remove());
    body.insertAdjacentHTML('beforeend', html);
    body.scrollTop = body.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || loading) return;
    input.value = ''; loading = true;
    messages.push({ role: 'user', text });
    renderMessages();
    try {
      const r = await fetch(`${API_BASE}/api/widget/support/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
        body: JSON.stringify({ message: text, role, history: messages.slice(-4) }),
      });
      const d = await r.json();
      if (d.llm_active !== undefined) {
        badge.textContent = d.llm_active ? '✦ AI LIVE' : 'DEMO';
        badge.style.background = d.llm_active ? '#16a34a' : C.yellow;
        badge.style.color = d.llm_active ? '#fff' : C.dark;
      }
      messages.push({ role: 'ai', text: d.answer || '…', matched_id: d.matched_id });
    } catch {
      messages.push({ role: 'ai', text: '⚠ Request failed. Please try again.' });
    } finally {
      loading = false;
      renderMessages();
    }
  }

  // Role tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      role = tab.dataset.role;
      tabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = '#F6F6FA';
        t.style.color = '#747480';
      });
      tab.classList.add('active');
      tab.style.background = ROLE_COLOR[role];
      tab.style.color = '#fff';
      footer.textContent = `${ROLE_LABEL[role]} mode active. Enter to send.`;
    });
  });

  btn.addEventListener('click', () => {
    open = !open;
    panel.classList.toggle('open', open);
    btn.style.right = open ? '376px' : '74px';
    btn.innerHTML = open ? '✕' : '🎧';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  send.addEventListener('click', sendMessage);
})();
