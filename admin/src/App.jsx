import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom'
import API from './api'
import Login from './pages/Login'
import Projects from './pages/Projects'
import Project from './pages/Project'
import Settings from './pages/Settings'

const G = {
  body: { margin:0, fontFamily:'system-ui,-apple-system,sans-serif', background:'#F4F4F8', color:'#2E2E38', minHeight:'100vh' },
  nav: { background:'#2E2E38', color:'#FFE600', padding:'0 24px', height:52, display:'flex', alignItems:'center', gap:24 },
  navLink: { color:'#FFE600', textDecoration:'none', fontSize:13, fontWeight:600, opacity:0.8 },
  navLinkActive: { color:'#FFE600', textDecoration:'none', fontSize:13, fontWeight:700, opacity:1, borderBottom:'2px solid #FFE600', paddingBottom:2 },
  logo: { fontWeight:800, fontSize:17, letterSpacing:1, color:'#FFE600', marginRight:16 },
  main: { maxWidth:1100, margin:'32px auto', padding:'0 24px' },
}

function Nav() {
  const loc = useLocation()
  const nav = useNavigate()
  const link = (to, label) => (
    <Link to={to} style={loc.pathname.startsWith(to) ? G.navLinkActive : G.navLink}>{label}</Link>
  )
  return (
    <div style={G.nav}>
      <span style={G.logo}>⚙ HelpKit</span>
      {link('/projects', 'Projects')}
      {link('/settings', 'Settings')}
      <span style={{ marginLeft:'auto', fontSize:12, color:'#FFE600', opacity:0.6, cursor:'pointer' }}
        onClick={() => { API.logout(); nav('/login') }}>Log out</span>
    </div>
  )
}

function Protected({ children }) {
  if (!API.isLoggedIn()) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={G.body}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <Protected>
              <Nav />
              <div style={G.main}>
                <Routes>
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:id" element={<Project />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/" element={<Navigate to="/projects" />} />
                </Routes>
              </div>
            </Protected>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
