const TRASH_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5h15"/><path d="M4 5v10a2 2 0 002 2h8a2 2 0 002-2V5"/><path d="M7 5V3.5a1 1 0 011-1h4a1 1 0 011 1V5"/><path d="M8 8.5v5"/><path d="M12 8.5v5"/></svg>';
const CONFIRM_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

const LM_STUDIO_BASE = 'http://localhost:1234';
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatResult = document.getElementById('chat-result');

let modelName = '';

// Conversation state
const CONVERSATIONS_KEY = 'ai-central-conversations';
let conversations = [];
let currentConversationId = null;
let isStreaming = false;

// Sidebar elements
const sidebar = document.getElementById('sidebar');
const sidebarTrigger = document.getElementById('sidebar-trigger');
const conversationListEl = document.getElementById('conversation-list');
const newChatBtn = document.getElementById('new-chat-btn');
let sidebarTimeout = null;

// Sidebar hover logic
sidebarTrigger.addEventListener('mouseenter', () => openSidebar());
sidebar.addEventListener('mouseenter', () => {
    clearTimeout(sidebarTimeout);
    openSidebar();
});
sidebar.addEventListener('mouseleave', () => {
    sidebarTimeout = setTimeout(() => closeSidebar(), 200);
});

function openSidebar() {
    clearTimeout(sidebarTimeout);
    sidebar.classList.add('expanded');
    document.body.classList.add('sidebar-open');
}

function closeSidebar() {
    sidebar.classList.remove('expanded');
    document.body.classList.remove('sidebar-open');
}

// Conversation management
function loadConversations() {
    try {
        const data = localStorage.getItem(CONVERSATIONS_KEY);
        conversations = data ? JSON.parse(data) : [];
    } catch {
        conversations = [];
    }
}

function saveConversations() {
    try {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    } catch { }
}

function generateTitle(text) {
    const words = text.trim().split(/\s+/);
    if (words.length === 0 || words[0] === '') return 'New conversation';
    const title = words.slice(0, 4).join(' ');
    return words.length > 4 ? title + '\u2026' : title;
}

function createConversation() {
    const conv = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: 'New conversation',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    conversations.unshift(conv);
    saveConversations();
    return conv;
}

function getCurrentConversation() {
    return conversations.find(c => c.id === currentConversationId);
}

function switchConversation(id) {
    if (isStreaming) return;
    currentConversationId = id;
    renderConversationList();
    renderMessages();
    const conv = getCurrentConversation();
    if (conv && conv.messages.length > 0) {
        document.body.classList.add('sent');
    } else {
        document.body.classList.remove('sent');
        updateGreeting();
    }
    input.focus();
}

function renderConversationList() {
    conversationListEl.innerHTML = '';
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        if (conv.id === currentConversationId) {
            item.classList.add('active');
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'conv-title';
        titleSpan.textContent = conv.title;
        item.appendChild(titleSpan);

        const del = document.createElement('button');
        del.className = 'conv-delete';
        del.innerHTML = TRASH_ICON;
        del.title = 'Delete conversation';

        let clickCount = 0;
        let resetTimer = null;

        del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (clickCount === 0) {
                clickCount = 1;
                del.classList.add('confirming');
                del.innerHTML = CONFIRM_ICON;
                resetTimer = setTimeout(() => {
                    clickCount = 0;
                    del.classList.remove('confirming');
                    del.innerHTML = TRASH_ICON;
                }, 2000);
                return;
            }
            clearTimeout(resetTimer);
            const idx = conversations.indexOf(conv);
            if (idx === -1) return;
            conversations.splice(idx, 1);
            saveConversations();
            if (currentConversationId === conv.id) {
                if (conversations.length > 0) {
                    switchConversation(conversations[0].id);
                } else {
                    const newConv = createConversation();
                    switchConversation(newConv.id);
                }
            } else {
                renderConversationList();
            }
        });

        item.addEventListener('mouseleave', () => {
            if (clickCount === 1) {
                clickCount = 0;
                if (resetTimer !== null) {
                    clearTimeout(resetTimer);
                    resetTimer = null;
                }
                del.classList.remove('confirming');
                del.innerHTML = TRASH_ICON;
            }
        });

        item.addEventListener('click', () => switchConversation(conv.id));
        item.appendChild(del);
        conversationListEl.appendChild(item);
    });
}

