const LM_STUDIO_BASE = 'http://localhost:1234';
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatResult = document.getElementById('chat-result');

let modelName = '';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const el = document.querySelector('.result-container');
    if (el) el.scrollTop = el.scrollHeight;
}

function renderMarkdown(raw, container) {
    container.innerHTML = marked.parse(raw, { breaks: true, gfm: true });
    container.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
    scrollToBottom();
}

async function init() {
    const res = await fetch(`${LM_STUDIO_BASE}/v1/models`);
    const data = await res.json();
    modelName = data.data[0]?.id;
    if (!modelName) {
        chatResult.textContent = 'No model loaded in LM Studio';
        sendBtn.disabled = true;
    }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
    const message = input.value.trim();
    if (!message || !modelName) return;

    document.body.classList.add('sent');

    const userDiv = document.createElement('div');
    userDiv.className = 'message user-message';
    userDiv.innerHTML = '<span class="message-label">User:</span>' + escapeHtml(message);
    chatResult.appendChild(userDiv);
    scrollToBottom();

    const aiDiv = document.createElement('div');
    aiDiv.className = 'message ai-message';

    const aiLabel = document.createElement('span');
    aiLabel.className = 'message-label';
    aiLabel.textContent = 'AI:';
    aiDiv.appendChild(aiLabel);

    const reasoningEl = document.createElement('span');
    reasoningEl.className = 'reasoning-text';
    reasoningEl.textContent = '*reasoning*';
    aiDiv.appendChild(reasoningEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'response-text markdown-body';

    chatResult.appendChild(aiDiv);
    input.value = '';
    input.focus();

    let hasStarted = false;
    let rawMarkdown = '';

    const response = await fetch(`${LM_STUDIO_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: message }
            ],
            stream: true
        })
    });

    if (!response.ok) {
        reasoningEl.classList.add('fading');
        setTimeout(() => {
            reasoningEl.remove();
            contentEl.textContent = `Error: ${response.status} ${response.statusText}`;
            aiDiv.appendChild(contentEl);
            scrollToBottom();
        }, 400);
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || '';

                if (!hasStarted && content) {
                    hasStarted = true;
                    reasoningEl.classList.add('fading');
                    setTimeout(() => {
                        reasoningEl.remove();
                        aiDiv.appendChild(contentEl);
                        scrollToBottom();
                    }, 400);
                }

                if (hasStarted) {
                    rawMarkdown += content;
                    renderMarkdown(rawMarkdown, contentEl);
                }
            } catch { }
        }
    }

    if (!hasStarted) {
        reasoningEl.classList.add('fading');
        setTimeout(() => reasoningEl.remove(), 400);
    }
}

init();
