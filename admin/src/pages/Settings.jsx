import React, { useState, useEffect } from 'react'
import API from '../api'

const PROVIDERS = [
  { value:'groq',    label:'Groq (free — Llama 3)', placeholder:'gsk_...', url:'https://api.groq.com/openai/v1', models:['llama-3.3-70b-versatile','llama-3.1-8b-instant'] },
  { value:'openai',  label:'OpenAI', placeholder:'sk-...', url:'', models:['gpt-4o-mini','gpt-4o'] },
  { value:'gemini',  label:'Google Gemini', placeholder:'AIza...', url:'', models:['gemini-2.0-flash','gemini-1.5-pro'] },
  { value:'custom',  label:'Custom (OpenAI-compatible)', placeholder:'', url:'', models:[] },
]

export default function Settings() {
  const [cfg, setCfg]         = useState({ provider:'groq', api_key:'', model:'', base_url:'' })
  const [saved, setSaved]     = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTest] = useState(null)  // {ok, reply?, error?}

  useEffect(() => { API.get('/config').then(c => setCfg(c || {})) }, [])

  const prov = PROVIDERS.find(p => p.value === cfg.provider) || PROVIDERS[0]

  const save = async () => {
    const body = { ...cfg }
    if (!body.base_url && prov.url) body.base_url = prov.url
    if (!body.model && prov.models[0]) body.model = prov.models[0]
    await API.put('/config', body)
    setSaved(true); setTest(null)
    setTimeout(() => setSaved(false), 2000)
  }

  const testConnection = async () => {
    setTesting(true); setTest(null)
    try {
      const res = await API.post('/config/test', {})
      setTest(res)
    } catch(e) {
      setTest({ ok: false, error: String(e) })
    } finally {
      setTesting(false)
    }
  }

  const S = {
    card:   { background:'#fff', borderRadius:10, padding:28, boxShadow:'0 1px 8px rgba(0,0,0,0.07)', marginBottom:20 },
    label:  { fontSize:12, fontWeight:700, color:'#747480', marginBottom:5, display:'block' },
    input:  { width:'100%', padding:'9px 12px', border:'1.5px solid #E1E1E6', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none' },
    select: { width:'100%', padding:'9px 12px', border:'1.5px solid #E1E1E6', borderRadius:8, fontSize:13, boxSizing:'border-box', background:'#fff' },
    btnPrimary: { padding:'10px 28px', background:'#FFE600', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' },
    btnTest: { padding:'10px 22px', background:'#F6F6FA', border:'1.5px solid #E1E1E6', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' },
  }

  return <>
    <div style={{ fontWeight:800, fontSize:22, marginBottom:20 }}>Settings</div>
    <div style={S.card}>
      <div style={{ fontWeight:700, fontSize:16, marginBottom:18 }}>🤖 LLM Configuration</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div>
          <label style={S.label}>Provider</label>
          <select style={S.select} value={cfg.provider||'groq'}
            onChange={e => setCfg({...cfg, provider:e.target.value, model:'', base_url:''})}>
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Model</label>
          {prov.models.length
            ? <select style={S.select} value={cfg.model||prov.models[0]} onChange={e => setCfg({...cfg, model:e.target.value})}>
                {prov.models.map(m => <option key={m}>{m}</option>)}
              </select>
            : <input style={S.input} value={cfg.model||''} placeholder="model name"
                onChange={e => setCfg({...cfg, model:e.target.value})} />
          }
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={S.label}>API Key</label>
          <input style={S.input} type="password" value={cfg.api_key||''} placeholder={prov.placeholder}
            onChange={e => setCfg({...cfg, api_key:e.target.value})} />
          {cfg.provider === 'groq' && <div style={{ fontSize:11, color:'#747480', marginTop:4 }}>
            Free key at <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a> — no credit card needed
          </div>}
        </div>
        {cfg.provider === 'custom' && <div style={{ gridColumn:'1/-1' }}>
          <label style={S.label}>Base URL</label>
          <input style={S.input} value={cfg.base_url||''} placeholder="https://your-endpoint/v1"
            onChange={e => setCfg({...cfg, base_url:e.target.value})} />
        </div>}
      </div>

      {/* Actions row */}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:20, flexWrap:'wrap' }}>
        <button onClick={save} style={S.btnPrimary}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
        <button onClick={testConnection} disabled={testing} style={{ ...S.btnTest, opacity: testing ? 0.6 : 1 }}>
          {testing ? '⏳ Testing…' : '⚡ Test connection'}
        </button>
        {testResult && (
          <div style={{
            padding:'9px 14px', borderRadius:8, fontSize:13, fontWeight:600,
            background: testResult.ok ? '#F0FDF4' : '#FFF0F0',
            color:      testResult.ok ? '#16a34a' : '#dc2626',
            border:     testResult.ok ? '1.5px solid #86EFAC' : '1.5px solid #FECACA',
            flex:1, minWidth:200
          }}>
            {testResult.ok
              ? `✓ ${testResult.reply}`
              : `✗ ${testResult.error}`}
          </div>
        )}
      </div>
    </div>

    <div style={{ ...S.card, background:'#FFF8DC', border:'1.5px solid #FFE600' }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>💡 Recommended: Groq</div>
      <div style={{ fontSize:13, lineHeight:1.6, color:'#3C3C48' }}>
        Groq is free, fast, and requires no credit card. It powers both the AI assistant and L1/L2/L3 support
        chat. Get your key at <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a>.
      </div>
    </div>
  </>
}
