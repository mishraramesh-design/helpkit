import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import API from '../api'

const TABS = ['📥 Ingest', '🤖 Assistant KB', '🎧 Support KB', '🔑 Embed Snippets']

export default function Project() {
  const { id }    = useParams()
  const nav       = useNavigate()
  const [tab, setTab]         = useState(0)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const fileRef   = useRef()

  const load = () => {
    setLoading(true)
    API.get(`/projects/${id}`).then(p => { setProject(p); setLoading(false) })
  }
  useEffect(() => { load() }, [id])

  if (loading) return <div style={{ padding:40, color:'#747480' }}>Loading…</div>
  if (!project || project.error) return <div style={{ padding:40, color:'#dc2626' }}>Project not found</div>

  const S = {
    card: { background:'#fff', borderRadius:10, padding:24, boxShadow:'0 1px 8px rgba(0,0,0,0.07)', marginBottom:16 },
    input: { width:'100%', padding:'9px 12px', border:'1.5px solid #E1E1E6', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none' },
    btn: { padding:'8px 18px', background:'#FFE600', border:'none', borderRadius:7, fontWeight:700, fontSize:12, cursor:'pointer' },
    btnGhost: { padding:'8px 18px', background:'#F6F6FA', border:'1.5px solid #E1E1E6', borderRadius:7, fontSize:12, cursor:'pointer' },
    chip: (color) => ({ display:'inline-block', fontSize:11, fontWeight:700, borderRadius:4, padding:'2px 8px',
      background:color==='green'?'#F0FDF4':color==='blue'?'#EFF6FF':'#FFF8DC',
      color:color==='green'?'#16a34a':color==='blue'?'#0284c7':'#92400e' }),
    code: { background:'#F4F4F8', borderRadius:6, padding:'10px 14px', fontFamily:'monospace', fontSize:12,
      color:'#2E2E38', wordBreak:'break-all', lineHeight:1.6 },
    table: { width:'100%', borderCollapse:'collapse', fontSize:12.5 },
    th: { textAlign:'left', padding:'8px 10px', borderBottom:'2px solid #E1E1E6', fontSize:11, fontWeight:700, color:'#747480', textTransform:'uppercase' },
    td: { padding:'9px 10px', borderBottom:'1px solid #F4F4F8', verticalAlign:'top' },
  }

  const embedHost = window.location.origin.replace('8091', '8092')

  return <>
    {/* Breadcrumb */}
    <div style={{ fontSize:12, color:'#747480', marginBottom:16 }}>
      <span style={{ cursor:'pointer', color:'#2E2E38' }} onClick={() => nav('/projects')}>Projects</span>
      {' → '}<b>{project.name}</b>
    </div>

    {/* Header */}
    <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:24 }}>
      <div>
        <div style={{ fontWeight:800, fontSize:22, marginBottom:4 }}>{project.name}</div>
        <div style={{ fontSize:13, color:'#747480' }}>{project.description}</div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <span style={S.chip('green')}>🤖 {project.assistant_kb_entries} assistant KB entries</span>
          <span style={S.chip('blue')}>🎧 {project.support_kb_entries} support KB{project.support_kb_pending > 0 ? ` · ${project.support_kb_pending} pending` : ''}</span>
        </div>
      </div>
    </div>

    {/* Tabs */}
    <div style={{ display:'flex', gap:2, borderBottom:'2px solid #E1E1E6', marginBottom:20 }}>
      {TABS.map((t, i) => (
        <div key={i} onClick={() => setTab(i)} style={{
          padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:600,
          color: tab===i ? '#2E2E38' : '#747480',
          borderBottom: tab===i ? '2px solid #FFE600' : '2px solid transparent',
          marginBottom:-2,
        }}>{t}</div>
      ))}
    </div>

    {/* Tab: Ingest */}
    {tab === 0 && <IngestTab project={project} reload={load} S={S} fileRef={fileRef} />}

    {/* Tab: Assistant KB */}
    {tab === 1 && <KBTab entries={project.assistant_kb_entries} pid={id} type="assistant" S={S} />}

    {/* Tab: Support KB */}
    {tab === 2 && <SupportKBTab pid={id} S={S} reload={load} />}

    {/* Tab: Embed snippets */}
    {tab === 3 && <EmbedTab project={project} S={S} embedHost={embedHost} />}
  </>
}

