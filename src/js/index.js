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

    var pendingAiDiv = null;

    conv.messages.forEach(msg => {
        if (msg.role === 'user') {
            pendingAiDiv = null;
            const div = document.createElement('div');
            div.className = 'message user-message';
            div.innerHTML = '<span class="message-label">User:</span>' + escapeHtml(msg.content);
            chatResult.appendChild(div);
        } else if (msg.role === 'assistant') {
            if (msg.tool_calls) {
                pendingAiDiv = document.createElement('div');
                pendingAiDiv.className = 'message ai-message';
                const label = document.createElement('span');
                label.className = 'message-label';
                label.textContent = 'AI:';
                pendingAiDiv.appendChild(label);

                msg.tool_calls.forEach(tc => {
                    var args = {};
                    try { args = JSON.parse(tc.function.arguments); } catch (e) {}
                    var el = createToolCallElement(tc.function.name, args);
                    el.classList.add('success');
                    pendingAiDiv.appendChild(el);
                });

                if (msg.content) {
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'response-text markdown-body';
                    renderMarkdown(msg.content, contentDiv);
                    pendingAiDiv.appendChild(contentDiv);
                    chatResult.appendChild(pendingAiDiv);
                    pendingAiDiv = null;
                }
            } else if (msg.content) {
                if (pendingAiDiv) {
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'response-text markdown-body';
                    renderMarkdown(msg.content, contentDiv);
                    pendingAiDiv.appendChild(contentDiv);
                    chatResult.appendChild(pendingAiDiv);
                    pendingAiDiv = null;
                } else {
                    const aiDiv = document.createElement('div');
                    aiDiv.className = 'message ai-message';
                    const label = document.createElement('span');
                    label.className = 'message-label';
                    label.textContent = 'AI:';
                    aiDiv.appendChild(label);
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'response-text markdown-body';
                    renderMarkdown(msg.content, contentDiv);
                    aiDiv.appendChild(contentDiv);
                    chatResult.appendChild(aiDiv);
                }
            }
        }
    });

    if (pendingAiDiv) {
        chatResult.appendChild(pendingAiDiv);
    }

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

// Tool helpers
var SYSTEM_PROMPT = 'You are a helpful assistant with access to tools. ' +
    'Use tools to gather information when needed. You can call multiple tools ' +
    'in sequence, building up your understanding step by step. After each tool ' +
    'result, decide if you need more information or can give a complete answer. ' +
    'When you have enough information, respond directly.';

function buildApiMessages(conv) {
    var msgs = [
        { role: 'system', content: SYSTEM_PROMPT }
    ];
    conv.messages.forEach(function (m) {
        if (m.role === 'user') {
            msgs.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
            var msg = { role: 'assistant' };
            if (m.content) msg.content = m.content;
            else msg.content = null;
            if (m.tool_calls) msg.tool_calls = m.tool_calls;
            msgs.push(msg);
        } else if (m.role === 'tool') {
            msgs.push({
                role: 'tool',
                tool_call_id: m.tool_call_id,
                content: m.content,
                name: m.name
            });
        }
    });
    return msgs;
}

async function callLlm(messages, tools) {
    var res = await fetch(LM_STUDIO_BASE + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            messages: messages,
            tools: tools,
            stream: false
        })
    });
    if (!res.ok) throw new Error('API error: ' + res.status);
    var data = await res.json();
    return data.choices[0].message;
}

function createToolCallElement(toolName, args) {
    var info = Tools.getInfo(toolName);
    var icon = (info && info.icon) || '?';

    var div = document.createElement('div');
    div.className = 'tool-call';

    var iconEl = document.createElement('span');
    iconEl.className = 'tool-call-icon';
    iconEl.textContent = icon;

    var nameEl = document.createElement('span');
    nameEl.className = 'tool-call-name';
    nameEl.textContent = toolName;

    var detailEl = document.createElement('span');
    detailEl.className = 'tool-call-detail';
    var query = (args && args.query) || '';
    if (query) detailEl.textContent = '\u201C' + query + '\u201D';

    div.appendChild(iconEl);
    div.appendChild(nameEl);
    div.appendChild(detailEl);

    return div;
}

function setToolStatus(el, status) {
    el.classList.remove('busy', 'success', 'error');
    el.classList.add(status);
}

function setToolDetail(el, text) {
    var detailEl = el.querySelector('.tool-call-detail');
    if (detailEl) detailEl.textContent = text;
}