async function updateGreeting() {
    const el = document.getElementById('welcome-greeting');
    if (!el) return;
    const textEl = el.querySelector('.greeting-text');
    if (textEl) {
        textEl.textContent = await window.getGreeting();
    }
}

function renderMessages() {
    chatResult.innerHTML = '';
    const conv = getCurrentConversation();
    if (!conv) return;

    if (conv.messages.length === 0) {
        const wrapper = document.createElement('div');
        wrapper.className = 'welcome-greeting';
        wrapper.id = 'welcome-greeting';
        wrapper.innerHTML = '<div class="greeting-text">\u200B</div><div class="greeting-sub">AI Central</div>';
        chatResult.appendChild(wrapper);
        return;
    }

    conv.messages.forEach(msg => {
        if (msg.role === 'user') {
            const div = document.createElement('div');
            div.className = 'message user-message';
            div.innerHTML = '<span class="message-label">User:</span>' + escapeHtml(msg.content);
            chatResult.appendChild(div);
        } else if (msg.role === 'assistant') {
            const div = document.createElement('div');
            div.className = 'message ai-message';
            const label = document.createElement('span');
            label.className = 'message-label';
            label.textContent = 'AI:';
            div.appendChild(label);
            const contentDiv = document.createElement('div');
            contentDiv.className = 'response-text markdown-body';
            renderMarkdown(msg.content, contentDiv);
            div.appendChild(contentDiv);
            chatResult.appendChild(div);
        }
    });
    scrollToBottom();
}

newChatBtn.addEventListener('click', () => {
    if (isStreaming) return;
    const current = getCurrentConversation();
    if (current && current.messages.length === 0) {
        return;
    }
    const conv = createConversation();
    switchConversation(conv.id);
});

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
    loadConversations();
    if (conversations.length === 0) {
        const conv = createConversation();
        currentConversationId = conv.id;
    } else {
        currentConversationId = conversations[0].id;
    }
    renderConversationList();
    renderMessages();
    const conv = getCurrentConversation();
    if (conv && conv.messages.length > 0) {
        document.body.classList.add('sent');
    } else {
        document.body.classList.remove('sent');
        updateGreeting();
    }

    try {
        const res = await fetch(`${LM_STUDIO_BASE}/v1/models`);
        const data = await res.json();
        modelName = data.data[0]?.id;
        if (!modelName) {
            chatResult.textContent = 'No model loaded in LM Studio';
            sendBtn.disabled = true;
        }
    } catch { }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
    const message = input.value.trim();
    if (!message || !modelName || isStreaming) return;

    let conv = getCurrentConversation();
    if (!conv) {
        conv = createConversation();
        currentConversationId = conv.id;
        renderConversationList();
    }

    document.body.classList.add('sent');
    const greetingEl = document.getElementById('welcome-greeting');
    if (greetingEl) greetingEl.remove();

    const isFirstMessage = conv.messages.length === 0;
    conv.messages.push({ role: 'user', content: message });
    if (isFirstMessage) {
        conv.title = generateTitle(message);
    }
    conv.updatedAt = Date.now();
    saveConversations();

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

    isStreaming = true;
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
        isStreaming = false;
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

    if (hasStarted && rawMarkdown) {
        conv.messages.push({ role: 'assistant', content: rawMarkdown });
        conv.updatedAt = Date.now();
        saveConversations();
        renderConversationList();
    }

    isStreaming = false;
}

init();