function IngestTab({ project, reload, S, fileRef }) {
  const [hasLlm, setHasLlm]   = useState(null)
  const [ghUrl, setGhUrl]      = useState('')
  const [ghTok, setGhTok]      = useState('')
  const [docType, setDocType]  = useState('manual')
  const [status, setStatus]    = useState('')
  const [rescanTok, setRTok]   = useState({})   // {doc_id: token} for per-row token override
  const [rescanSt, setRSt]     = useState({})   // {doc_id: 'status string'}
  const [deleting, setDel]     = useState({})   // {doc_id: true}

  useEffect(() => {
    API.get('/config').then(c => setHasLlm(!!c?.api_key))
  }, [])

  const uploadPdf = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setStatus('Uploading…')
    const fd = new FormData(); fd.append('file', file); fd.append('doc_type', docType)
    const r = await API.upload(`/projects/${project.id}/ingest/pdf`, fd)
    setStatus(r.status === 'queued' ? '✓ Queued for ingestion — check back in ~30s' : `Error: ${JSON.stringify(r)}`)
    reload()
  }

  const scanGithub = async () => {
    if (!ghUrl) return
    setStatus('Starting GitHub scan…')
    const r = await API.post(`/projects/${project.id}/ingest/github`, { repo_url: ghUrl, token: ghTok })
    setStatus(r.status === 'queued' ? '✓ Scan started — check back in ~60s' : `Error: ${JSON.stringify(r)}`)
    setGhUrl(''); setGhTok('')
    reload()
  }

  const rescan = async (doc) => {
    const tok = rescanTok[doc.id] ?? ''
    setRSt(s => ({...s, [doc.id]: '⏳ Queued…'}))
    try {
      const body = doc.type === 'github' && tok ? { token: tok } : {}
      const r = await API.post(`/projects/${project.id}/documents/${doc.id}/rescan`, body)
      setRSt(s => ({...s, [doc.id]: r.ok ? '✓ Re-scanning…' : `✗ ${r.detail || r.error}`}))
      setTimeout(() => { setRSt(s => ({...s, [doc.id]: ''})); reload() }, 3000)
    } catch(e) {
      setRSt(s => ({...s, [doc.id]: `✗ ${e}`}))
    }
  }

  const deleteDoc = async (doc) => {
    if (!window.confirm(`Delete "${doc.filename?.split('/').pop()}" and all its KB entries?`)) return
    setDel(s => ({...s, [doc.id]: true}))
    await API.del(`/projects/${project.id}/documents/${doc.id}`)
    reload()
  }

  const statusColor = (st) =>
    st?.startsWith('ingested') || st === 'scanned' ? '#16a34a'
    : st?.startsWith('error') ? '#dc2626'
    : '#d97706'

  return <>
    {hasLlm === false && (
      <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#991B1B' }}>
        ⚠ <b>No LLM key configured.</b> Ingestion will fail.{' '}
        <a href="/settings" style={{ color:'#991B1B', fontWeight:700 }}>Go to Settings and add a Groq key first →</a>
      </div>
    )}

    {/* Upload PDF/DOCX */}
    <div style={S.card}>
      <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>📄 Upload Document</div>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
        <select value={docType} onChange={e => setDocType(e.target.value)}
          style={{ padding:'9px 12px', border:'1.5px solid #E1E1E6', borderRadius:8, fontSize:13, background:'#fff' }}>
          <option value="manual">User Manual</option>
          <option value="srs">SRS / Requirements</option>
          <option value="faq">FAQ</option>
          <option value="other">Other</option>
        </select>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" style={{ display:'none' }} onChange={uploadPdf} />
        <button style={S.btn} onClick={() => fileRef.current.click()}>Choose PDF / DOCX &amp; Upload</button>
      </div>
      <div style={{ fontSize:12, color:'#747480' }}>AI extracts Q&amp;A pairs to build the assistant knowledge base.</div>
    </div>

    {/* GitHub scan */}
    <div style={S.card}>
      <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>🐙 GitHub Repository Scan</div>
      <div style={{ marginBottom:10 }}>
        <input value={ghUrl} onChange={e => setGhUrl(e.target.value)}
          placeholder="https://github.com/org/repo"
          style={{ ...S.input, marginBottom:8 }} />
        <input value={ghTok} onChange={e => setGhTok(e.target.value)} type="password"
          placeholder="GitHub Personal Access Token — required for private repos"
          style={{ ...S.input, marginBottom:4 }} />
        <div style={{ fontSize:11, color:'#747480' }}>
          Private repo? Create a PAT at{' '}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
            github.com/settings/tokens
          </a>{' '}with <b>repo (read)</b> scope. The token is stored so re-scans work automatically.
        </div>
      </div>
      <button style={S.btn} onClick={scanGithub} disabled={!ghUrl}>Scan repo →</button>
    </div>

    {status && (
      <div style={{ padding:'10px 14px', background:'#F0FDF4', borderRadius:8, fontSize:12.5, color:'#16a34a', marginBottom:16 }}>
        {status}
      </div>
    )}

    {/* Ingested sources table */}
    {project.documents?.length > 0 && (
      <div style={S.card}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Ingested Sources</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>File / URL</th>
              <th style={S.th}>Type</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Output</th>
              <th style={S.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {project.documents.map((d) => (
              <tr key={d.id}>
                <td style={S.td}>
                  <b style={{ fontSize:12 }}>{d.filename?.split('/').pop() || d.filename}</b>
                  {/* Token override for private GitHub repos that 401'd */}
                  {d.type === 'github' && d.status?.startsWith('error') && d.status.includes('401') && (
                    <div style={{ marginTop:5 }}>
                      <input
                        type="password"
                        placeholder="Enter GitHub token to fix 401"
                        value={rescanTok[d.id] || ''}
                        onChange={e => setRTok(t => ({...t, [d.id]: e.target.value}))}
                        style={{ fontSize:11, padding:'4px 8px', border:'1.5px solid #FCA5A5', borderRadius:6, width:'100%', boxSizing:'border-box' }}
                      />
                    </div>
                  )}
                </td>
                <td style={S.td}><span style={{ fontSize:11 }}>{d.type}</span></td>
                <td style={S.td}>
                  <span style={{ fontSize:11, fontWeight:700, color: statusColor(d.status) }}>
                    {d.status}
                  </span>
                </td>
                <td style={S.td}>
                  <span style={{ fontSize:11, color:'#747480' }}>
                    {d.qa_pairs ? `${d.qa_pairs} Q&As` : d.messages_found ? `${d.messages_found} msgs` : '—'}
                  </span>
                </td>
                <td style={S.td}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button
                      onClick={() => rescan(d)}
                      title="Re-ingest this source (wipes old KB entries)"
                      style={{ padding:'4px 10px', background:'#EFF6FF', border:'1.5px solid #BFDBFE',
                        borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', color:'#1d4ed8' }}>
                      ↻ Re-scan
                    </button>
                    <button
                      onClick={() => deleteDoc(d)}
                      disabled={deleting[d.id]}
                      title="Delete this source and all its KB entries"
                      style={{ padding:'4px 10px', background:'#FEF2F2', border:'1.5px solid #FECACA',
                        borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', color:'#dc2626',
                        opacity: deleting[d.id] ? 0.5 : 1 }}>
                      🗑 Delete
                    </button>
                  </div>
                  {rescanSt[d.id] && (
                    <div style={{ fontSize:10, marginTop:4, color: rescanSt[d.id].startsWith('✓') ? '#16a34a' : '#dc2626' }}>
                      {rescanSt[d.id]}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
}

function KBTab({ pid, S }) {
  const [entries, setEntries] = useState([])
  useEffect(() => { API.get(`/admin/kb/${pid}/assistant-kb`).then(r => setEntries(r || [])) }, [pid])
  if (!entries.length) return <div style={{ padding:40, textAlign:'center', color:'#747480' }}>No assistant KB entries yet. Upload a PDF or user manual in the Ingest tab.</div>
  return <div style={S.card}>
    <div style={{ fontWeight:700, marginBottom:14 }}>{entries.length} Assistant KB Entries</div>
    <table style={S.table}>
      <thead><tr><th style={S.th}>Question</th><th style={S.th}>Answer</th><th style={S.th}>Source</th></tr></thead>
      <tbody>{entries.map((e, i) => (
        <tr key={i}>
          <td style={S.td}><b style={{ fontSize:12 }}>{e.q}</b></td>
          <td style={{ ...S.td, fontSize:12, color:'#3C3C48' }}>{e.a?.slice(0,200)}{e.a?.length>200?'…':''}</td>
          <td style={S.td}><span style={{ fontSize:11, color:'#747480' }}>{e.doc_type} p.{e.source_page}</span></td>
        </tr>
      ))}</tbody>
    </table>
  </div>
}

function SupportKBTab({ pid, S, reload }) {
  const [messages, setMessages] = useState([])
  const [kb, setKb]             = useState([])
  const [buildStatus, setBuild] = useState('')
  const [activeView, setView]   = useState('pending')

  const loadAll = () => {
    API.get(`/admin/kb/${pid}/messages?status=pending`).then(setMessages)
    API.get(`/admin/kb/${pid}/support-kb`).then(setKb)
  }
  useEffect(() => { loadAll() }, [pid])

  const approve = async (mid) => {
    await API.post(`/admin/kb/${pid}/messages/${mid}/approve`)
    loadAll()
  }
  const dismiss = async (mid) => {
    await API.post(`/admin/kb/${pid}/messages/${mid}/dismiss`)
    loadAll()
  }
  const approveAll = async () => {
    await API.post(`/admin/kb/${pid}/messages/approve-all`)
    loadAll()
  }
  const build = async () => {
    setBuild('Building…')
    await API.post(`/admin/kb/${pid}/build`)
    setBuild('✓ Build started — refresh in ~30s')
    setTimeout(() => { loadAll(); setBuild('') }, 8000)
  }

  return <>
    <div style={{ display:'flex', gap:8, marginBottom:16 }}>
      {['pending','kb'].map(v => (
        <button key={v} onClick={() => setView(v)}
          style={{ padding:'7px 16px', border:'1.5px solid #E1E1E6', borderRadius:7, cursor:'pointer',
            background: activeView===v ? '#2E2E38' : '#fff', color: activeView===v ? '#FFE600' : '#2E2E38',
            fontWeight:700, fontSize:12 }}>
          {v==='pending' ? `Pending review (${messages.length})` : `Support KB (${kb.length})`}
        </button>
      ))}
      {messages.length > 0 && <button onClick={approveAll} style={{ ...S.btnGhost, marginLeft:'auto' }}>Approve all</button>}
      <button onClick={build} style={{ ...S.btn, marginLeft: messages.length ? 0 : 'auto' }}>
        {buildStatus || 'Build KB →'}
      </button>
    </div>

    {activeView === 'pending' && <>
      {messages.length === 0
        ? <div style={{ padding:32, background:'#F6F6FA', borderRadius:10, border:'1.5px solid #E1E1E6' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>🎧 Support KB Build Flow</div>
            {[
              {step:'1', label:'Scan GitHub repo', desc:'Ingest tab → repo URL + GitHub token (required for private repos) → Scan repo'},
              {step:'2', label:'Review messages', desc:'Error codes and HTTP exceptions appear here. Approve ones you want in the KB.'},
              {step:'3', label:'Build Support KB', desc:'Click "Build KB →" above. AI generates context, severity, and recommended action per message.'},
            ].map(({step,label,desc}) => (
              <div key={step} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid #E1E1E6' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:'#FFE600', display:'flex', alignItems:'center',
                  justifyContent:'center', fontWeight:800, fontSize:12, flexShrink:0 }}>{step}</div>
                <div><b style={{ fontSize:13 }}>{label}</b><div style={{ fontSize:12, color:'#747480', marginTop:2 }}>{desc}</div></div>
              </div>
            ))}
            <div style={{ fontSize:12, color:'#747480', marginTop:10 }}>
              For private repos: re-scan via Ingest tab with your GitHub PAT. Scanner detects <code>raise HTTPException(...)</code> and structured codes like APP-001.
            </div>
          </div>
        : <div style={S.card}>
          <table style={S.table}>
            <thead><tr><th style={S.th}>ID</th><th style={S.th}>File</th><th style={S.th}>Message</th><th style={S.th}></th></tr></thead>
            <tbody>{messages.map((m, i) => (
              <tr key={i}>
                <td style={S.td}><b style={{ fontSize:11 }}>{m.message_id}</b></td>
                <td style={{ ...S.td, fontSize:11, color:'#747480' }}>{m.file_path}:{m.line_number}</td>
                <td style={{ ...S.td, fontSize:11 }}>{m.raw_message?.slice(0,80)}</td>
                <td style={S.td}>
                  <button onClick={() => approve(m.message_id)} style={{ ...S.btn, padding:'4px 10px', fontSize:11, marginRight:6 }}>✓</button>
                  <button onClick={() => dismiss(m.message_id)} style={{ ...S.btnGhost, padding:'4px 10px', fontSize:11 }}>✗</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </>}

    {activeView === 'kb' && <>
      {kb.length === 0
        ? <div style={{ padding:40, textAlign:'center', color:'#747480' }}>No support KB yet. Approve messages then click Build KB.</div>
        : <div style={S.card}>
          <table style={S.table}>
            <thead><tr><th style={S.th}>ID</th><th style={S.th}>Severity</th><th style={S.th}>Context</th><th style={S.th}>Action</th></tr></thead>
            <tbody>{kb.map((k, i) => (
              <tr key={i}>
                <td style={S.td}><b>{k.message_id}</b></td>
                <td style={S.td}><span style={{ fontSize:11, fontWeight:700, color: k.severity==='High'?'#dc2626':k.severity==='Medium'?'#d97706':'#16a34a' }}>{k.severity}</span></td>
                <td style={{ ...S.td, fontSize:11, color:'#3C3C48' }}>{k.business_context?.slice(0,100)}</td>
                <td style={{ ...S.td, fontSize:11 }}>{k.recommended_action?.slice(0,80)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </>}
  </>
}

function EmbedTab({ project, S, embedHost }) {
  const [copied, setCopied] = useState('')
  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(() => setCopied(''), 2000)
  }

  const assistantSnippet = `<!-- HelpKit AI Assistant -->
<script src="${embedHost}/embed/assistant.js"
  data-key="${project.assistant_key}"
  data-api="${embedHost}"
  data-page="home">
</script>`

  const supportSnippet = `<!-- HelpKit L1/L2/L3 Support -->
<script src="${embedHost}/embed/support.js"
  data-key="${project.support_key}"
  data-api="${embedHost}"
  data-role="L1">
</script>`

  const reactSnippet = `// React — dynamic page detection
useEffect(() => {
  const s1 = document.createElement('script')
  s1.src = '${embedHost}/embed/assistant.js'
  s1.setAttribute('data-key', '${project.assistant_key}')
  s1.setAttribute('data-api', '${embedHost}')
  s1.setAttribute('data-page', window.location.pathname)
  document.body.appendChild(s1)
  return () => document.body.removeChild(s1)
}, [])`

  const EmbedCard = ({ title, desc, snippet, key }) => (
    <div style={{ ...S.card, border:'1.5px solid #E1E1E6' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ fontWeight:700, fontSize:15 }}>{title}</div>
        <button onClick={() => copy(snippet, key)} style={{ ...S.btnGhost, marginLeft:'auto', fontSize:11 }}>
          {copied===key ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div style={{ fontSize:12, color:'#747480', marginBottom:10 }}>{desc}</div>
      <pre style={S.code}>{snippet}</pre>
    </div>
  )

  return <>
    <div style={{ ...S.card, background:'#F0FDF4', border:'1.5px solid #86EFAC' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>✓ Both widgets are ready to embed</div>
      <div style={{ fontSize:13, lineHeight:1.6 }}>
        Copy the snippet below and paste it before the <code>&lt;/body&gt;</code> tag of any HTML page — or use the React version for SPAs.
        Both widgets work in demo mode without a Groq key, but set one in <b>Settings</b> for live AI responses.
      </div>
    </div>

    <EmbedCard title="🤖 AI Assistant Widget" key="asst"
      desc="Floating 🤖 button. Answers questions about your app using the ingested knowledge base."
      snippet={assistantSnippet} />

    <EmbedCard title="🎧 L1/L2/L3 Support Widget" key="sup"
      desc="Floating 🎧 button. L1/L2/L3 tiered chat for end-user and developer support."
      snippet={supportSnippet} />

    <EmbedCard title="⚛ React / SPA Integration" key="react"
      desc="Use this pattern for React apps where the page changes dynamically."
      snippet={reactSnippet} />

    <div style={{ ...S.card, background:'#FFF8DC', border:'1.5px solid #FFE600' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>API Keys (keep these private)</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div><div style={{ fontSize:11, color:'#747480', marginBottom:4 }}>ASSISTANT KEY</div><code style={{ fontSize:12 }}>{project.assistant_key}</code></div>
        <div><div style={{ fontSize:11, color:'#747480', marginBottom:4 }}>SUPPORT KEY</div><code style={{ fontSize:12 }}>{project.support_key}</code></div>
      </div>
    </div>
  </>
}
