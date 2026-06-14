import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../api'

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [creating, setCreating] = useState(false)
  const [form, setForm]         = useState({ name:'', description:'' })
  const nav = useNavigate()

  const load = () => API.get('/projects').then(setProjects)
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    const p = await API.post('/projects', form)
    setCreating(false); setForm({ name:'', description:'' })
    load()
    nav(`/projects/${p.id}`)
  }

  const S = {
    card: { background:'#fff', borderRadius:10, padding:24, boxShadow:'0 1px 8px rgba(0,0,0,0.07)',
      cursor:'pointer', border:'1.5px solid #E1E1E6', transition:'border-color 0.15s, box-shadow 0.15s' },
    grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 },
    input: { width:'100%', padding:'9px 12px', border:'1.5px solid #E1E1E6', borderRadius:8,
      fontSize:13, boxSizing:'border-box', outline:'none', marginBottom:10 },
    modal: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center' },
    modalBox: { background:'#fff', borderRadius:12, padding:32, width:440, boxShadow:'0 8px 40px rgba(0,0,0,0.2)' },
  }

  return <>
    <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
      <div style={{ fontWeight:800, fontSize:22 }}>Projects</div>
      <button onClick={() => setCreating(true)}
        style={{ marginLeft:'auto', padding:'9px 20px', background:'#FFE600', border:'none',
          borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
        + New Project
      </button>
    </div>

    {projects.length === 0 && !creating && (
      <div style={{ textAlign:'center', padding:60, color:'#747480' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>No projects yet</div>
        <div style={{ fontSize:14, marginBottom:24 }}>Create a project for each application you want to add HelpKit to</div>
        <button onClick={() => setCreating(true)}
          style={{ padding:'10px 28px', background:'#FFE600', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>
          Create first project
        </button>
      </div>
    )}

    <div style={S.grid}>
      {projects.map(p => (
        <div key={p.id} style={S.card}
          onClick={() => nav(`/projects/${p.id}`)}
          onMouseEnter={e => { e.currentTarget.style.borderColor='#FFE600'; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='#E1E1E6'; e.currentTarget.style.boxShadow='0 1px 8px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📱</div>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{p.name}</div>
          <div style={{ fontSize:12, color:'#747480', marginBottom:14 }}>{p.description || 'No description'}</div>
          <div style={{ display:'flex', gap:8 }}>
            <span style={{ fontSize:11, background:'#F0FDF4', color:'#16a34a', borderRadius:4, padding:'2px 8px', fontWeight:600 }}>
              🤖 Assistant ready
            </span>
            <span style={{ fontSize:11, background:'#EFF6FF', color:'#0284c7', borderRadius:4, padding:'2px 8px', fontWeight:600 }}>
              🎧 Support ready
            </span>
          </div>
        </div>
      ))}
    </div>

    {creating && (
      <div style={S.modal} onClick={e => { if(e.target===e.currentTarget) setCreating(false) }}>
        <form style={S.modalBox} onSubmit={create}>
          <div style={{ fontWeight:700, fontSize:18, marginBottom:20 }}>New Project</div>
          <input required value={form.name} placeholder="App name (e.g. RITES DPR Platform)"
            style={S.input} onChange={e => setForm({...form, name:e.target.value})} />
          <input value={form.description} placeholder="Short description (optional)"
            style={S.input} onChange={e => setForm({...form, description:e.target.value})} />
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button type="button" onClick={() => setCreating(false)}
              style={{ padding:'9px 20px', background:'#F6F6FA', border:'none', borderRadius:8, cursor:'pointer' }}>Cancel</button>
            <button type="submit"
              style={{ padding:'9px 20px', background:'#FFE600', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>Create</button>
          </div>
        </form>
      </div>
    )}
  </>
}
