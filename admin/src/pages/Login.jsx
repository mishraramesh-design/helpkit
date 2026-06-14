import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../api'

export default function Login() {
  const [token, setToken] = useState('')
  const [err, setErr]     = useState('')
  const nav = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    API.login(token.trim())
    const r = await API.get('/health')
    if (r.status === 'ok') { nav('/projects') }
    else { setErr('Invalid token'); API.logout() }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#2E2E38' }}>
      <form onSubmit={submit} style={{ background:'#fff', borderRadius:12, padding:'40px 48px', width:360, boxShadow:'0 8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize:28, marginBottom:4 }}>⚙</div>
        <div style={{ fontWeight:800, fontSize:22, marginBottom:4 }}>HelpKit Admin</div>
        <div style={{ fontSize:13, color:'#747480', marginBottom:28 }}>Plug-and-play AI assistant + support widgets</div>
        <input value={token} onChange={e => setToken(e.target.value)}
          placeholder="Admin token"
          style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1.5px solid #E1E1E6',
            fontSize:14, boxSizing:'border-box', marginBottom:12, outline:'none' }} />
        {err && <div style={{ color:'#dc2626', fontSize:12, marginBottom:8 }}>{err}</div>}
        <button type="submit" style={{ width:'100%', padding:'11px', background:'#FFE600',
          border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer' }}>
          Sign in
        </button>
        <div style={{ fontSize:11, color:'#9999A8', marginTop:16, textAlign:'center' }}>
          Default token: <code>hk-admin-token</code> (set ADMIN_TOKEN env var to change)
        </div>
      </form>
    </div>
  )
}
