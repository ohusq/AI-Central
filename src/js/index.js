const LM_STUDIO_BASE = 'http://localhost:1234';
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const resultDiv = document.getElementById('chat-result').querySelector('p');

let modelName = '';

async function init() {
    const res = await fetch(`${LM_STUDIO_BASE}/v1/models`);
    const data = await res.json();
    modelName = data.data[0]?.id;
    if (!modelName) {
        resultDiv.textContent = 'No model loaded in LM Studio';
        sendBtn.disabled = true;
    }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
    const message = input.value.trim();
    if (!message || !modelName) return;

    input.value = '';
    resultDiv.textContent = '';

    const response = await fetch(`${LM_STUDIO_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: message }],
            stream: true
        })
    });

    if (!response.ok) {
        resultDiv.textContent = `Error: ${response.status} ${response.statusText}`;
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
                resultDiv.textContent += content;
            } catch { }
        }
    }
}

init();
