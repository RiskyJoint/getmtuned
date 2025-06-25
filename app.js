// Front-end logic for M-TUNED portal
const signupForm = document.getElementById('signupForm')
const loginForm = document.getElementById('loginForm')
const uploadSection = document.getElementById('uploadSection')
const orderSection = document.getElementById('orderSection')
const tuneSection = document.getElementById('tuneSection')
const chatSection = document.getElementById('chatSection')
const logList = document.getElementById('logList')
const fileInput = document.getElementById('logInput')
const orderTableBody = document.querySelector('#orderTable tbody')
const tuneList = document.getElementById('tuneList')
const chatInput = document.getElementById('chatInput')
const chatSend = document.getElementById('chatSend')
const chatBox = document.getElementById('chatBox')

let token = localStorage.getItem('token') || ''

if (token) {
  showPortal()
}

signupForm?.addEventListener('submit', async e => {
  e.preventDefault()
  const email = signupForm.email.value
  const password = signupForm.password.value
  await fetch('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  alert('Signup complete, please login')
  signupForm.reset()
})

loginForm?.addEventListener('submit', async e => {
  e.preventDefault()
  const email = loginForm.email.value
  const password = loginForm.password.value
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) return alert('Login failed')
  const data = await res.json()
  token = data.token
  localStorage.setItem('token', token)
  showPortal()
})

function showPortal() {
  document.getElementById('authSection').style.display = 'none'
  uploadSection.style.display = 'block'
  orderSection.style.display = 'block'
  tuneSection.style.display = 'block'
  chatSection.style.display = 'block'
  loadOrders()
}

fileInput?.addEventListener('change', async e => {
  const file = e.target.files[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  await fetch('/api/upload-log', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  })
  const li = document.createElement('li')
  li.textContent = file.name
  logList.appendChild(li)
  e.target.value = ''
  loadOrders()
})

async function loadOrders() {
  const res = await fetch('/api/order-status', {
    headers: { Authorization: 'Bearer ' + token }
  })
  if (!res.ok) return
  const orders = await res.json()
  orderTableBody.innerHTML = ''
  tuneList.innerHTML = ''
  orders.forEach(o => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${o.id}</td><td>${o.status}</td><td>${o.updated_at}</td>`
    orderTableBody.appendChild(tr)
    if (o.status === 'tune ready') {
      const li = document.createElement('li')
      const link = document.createElement('a')
      link.href = `/tunes/${o.id}`
      link.textContent = `Download tune for ${o.id}`
      li.appendChild(link)
      tuneList.appendChild(li)
    }
  })
}

chatSend?.addEventListener('click', async () => {
  const msg = chatInput.value.trim()
  if (!msg) return
  chatBox.value += `You: ${msg}\n`
  chatInput.value = ''
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messages: [{ role: 'user', content: msg }] })
  })
  const data = await res.json()
  chatBox.value += `AI: ${data.choices[0].message.content}\n`
})
