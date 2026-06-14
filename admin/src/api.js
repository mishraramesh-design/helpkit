const BASE = '/api'
const TOKEN = () => localStorage.getItem('hk_token') || ''

const req = (method, path, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': TOKEN() },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json())

const upload = (path, formData) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Admin-Token': TOKEN() },
    body: formData,
  }).then(r => r.json())

export default {
  get:    (p)    => req('GET', p),
  post:   (p, b) => req('POST', p, b),
  put:    (p, b) => req('PUT', p, b),
  del:    (p)    => req('DELETE', p),
  upload: (p, f) => upload(p, f),
  isLoggedIn: () => !!TOKEN(),
  login: (t) => localStorage.setItem('hk_token', t),
  logout: () => localStorage.removeItem('hk_token'),
}
