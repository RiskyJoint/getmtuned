const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatBox = document.getElementById('chatBox');
let token = localStorage.getItem('token') || '';

chatSend?.addEventListener('click', async () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatBox.value += `You: ${msg}\n`;
  chatInput.value = '';
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messages: [{ role: 'user', content: msg }] })
  });
  const data = await res.json();
  chatBox.value += `AI: ${data.choices[0].message.content}\n`;
});
