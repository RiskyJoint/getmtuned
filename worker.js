// Cloudflare Worker to power the M-TUNED portal
// This worker demonstrates how you might handle user auth,
// file uploads, order tracking and AI-based chat assistance.
// In a real deployment you would separate handlers, add proper
// error handling, and secure secrets appropriately.

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const pathname = url.pathname

    // Route requests based on path
    if (pathname.startsWith('/api/signup')) {
      return handleSignup(request, env)
    }
    if (pathname.startsWith('/api/login')) {
      return handleLogin(request, env)
    }
    if (pathname.startsWith('/api/upload-log')) {
      return handleLogUpload(request, env)
    }
    if (pathname.startsWith('/api/submit-tune')) {
      return handleTuneUpload(request, env)
    }
    if (pathname.startsWith('/api/order-status')) {
      return handleOrderStatus(request, env)
    }
    if (pathname.startsWith('/api/chat')) {
      return handleChat(request, env)
    }
    return new Response('Not found', { status: 404 })
  }
}

// --- Helper functions ---

// Example signup handler storing user credentials in D1
async function handleSignup(request, env) {
  const data = await request.json()
  const { email, password } = data
  if (!email || !password) {
    return new Response('Missing credentials', { status: 400 })
  }
  // Example using a simple hash for demonstration
  const hash = await hashPassword(password)
  await env.DB.prepare('INSERT INTO users (email, hash) VALUES (?, ?)')
    .bind(email, hash).run()
  return new Response('ok')
}

async function handleLogin(request, env) {
  const data = await request.json()
  const { email, password } = data
  const { results } = await env.DB.prepare('SELECT hash FROM users WHERE email = ?')
    .bind(email).all()
  if (!results.length) return new Response('Unauthorized', { status: 401 })
  const [user] = results
  const ok = await verifyPassword(password, user.hash)
  if (!ok) return new Response('Unauthorized', { status: 401 })
  const token = await createJwt(email, env)
  return new Response(JSON.stringify({ token }), { headers: { 'content-type': 'application/json' } })
}

// File upload using R2 bucket
async function handleLogUpload(request, env) {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.res
  const orderId = auth.email + '-' + Date.now()
  const form = await request.formData()
  const file = form.get('file')
  await env.LOG_BUCKET.put(`${auth.email}/${orderId}/${file.name}`, file.stream())
  await env.DB.prepare('INSERT INTO orders (email, id, status) VALUES (?, ?, ?)')
    .bind(auth.email, orderId, 'uploaded').run()
  await sendEmail(auth.email, 'Logs received for order ' + orderId, env)
  return new Response('uploaded')
}

async function handleTuneUpload(request, env) {
  const auth = await authenticateAdmin(request, env)
  if (!auth.ok) return auth.res
  const { orderId } = await request.json()
  const form = await request.formData()
  const file = form.get('file')
  await env.TUNE_BUCKET.put(`${orderId}/${file.name}`, file.stream())
  await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?')
    .bind('tune ready', orderId).run()
  const { results } = await env.DB.prepare('SELECT email FROM orders WHERE id = ?').bind(orderId).all()
  const email = results[0].email
  await sendEmail(email, 'Your tune is ready for order ' + orderId, env)
  return new Response('tune uploaded')
}

async function handleOrderStatus(request, env) {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.res
  const { results } = await env.DB.prepare('SELECT id, status, updated_at FROM orders WHERE email = ?')
    .bind(auth.email).all()
  return new Response(JSON.stringify(results), { headers: { 'content-type': 'application/json' } })
}

// Chat using Cloudflare Workers AI
// Allows optional authentication so public users can ask questions
async function handleChat(request, env) {
  let email = 'guest'
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    const auth = await authenticate(request, env)
    if (!auth.ok) return auth.res
    email = auth.email
  }
  const body = await request.json()
  const messages = body.messages || []
  // Include email for potential future customization
  const answer = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', { messages })
  return new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } })
}

// --- Utility functions ---

async function hashPassword(password) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyPassword(password, hash) {
  return hash === await hashPassword(password)
}

async function createJwt(email, env) {
  // extremely simplified JWT using a secret from env
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ email, exp: Date.now() + 86400000 }))
  const signature = await hmacSha256(header + '.' + payload, env.JWT_SECRET)
  return `${header}.${payload}.${signature}`
}

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return { ok: false, res: new Response('Unauthorized', { status: 401 }) }
  const [header, payload, sig] = token.split('.')
  const valid = await hmacSha256(`${header}.${payload}`, env.JWT_SECRET)
  if (sig !== valid) return { ok: false, res: new Response('Unauthorized', { status: 401 }) }
  const data = JSON.parse(atob(payload))
  if (Date.now() > data.exp) return { ok: false, res: new Response('Expired', { status: 401 }) }
  return { ok: true, email: data.email }
}

async function authenticateAdmin(request, env) {
  const user = await authenticate(request, env)
  if (!user.ok) return user
  const { results } = await env.DB.prepare('SELECT role FROM users WHERE email = ?')
    .bind(user.email).all()
  if (!results.length || results[0].role !== 'admin') {
    return { ok: false, res: new Response('Forbidden', { status: 403 }) }
  }
  return user
}

async function hmacSha256(str, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(str))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sendEmail(email, subject, env) {
  // Use Cloudflare Email Workers or external service via fetch
  await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: 'noreply@mtuned.example' },
      subject,
      content: [{ type: 'text/plain', value: subject }]
    })
  })
}