function parseGemmaToolCalls(text) {
    if (!text || text.indexOf('<|tool_call|>') === -1) return null;
    var regex = /<\|tool_call\|>call:(\w+)(\{.*?\})<\|tool_call\|>/g;
    var toolCalls = [];
    var match;
    var lastIdx = 0;
    var clean = '';

    while ((match = regex.exec(text)) !== null) {
        clean += text.slice(lastIdx, match.index);
        lastIdx = regex.lastIndex;
        try {
            JSON.parse(match[2]);
            toolCalls.push({
                id: 'call_' + Date.now() + '_' + toolCalls.length,
                type: 'function',
                function: { name: match[1], arguments: match[2] }
            });
        } catch (e) {
            clean += match[0];
        }
    }

    if (toolCalls.length === 0) return null;
    clean += text.slice(lastIdx);
    return { content: clean || null, tool_calls: toolCalls };
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
    var message = input.value.trim();
    if (!message || !modelName || isStreaming) return;

    var conv = getCurrentConversation();
    if (!conv) {
        conv = createConversation();
        currentConversationId = conv.id;
        renderConversationList();
    }

    document.body.classList.add('sent');
    var greetingEl = document.getElementById('welcome-greeting');
    if (greetingEl) greetingEl.remove();

    var isFirstMessage = conv.messages.length === 0;
    conv.messages.push({ role: 'user', content: message });
    if (isFirstMessage) {
        conv.title = generateTitle(message);
    }
    conv.updatedAt = Date.now();
    saveConversations();

    var userDiv = document.createElement('div');
    userDiv.className = 'message user-message';
    userDiv.innerHTML = '<span class="message-label">User:</span>' + escapeHtml(message);
    chatResult.appendChild(userDiv);
    scrollToBottom();

    var aiDiv = document.createElement('div');
    aiDiv.className = 'message ai-message';

    var aiLabel = document.createElement('span');
    aiLabel.className = 'message-label';
    aiLabel.textContent = 'AI:';
    aiDiv.appendChild(aiLabel);

    var contentEl = document.createElement('div');
    contentEl.className = 'response-text markdown-body';

    var reasoningEl = null;

    chatResult.appendChild(aiDiv);
    input.value = '';
    input.focus();

    isStreaming = true;
    var hasStarted = false;
    var rawMarkdown = '';

    try {
        var toolSchemas = Tools.getSchemas();

        reasoningEl = document.createElement('span');
        reasoningEl.className = 'reasoning-text';
        reasoningEl.textContent = '*reasoning*';
        aiDiv.appendChild(reasoningEl);

        if (toolSchemas.length > 0) {
            var toolHistory = [];
            var msgs = buildApiMessages(conv);
            var result = await callLlm(msgs, toolSchemas);
            if (!result.tool_calls) {
                var gemmaParsed = parseGemmaToolCalls(result.content);
                if (gemmaParsed) result = gemmaParsed;
            }

            while (result.tool_calls && result.tool_calls.length > 0) {
                var callSig = JSON.stringify(result.tool_calls.map(function (tc) {
                    return tc.function.name + '|' + tc.function.arguments;
                }));
                if (toolHistory.indexOf(callSig) !== -1) break;
                toolHistory.push(callSig);

                conv.messages.push({
                    role: 'assistant',
                    content: result.content || null,
                    tool_calls: result.tool_calls.map(function (tc) {
                        return {
                            id: tc.id,
                            type: tc.type,
                            function: tc.function
                        };
                    })
                });

                for (var tci = 0; tci < result.tool_calls.length; tci++) {
                    var tc = result.tool_calls[tci];
                    var fn = tc.function;
                    var args;
                    try { args = JSON.parse(fn.arguments); } catch (e) { args = {}; }

                    var toolEl = createToolCallElement(fn.name, args);
                    aiDiv.appendChild(toolEl);
                    scrollToBottom();

                    try {
                        setToolStatus(toolEl, 'busy');
                        var toolResult = await Tools.execute(fn.name, args);
                        setToolStatus(toolEl, 'success');
                        var preview = toolResult.split('\n')[0];
                        if (preview.length > 60) preview = preview.slice(0, 60) + '...';
                        setToolDetail(toolEl, preview);

                        conv.messages.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: toolResult,
                            name: fn.name
                        });
                    } catch (err) {
                        setToolStatus(toolEl, 'error');
                        setToolDetail(toolEl, 'Error: ' + err.message);

                        conv.messages.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: 'Error: ' + err.message,
                            name: fn.name
                        });
                    }
                }

                saveConversations();
                renderConversationList();

                msgs = buildApiMessages(conv);
                result = await callLlm(msgs, toolSchemas);
                if (!result.tool_calls) {
                    var gemmaParsed2 = parseGemmaToolCalls(result.content);
                    if (gemmaParsed2) result = gemmaParsed2;
                }
            }
        }

        // Stream the final answer (tool path uses full history, non-tool path uses single message)
        var streamMessages;
        if (toolSchemas.length > 0) {
            streamMessages = buildApiMessages(conv);
        } else {
            streamMessages = [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: message }
            ];
        }

        var response = await fetch(LM_STUDIO_BASE + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                messages: streamMessages,
                stream: true
            })
        });

        if (!response.ok) {
            reasoningEl.classList.add('fading');
            setTimeout(function () {
                reasoningEl.remove();
                contentEl.textContent = 'Error: ' + response.status + ' ' + response.statusText;
                aiDiv.appendChild(contentEl);
                scrollToBottom();
            }, 400);
            isStreaming = false;
            return;
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        while (true) {
            var readResult = await reader.read();
            if (readResult.done) break;

            buffer += decoder.decode(readResult.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop();

            for (var li = 0; li < lines.length; li++) {
                var line = lines[li];
                if (!line.startsWith('data: ')) continue;
                var data = line.slice(6);
                if (data === '[DONE]') break;

                try {
                    var json = JSON.parse(data);
                    var content = json.choices?.[0]?.delta?.content || '';

                    if (!hasStarted && content) {
                        hasStarted = true;
                        reasoningEl.classList.add('fading');
                        setTimeout(function () {
                            reasoningEl.remove();
                            aiDiv.appendChild(contentEl);
                            scrollToBottom();
                        }, 400);
                    }

                    if (hasStarted) {
                        rawMarkdown += content;
                        renderMarkdown(rawMarkdown, contentEl);
                    }
                } catch (e) { }
            }
        }

        if (!hasStarted) {
            reasoningEl.classList.add('fading');
            setTimeout(function () { reasoningEl.remove(); }, 400);
        }
    } catch (err) {
        contentEl.textContent = 'Error: ' + err.message;
        if (contentEl.parentNode !== aiDiv) aiDiv.appendChild(contentEl);
        if (reasoningEl) reasoningEl.remove();
        scrollToBottom();
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
