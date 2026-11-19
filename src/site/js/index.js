const RETRY_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2l4 4-4 4"/><path d="M18 6H5a3 3 0 00-3 3v1"/><path d="M6 18l-4-4 4-4"/><path d="M2 14h13a3 3 0 003-3v-1"/></svg>';
const TRASH_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 5h15"/><path d="M4 5v10a2 2 0 002 2h8a2 2 0 002-2V5"/><path d="M7 5V3.5a1 1 0 011-1h4a1 1 0 011 1V5"/><path d="M8 8.5v5"/><path d="M12 8.5v5"/></svg>';
const CONFIRM_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

const LM_STUDIO_BASE = "http://localhost:1234";
const input = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const chatResult = document.getElementById("chat-result");

let modelName = "";

// Conversation state
const CONVERSATIONS_KEY = "ai-central-conversations";
let conversations = [];
let currentConversationId = null;
let isStreaming = false;

// Sidebar elements
const sidebar = document.getElementById("sidebar");
const sidebarTrigger = document.getElementById("sidebar-trigger");
const conversationListEl = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
let sidebarTimeout = null;

// Sidebar hover logic
sidebarTrigger.addEventListener("mouseenter", () => openSidebar());
sidebar.addEventListener("mouseenter", () => {
  clearTimeout(sidebarTimeout);
  openSidebar();
});
sidebar.addEventListener("mouseleave", () => {
  sidebarTimeout = setTimeout(() => closeSidebar(), 200);
});

function openSidebar() {
  clearTimeout(sidebarTimeout);
  sidebar.classList.add("expanded");
  document.body.classList.add("sidebar-open");
}

function closeSidebar() {
  sidebar.classList.remove("expanded");
  document.body.classList.remove("sidebar-open");
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
  if (words.length === 0 || words[0] === "") return "New conversation";
  const title = words.slice(0, 4).join(" ");
  return words.length > 4 ? title + "\u2026" : title;
}

function createConversation() {
  const conv = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: "New conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  conversations.unshift(conv);
  saveConversations();
  return conv;
}

function getCurrentConversation() {
  return conversations.find((c) => c.id === currentConversationId);
}

function switchConversation(id) {
  if (isStreaming) return;
  currentConversationId = id;
  renderConversationList();
  renderMessages();
  const conv = getCurrentConversation();
  if (conv && conv.messages.length > 0) {
    document.body.classList.add("sent");
  } else {
    document.body.classList.remove("sent");
    updateGreeting();
  }
  input.focus();
}

function renderConversationList() {
  conversationListEl.innerHTML = "";
  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = "conversation-item";
    if (conv.id === currentConversationId) {
      item.classList.add("active");
    }

    const titleSpan = document.createElement("span");
    titleSpan.className = "conv-title";
    titleSpan.textContent = conv.title;
    item.appendChild(titleSpan);

    const del = document.createElement("button");
    del.className = "conv-delete";
    del.innerHTML = TRASH_ICON;
    del.title = "Delete conversation";

    let clickCount = 0;
    let resetTimer = null;

    del.addEventListener("click", (e) => {
      e.stopPropagation();
      if (clickCount === 0) {
        clickCount = 1;
        del.classList.add("confirming");
        del.innerHTML = CONFIRM_ICON;
        resetTimer = setTimeout(() => {
          clickCount = 0;
          del.classList.remove("confirming");
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

    item.addEventListener("mouseleave", () => {
      if (clickCount === 1) {
        clickCount = 0;
        if (resetTimer !== null) {
          clearTimeout(resetTimer);
          resetTimer = null;
        }
        del.classList.remove("confirming");
        del.innerHTML = TRASH_ICON;
      }
    });

    item.addEventListener("click", () => switchConversation(conv.id));
    item.appendChild(del);
    conversationListEl.appendChild(item);
  });
}

async function updateGreeting() {
  const el = document.getElementById("welcome-greeting");
  if (!el) return;
  const textEl = el.querySelector(".greeting-text");
  if (textEl) {
    textEl.textContent = await window.getGreeting();
  }
}

function renderMessages() {
  chatResult.innerHTML = "";
  const conv = getCurrentConversation();
  if (!conv) return;

  if (conv.messages.length === 0) {
    const wrapper = document.createElement("div");
    wrapper.className = "welcome-greeting";
    wrapper.id = "welcome-greeting";
    wrapper.innerHTML =
      '<div class="greeting-text">\u200B</div><div class="greeting-sub">AI Central</div>';
    chatResult.appendChild(wrapper);
    return;
  }

  var pendingAiDiv = null;

  conv.messages.forEach((msg) => {
    if (msg.role === "user") {
      pendingAiDiv = null;
      const div = document.createElement("div");
      div.className = "message user-message";
      div.innerHTML =
        '<span class="message-label">User:</span>' + escapeHtml(msg.content);
      chatResult.appendChild(div);
    } else if (msg.role === "assistant") {
      if (msg.tool_calls) {
        pendingAiDiv = document.createElement("div");
        pendingAiDiv.className = "message ai-message";
        const label = document.createElement("span");
        label.className = "message-label";
        label.textContent = "AI:";
        pendingAiDiv.appendChild(label);

        msg.tool_calls.forEach((tc) => {
          var args = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch (e) { }
          var el = createToolCallElement(tc.function.name, args);
          el.classList.add("success");
          pendingAiDiv.appendChild(el);
        });

        if (msg.content) {
          const contentDiv = document.createElement("div");
          contentDiv.className = "response-text markdown-body";
          renderMarkdown(msg.content, contentDiv);
          pendingAiDiv.appendChild(contentDiv);
          chatResult.appendChild(pendingAiDiv);
          addMessageFooter(pendingAiDiv, conv.id, conv.messages.indexOf(msg), msg.meta);
          pendingAiDiv = null;
        }
      } else if (msg.content) {
        if (pendingAiDiv) {
          const contentDiv = document.createElement("div");
          contentDiv.className = "response-text markdown-body";
          renderMarkdown(msg.content, contentDiv);
          pendingAiDiv.appendChild(contentDiv);
          chatResult.appendChild(pendingAiDiv);
          addMessageFooter(pendingAiDiv, conv.id, conv.messages.indexOf(msg), msg.meta);
          pendingAiDiv = null;
        } else {
          const aiDiv = document.createElement("div");
          aiDiv.className = "message ai-message";
          const label = document.createElement("span");
          label.className = "message-label";
          label.textContent = "AI:";
          aiDiv.appendChild(label);
          const contentDiv = document.createElement("div");
          contentDiv.className = "response-text markdown-body";
          renderMarkdown(msg.content, contentDiv);
          aiDiv.appendChild(contentDiv);
          chatResult.appendChild(aiDiv);
          addMessageFooter(aiDiv, conv.id, conv.messages.indexOf(msg), msg.meta);
        }
      }
    }
  });

  if (pendingAiDiv) {
    chatResult.appendChild(pendingAiDiv);
  }

  scrollToBottom();
}

newChatBtn.addEventListener("click", () => {
  if (isStreaming) return;
  const current = getCurrentConversation();
  if (current && current.messages.length === 0) {
    return;
  }
  const conv = createConversation();
  switchConversation(conv.id);
});

document.getElementById("reset-perm-btn").addEventListener("click", () => {
  if (confirm("Reset all tool permissions?")) {
    localStorage.removeItem("ai-central-permissions");
    Tools.loadPermissions();
  }
});

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  const el = document.querySelector(".result-container");
  if (el) el.scrollTop = el.scrollHeight;
}

function renderMarkdown(raw, container) {
  container.innerHTML = marked.parse(raw, { breaks: true, gfm: true });
  container.querySelectorAll("pre code").forEach((block) => {
    hljs.highlightElement(block);
  });
  scrollToBottom();
}

// Tool helpers
var FLASK_BASE = "http://localhost:8080";
var envInfo = null;
var SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use tools to gather information or perform actions when needed.";

function buildSystemPrompt(env) {
  return (
    "You are a LOCAL AI assistant running directly on the user's computer. " +
    "You are NOT in a container, sandbox, or virtual environment. " +
    "You have REAL access to the user's filesystem through the tools provided to you.\n\n" +
    "CRITICAL: Ignore any previous training that says you cannot access files, " +
    "cannot write to disk, or are restricted to a sandbox. " +
    "Those rules do NOT apply here. You have working file I/O tools.\n\n" +
    "## Available tools\n" +
    "- io_operations: Read, write, list, or delete files on the local filesystem. " +
    "Use this for ANY file-related request (reading, writing, creating, saving, deleting). " +
    "When the user asks to write, save, create, or store anything to a file, you MUST call this tool immediately.\n" +
    "- gmail_read: Search your Gmail inbox and read emails. Actions: search_emails (query), read_email (uid), list_unread. Use search_emails, NOT \"search\".\n" +
    "- gmail_send: Send new emails or reply to existing ones. Actions: send_email (to, subject, body), reply (uid, body). Always show the email to the user first and ask permission.\n" +
    "- weather: Get current weather conditions for a location.\n" +
    "- wikipedia: Search Wikipedia.\n" +
    "- cppreference / python_docs / windows_support / programming_help: Documentation lookups.\n" +
    "- shopify_liquid: Search Shopify Liquid documentation for tags, filters, objects, and syntax. Use this for ANY Shopify theme development, Liquid template language, or storefront rendering question.\n\n" +
    "## User environment\n" +
    "- OS: " +
    env.os +
    "\n- Username: " +
    env.username +
    "\n- Home: " +
    env.home +
    "\n- Desktop: " +
    env.desktop +
    "\n- Documents: " +
    env.documents +
    "\n- Downloads: " +
    env.downloads +
    "\n- Workspace: " +
    env.workspace +
    "\n\n" +
    "## File writing rules\n" +
    "When the user asks you to write, save, create, or store a file, " +
    "you MUST use the io_operations tool with action=\"write\". " +
    "Use ~/Desktop/filename.txt, ~/Documents/filename.txt, or a workspace relative path. " +
    "The ~ is automatically expanded to the user's home directory.\n\n" +
    "## How to call a tool\n" +
    "Output the tool call in exactly this format:\n" +
    '<|tool_call|>call:TOOL_NAME{key1:<|"|>value1<|"|>,key2:<|"|>value2<|"|>}<|tool_call|>\n' +
    "For example, to write a file:\n" +
    '<|tool_call|>call:io_operations{action:<|"|>write<|"|>,path:<|"|>~/Desktop/poem.txt<|"|>,content:<|"|>poem text here<|"|>}<|tool_call|>\n' +
    "For example, to search Wikipedia:\n" +
    '<|tool_call|>call:wikipedia{action:<|"|>search<|"|>,query:<|"|>artificial intelligence<|"|>}<|tool_call|>\n' +
    "For example, to read a Wikipedia article:\n" +
    '<|tool_call|>call:wikipedia{action:<|"|>summary<|"|>,query:<|"|>Python (programming language)<|"|>}<|tool_call|>\n' +
    "The system will parse this and execute the tool, then return the result to you.\n\n" +
    "After each tool result, decide if you need more information or can give a complete answer. " +
    "When you have enough information, respond directly.\n\n" +
    "## Email rules\n" +
    "When the user asks to reply to an email or mentions a subject from an email, " +
    "IMMEDIATELY use gmail_read to search for and read that email. Do NOT ask the user for details you can find in the email itself.\n" +
    "After reading the email, immediately write a draft response. " +
    "If the user says to send it (e.g. \"stuur gelijk\", \"send it now\"), use gmail_send right away, do NOT ask again.\n" +
    "If the user did NOT say to send it, show the draft first and ask if they want to send it. " +
    "The system will ask for permission before sending.\n" +
    "Write emails in simple, everyday language. Do not use complex words, em dashes (-- or —), " +
    "fancy vocabulary, or formal business language. Write like a normal person would talk. " +
    "Keep sentences short and clear.\n" +
    "Do NOT use any markdown or formatting in the email body. No bold (**), no italic (*), " +
    "no headings, no bullet points, no code blocks. Write plain text only.\n" +
    "For example, instead of 'I am writing to inquire about...' use 'Can you tell me more about...'"
  );
}

function getSystemPrompt() {
  return envInfo ? buildSystemPrompt(envInfo) : SYSTEM_PROMPT;
}

function buildApiMessages(conv) {
  var msgs = [{ role: "system", content: getSystemPrompt() }];
  conv.messages.forEach(function (m) {
    if (m.role === "user") {
      msgs.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      var msg = { role: "assistant" };
      if (m.content) msg.content = m.content;
      else msg.content = null;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      msgs.push(msg);
    } else if (m.role === "tool") {
      msgs.push({
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content,
        name: m.name,
      });
    }
  });
  return msgs;
}

async function callLlm(messages, tools) {
  var res = await fetch(LM_STUDIO_BASE + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      tools: tools,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error("API error: " + res.status);
  var data = await res.json();
  return data.choices[0].message;
}

function createToolCallElement(toolName, args) {
  var info = Tools.getInfo(toolName);
  var icon = (info && info.icon) || "?";

  var div = document.createElement("div");
  div.className = "tool-call";

  var iconEl = document.createElement("span");
  iconEl.className = "tool-call-icon";
  iconEl.textContent = icon;

  var nameEl = document.createElement("span");
  nameEl.className = "tool-call-name";
  nameEl.textContent = toolName;

  var detailEl = document.createElement("span");
  detailEl.className = "tool-call-detail";
  var query = (args && args.query) || "";
  if (query) detailEl.textContent = "\u201C" + query + "\u201D";

  div.appendChild(iconEl);
  div.appendChild(nameEl);
  div.appendChild(detailEl);

  return div;
}

function setToolStatus(el, status) {
  el.classList.remove("busy", "success", "error");
  el.classList.add(status);
}

function setToolDetail(el, text) {
  var detailEl = el.querySelector(".tool-call-detail");
  if (detailEl) detailEl.textContent = text;
}

function toolDetailFromArgs(toolName, args) {
  if (toolName === "gmail" && args.action) {
    var labels = {
      search_emails: "\u201C" + (args.query || "") + "\u201D",
      read_email: "read email",
      list_unread: "unread",
    };
    return labels[args.action] || args.action;
  }
  var preview = (args && args.query) || "";
  if (preview.length > 60) preview = preview.slice(0, 60) + "...";
  return preview;
}

function parseGemmaToolCalls(text) {
  if (!text) return null;
  if (
    text.indexOf("<|tool_call|>") === -1 &&
    text.indexOf("<|tool_call>") === -1
  )
    return null;
  // Find opening tags: <|tool_call|>call:name  OR  <|tool_call>call:name
  var openRe = /<\|?tool_call\|?>call:(\w+)\{/g;
  var toolCalls = [];
  var clean = "";
  var lastIdx = 0;
  var match;

  while ((match = openRe.exec(text)) !== null) {
    clean += text.slice(lastIdx, match.index);
    var name = match[1];
    var argStart = match.index + match[0].length; // position after '{'

    // Find matching closing brace (handles nested braces)
    var depth = 1;
    var i = argStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    if (depth !== 0) {
      // Unmatched brace — skip
      clean += match[0];
      lastIdx = match.index + match[0].length;
      continue;
    }
    // i is now one past the matching '}'
    var closeIdx = i - 1;

    // Make sure the closing tag follows the closing brace
    var rest = text.slice(closeIdx + 1);
    var closeMatch = rest.match(/^<\|?tool_call\|?>/);
    if (!closeMatch) {
      // No closing tag — skip
      clean += match[0];
      lastIdx = match.index + match[0].length;
      continue;
    }

    // Advance lastIdx past the closing tag
    lastIdx = closeIdx + 1 + closeMatch[0].length;

    // Extract and parse the JSON arguments
    var argsRaw = text.slice(argStart, closeIdx);
    try {
      var argsStr = "{" + argsRaw.replace(/<\|"\|>/g, '"') + "}";
      argsStr = argsStr.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
      JSON.parse(argsStr);
      toolCalls.push({
        id: "call_" + Date.now() + "_" + toolCalls.length,
        type: "function",
        function: { name: name, arguments: argsStr },
      });
    } catch (e) {
      clean += match[0] + argsRaw + "}";
    }
  }

  if (toolCalls.length === 0) return null;
  clean += text.slice(lastIdx);
  return { content: clean || null, tool_calls: toolCalls };
}

function addMessageFooter(aiDiv, convId, msgIndex, meta) {
  var footer = document.createElement("div");
  footer.className = "message-footer";

  var retryBtn = document.createElement("button");
  retryBtn.className = "retry-btn";
  retryBtn.innerHTML = RETRY_ICON;
  retryBtn.title = "Retry this response";
  retryBtn.addEventListener("click", function () {
    handleRetry(convId, msgIndex);
  });
  footer.appendChild(retryBtn);

  if (meta) {
    if (meta.totalTokens && meta.streamingMs) {
      var tkPerSec = (meta.totalTokens / (meta.streamingMs / 1000)).toFixed(1);
      var tkpsSpan = document.createElement("span");
      tkpsSpan.className = "tkps-display";
      tkpsSpan.textContent = tkPerSec + " Tk/s";
      footer.appendChild(tkpsSpan);
    }

    if (meta.reasoningMs != null) {
      var reasoningTime = (meta.reasoningMs / 1000).toFixed(1);
      var reasoningSpan = document.createElement("span");
      reasoningSpan.className = "reasoning-display";
      reasoningSpan.textContent = "Reasoning: " + reasoningTime + "s";
      footer.appendChild(reasoningSpan);
    }
  }

  aiDiv.appendChild(footer);
}

function handleRetry(convId, msgIndex) {
  if (isStreaming) return;

  var conv = conversations.find(function (c) {
    return c.id === convId;
  });
  if (!conv) return;

  var userMsgIndex = -1;
  for (var i = msgIndex; i >= 0; i--) {
    if (conv.messages[i].role === "user") {
      userMsgIndex = i;
      break;
    }
  }
  if (userMsgIndex === -1) return;

  var userContent = conv.messages[userMsgIndex].content;

  conv.messages.splice(userMsgIndex);
  conv.updatedAt = Date.now();
  saveConversations();

  currentConversationId = conv.id;
  renderConversationList();

  var msgEls = chatResult.querySelectorAll(".message");
  for (var i = userMsgIndex; i < msgEls.length; i++) {
    if (msgEls[i] && msgEls[i].parentNode) {
      msgEls[i].remove();
    }
  }

  if (conv.messages.length === 0) {
    var wrapper = document.createElement("div");
    wrapper.className = "welcome-greeting";
    wrapper.id = "welcome-greeting";
    wrapper.innerHTML =
      '<div class="greeting-text">\u200B</div><div class="greeting-sub">AI Central</div>';
    chatResult.appendChild(wrapper);
  }

  input.value = userContent;
  sendMessage();
}

async function init() {
  Tools.loadPermissions();
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
    document.body.classList.add("sent");
  } else {
    document.body.classList.remove("sent");
    updateGreeting();
  }

  let url = `${LM_STUDIO_BASE}/v1/models`;

  try {
    const res = await fetch(url, { mode: 'cors' });

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      if (jsonErr instanceof SyntaxError) {
        alert('Bad news, the JSON from the API is not valid. Check your console window for more information! (F12)');
        console.error(
          `
          Failed to retrieve JSON from the LM Studio server, if you have a server set up correctly then this is really bad.
          This error only appears when it can reach the API as a request, but not load up the models. Check your installation of LM Studio before creating an issue!

          Info:
          LM Studio *BASE* address: ${LM_STUDIO_BASE}

          Error dump:
          ${jsonErr}
          `
        );
        sendBtn.disabled = true;
        return;
      }
      throw jsonErr;
    }

    let modelName = data.data?.[0]?.id;
    const moreThanOneModel = (data.data?.length ?? 0) > 1;
    console.log(data);
    if (!modelName) {
      alert("No model loaded in LM Studio");
      console.warn("No model loaded in LM Studio");
      sendBtn.disabled = true;
    } else if (moreThanOneModel) {
      let msg = "Please disable 'Just-in-Time Model Loading' in your LM Studio API, otherwise we can't check if a model is loaded in or auto-select the wrong one."
      alert(msg);
      console.warn(msg);
    }

  } catch (err) {
    sendBtn.disabled = true;

    if (err instanceof TypeError) {
      try {
        await fetch(url, { mode: 'no-cors' });
        alert("CORS error: Enable CORS in LM Studio's Local Server settings. Check the console (F12) for details.");
      } catch {
        alert("Cannot connect to LM Studio. Make sure the local server is running. Check the console (F12) for details.");
      }
    } else {
      console.error("Unexpected error:", err);
      alert("Unexpected error, check the console (F12) for details.");
    }
  }

  try {
    const envRes = await fetch(FLASK_BASE + "/environment");
    envInfo = await envRes.json();
  } catch {}

  // Check Gmail unlock status
  try {
    const gmailRes = await fetch(FLASK_BASE + "/api/gmail/status");
    const gmailData = await gmailRes.json();
    if (gmailData.connected && gmailData.locked) {
      showUnlockModal();
    }
  } catch {}
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {
  var message = input.value.trim();
  if (!message || !modelName || isStreaming) return;

  var conv = getCurrentConversation();
  if (!conv) {
    conv = createConversation();
    currentConversationId = conv.id;
    renderConversationList();
  }

  document.body.classList.add("sent");
  var greetingEl = document.getElementById("welcome-greeting");
  if (greetingEl) greetingEl.remove();

  var isFirstMessage = conv.messages.length === 0;
  conv.messages.push({ role: "user", content: message });
  if (isFirstMessage) {
    conv.title = generateTitle(message);
  }
  conv.updatedAt = Date.now();
  saveConversations();

  var userDiv = document.createElement("div");
  userDiv.className = "message user-message";
  userDiv.innerHTML =
    '<span class="message-label">User:</span>' + escapeHtml(message);
  chatResult.appendChild(userDiv);
  scrollToBottom();

  var aiDiv = document.createElement("div");
  aiDiv.className = "message ai-message";

  var aiLabel = document.createElement("span");
  aiLabel.className = "message-label";
  aiLabel.textContent = "AI:";
  aiDiv.appendChild(aiLabel);

  var contentEl = document.createElement("div");
  contentEl.className = "response-text markdown-body";

  var reasoningEl = null;

  chatResult.appendChild(aiDiv);
  input.value = "";
  input.focus();

  isStreaming = true;
  var hasStarted = false;
  var rawMarkdown = "";
  var streamStartTime = performance.now();
  var firstTokenTime = null;
  var streamEndTime = null;
  var totalTokens = 0;
  var tokenUsageSource = "estimated";

  try {
    var toolSchemas = Tools.getSchemas();

    reasoningEl = document.createElement("span");
    reasoningEl.className = "reasoning-text";
    reasoningEl.textContent = "*reasoning*";
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
        var callSig = JSON.stringify(
          result.tool_calls.map(function (tc) {
            return tc.function.name + "|" + tc.function.arguments;
          }),
        );
        if (toolHistory.indexOf(callSig) !== -1) break;
        toolHistory.push(callSig);

        conv.messages.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.tool_calls.map(function (tc) {
            return {
              id: tc.id,
              type: tc.type,
              function: tc.function,
            };
          }),
        });

        for (var tci = 0; tci < result.tool_calls.length; tci++) {
          var tc = result.tool_calls[tci];
          var fn = tc.function;
          var args;
          try {
            args = JSON.parse(fn.arguments);
          } catch (e) {
            args = {};
          }

          var toolEl = createToolCallElement(fn.name, args);
          aiDiv.appendChild(toolEl);
          scrollToBottom();

          try {
            setToolStatus(toolEl, "busy");
            var toolResult = await Tools.execute(fn.name, args);
            setToolStatus(toolEl, "success");
            var detail = toolDetailFromArgs(fn.name, args);
            setToolDetail(toolEl, detail);

            conv.messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: toolResult,
              name: fn.name,
            });
          } catch (err) {
            setToolStatus(toolEl, "error");
            setToolDetail(toolEl, "Error: " + err.message);

            conv.messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: "Error: " + err.message,
              name: fn.name,
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

    // Save pre-call response as fallback if streaming produces nothing
    var precallContent = (toolSchemas.length > 0 && result && !result.tool_calls && result.content) ? result.content : null;

    // Stream the final answer (tool path uses full history, non-tool path uses single message)
    var streamMessages;
    if (toolSchemas.length > 0) {
      streamMessages = buildApiMessages(conv);
    } else {
      streamMessages = [
        { role: "system", content: getSystemPrompt() },
        { role: "user", content: message },
      ];
    }

    var response = await fetch(LM_STUDIO_BASE + "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: streamMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      reasoningEl.classList.add("fading");
      setTimeout(function () {
        reasoningEl.remove();
        contentEl.textContent =
          "Error: " + response.status + " " + response.statusText;
        var firstTool = aiDiv.querySelector(".tool-call");
        if (firstTool) {
          aiDiv.insertBefore(contentEl, firstTool);
        } else {
          aiDiv.appendChild(contentEl);
        }
        scrollToBottom();
      }, 400);
      isStreaming = false;
      return;
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;

      buffer += decoder.decode(readResult.value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop();

      for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        if (!line.startsWith("data: ")) continue;
        var data = line.slice(6);
        if (data === "[DONE]") break;

        try {
          var json = JSON.parse(data);
          var content = json.choices?.[0]?.delta?.content || "";

          if (json.usage && json.usage.completion_tokens) {
            totalTokens = json.usage.completion_tokens;
            tokenUsageSource = "actual";
          }

          if (!hasStarted && content) {
            hasStarted = true;
            firstTokenTime = performance.now();
            aiDiv.appendChild(contentEl);
            reasoningEl.classList.add("fading");
            setTimeout(function () {
              reasoningEl.remove();
              scrollToBottom();
            }, 400);
          }

          if (hasStarted) {
            rawMarkdown += content;
            var displayText = rawMarkdown.replace(/<\|?tool_call\|?>[\s\S]*?<\|?tool_call\|?>/g, '');
            if (content || displayText) {
              renderMarkdown(displayText, contentEl);
            }
          }
        } catch (e) { }
      }
    }

    if (tokenUsageSource === "estimated" && hasStarted && rawMarkdown) {
      totalTokens = Math.round(rawMarkdown.length / 4);
    }

    if (!hasStarted) {
      reasoningEl.classList.add("fading");
      setTimeout(function () {
        reasoningEl.remove();
      }, 400);
    }
  } catch (err) {
    contentEl.textContent = "Error: " + err.message;
    if (contentEl.parentNode !== aiDiv) aiDiv.appendChild(contentEl);
    if (reasoningEl) reasoningEl.remove();
    scrollToBottom();
  }

  if (hasStarted && rawMarkdown) {
    streamEndTime = performance.now();
    var meta = {
      totalTokens: totalTokens,
      tokenUsageSource: tokenUsageSource,
      reasoningMs: Math.round(firstTokenTime - streamStartTime),
      streamingMs: Math.round(streamEndTime - firstTokenTime),
    };
    // Strip tool call tags from saved content
    var cleanContent = rawMarkdown.replace(/<\|?tool_call\|?>[\s\S]*?<\|?tool_call\|?>/g, '').trim();
    if (cleanContent) {
      conv.messages.push({ role: "assistant", content: cleanContent, meta: meta });
      conv.updatedAt = Date.now();
      saveConversations();
      renderConversationList();
      addMessageFooter(aiDiv, conv.id, conv.messages.length - 1, meta);
    }
  }

  // Fallback: if streaming produced only tool calls, use pre-call response
  if (precallContent && (!hasStarted || (hasStarted && rawMarkdown && !rawMarkdown.replace(/<\|?tool_call\|?>[\s\S]*?<\|?tool_call\|?>/g, '').trim()))) {
    precallContent = precallContent.replace(/<\|?tool_call\|?>[\s\S]*?<\|?tool_call\|?>/g, '').trim();
    if (precallContent) {
      reasoningEl.classList.add("fading");
      setTimeout(function () {
        reasoningEl.remove();
        aiDiv.appendChild(contentEl);
        renderMarkdown(precallContent, contentEl);
        scrollToBottom();
        if (!hasStarted) {
          conv.messages.push({ role: "assistant", content: precallContent });
        }
        conv.updatedAt = Date.now();
        saveConversations();
        renderConversationList();
        addMessageFooter(aiDiv, conv.id, conv.messages.length - 1, {});
      }, 400);
      hasStarted = true;
    }
  }

  isStreaming = false;
}

// ── Gmail / Settings ─────────────────────────────────────────────────────────

function openModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.add("active");
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("active");
}

function refreshGmailStatus() {
  var statusEl = document.getElementById("gmail-status");
  var actionBtn = document.getElementById("gmail-action-btn");
  if (!statusEl || !actionBtn) return;

  statusEl.textContent = "Loading...";
  actionBtn.disabled = true;
  actionBtn.textContent = "..."

  fetch(FLASK_BASE + "/api/gmail/status")
    .then(function (r) {
      if (!r.ok) throw new Error("Status fetch failed");
      return r.json();
    })
    .then(function (data) {
      actionBtn.disabled = false;
      if (!data.connected) {
        statusEl.textContent = "Not connected";
        actionBtn.textContent = "Connect";
        actionBtn.className = "service-btn";
        actionBtn.onclick = function () { openModal("connect-modal"); };
      } else if (data.locked) {
        statusEl.textContent = "Locked";
        actionBtn.textContent = "Unlock";
        actionBtn.className = "service-btn";
        actionBtn.onclick = function () { openModal("unlock-modal"); };
      } else {
        statusEl.textContent = data.email ? "Connected as " + data.email : "Connected";
        actionBtn.textContent = "Disconnect";
        actionBtn.className = "service-btn connected";
        actionBtn.onclick = function () {
          if (confirm("Disconnect Gmail? This will remove your saved credentials.")) {
            actionBtn.disabled = true;
            actionBtn.textContent = "...";
            fetch(FLASK_BASE + "/api/gmail/disconnect", { method: "POST" })
              .then(function () { refreshGmailStatus(); })
              .catch(function () { actionBtn.disabled = false; actionBtn.textContent = "Disconnect"; });
          }
        };
      }
    })
    .catch(function () {
      statusEl.textContent = "Not connected";
      actionBtn.disabled = false;
      actionBtn.textContent = "Connect";
      actionBtn.className = "service-btn";
      actionBtn.onclick = function () { closeModal("settings-modal"); openModal("connect-modal"); };
    });
}

// Settings modal
document.getElementById("settings-btn").addEventListener("click", function () {
  refreshGmailStatus();
  openModal("settings-modal");
});

document.getElementById("settings-close-btn").addEventListener("click", function () {
  closeModal("settings-modal");
});

document.getElementById("settings-modal").addEventListener("click", function (e) {
  if (e.target === this) closeModal("settings-modal");
});

// Settings tabs
document.querySelectorAll(".settings-tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    document.querySelectorAll(".settings-tab").forEach(function (t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-content").forEach(function (c) { c.classList.remove("active"); });
    this.classList.add("active");
    var target = document.getElementById("tab-" + this.getAttribute("data-tab"));
    if (target) {
      target.classList.add("active");
      if (target.id === "tab-permissions") {
        renderPermissionsList();
      }
    }
  });
});

function renderPermissionsList() {
  var listEl = document.getElementById("perm-list");
  if (!listEl) return;

  var tools = Tools.listTools();
  if (tools.length === 0) {
    listEl.innerHTML = '<div class="perm-list-empty">No tools registered.</div>';
    return;
  }

  listEl.innerHTML = "";
  tools.forEach(function (tool) {
    var perm = Tools.getPermission(tool.name);

    var item = document.createElement("div");
    item.className = "perm-item";
    item.setAttribute("data-tool", tool.name);

    var left = document.createElement("div");
    left.className = "perm-item-left";

    var icon = document.createElement("span");
    icon.className = "perm-item-icon";
    icon.textContent = tool.icon;

    var nameEl = document.createElement("span");
    nameEl.className = "perm-item-name";
    nameEl.textContent = tool.displayName;

    var infoEl = document.createElement("span");
    infoEl.className = "perm-item-info";
    infoEl.textContent = "\u24D8";
    if (tool.description) {
      infoEl.setAttribute("data-tip", tool.description);
    }

    left.appendChild(icon);
    left.appendChild(nameEl);
    left.appendChild(infoEl);

    var actions = document.createElement("div");
    actions.className = "perm-item-actions";

    var askBtn = document.createElement("button");
    askBtn.className = "perm-toggle-btn" + (perm === "ask" ? " active-ask" : "");
    askBtn.textContent = "Ask";
    askBtn.addEventListener("click", function () {
      Tools.setPermission(tool.name, "ask");
      renderPermissionsList();
    });

    var allowBtn = document.createElement("button");
    allowBtn.className = "perm-toggle-btn" + (perm === "always" ? " active-allow" : "");
    allowBtn.textContent = "Allow";
    allowBtn.addEventListener("click", function () {
      Tools.setPermission(tool.name, "always");
      renderPermissionsList();
    });

    var denyBtn = document.createElement("button");
    denyBtn.className = "perm-toggle-btn" + (perm === "never" ? " active-deny" : "");
    denyBtn.textContent = "Deny";
    denyBtn.addEventListener("click", function () {
      Tools.setPermission(tool.name, "never");
      renderPermissionsList();
    });

    actions.appendChild(askBtn);
    actions.appendChild(allowBtn);
    actions.appendChild(denyBtn);

    item.appendChild(left);
    item.appendChild(actions);
    listEl.appendChild(item);
  });
}

// Unlock modal
function showUnlockModal() {
  var err = document.getElementById("unlock-error");
  err.classList.remove("visible");
  err.textContent = "";
  document.getElementById("unlock-password").value = "";
  document.getElementById("unlock-password").classList.remove("error");
  openModal("unlock-modal");
  document.getElementById("unlock-password").focus();
}

document.getElementById("unlock-submit-btn").addEventListener("click", function () {
  var pwEl = document.getElementById("unlock-password");
  var err = document.getElementById("unlock-error");
  err.classList.remove("visible");
  pwEl.classList.remove("error");
  var pw = pwEl.value.trim();
  if (!pw) {
    err.textContent = "Please enter your master password.";
    err.classList.add("visible");
    pwEl.classList.add("error");
    return;
  }
  var btn = this;
  btn.disabled = true;
  btn.textContent = "Unlocking...";

  fetch(FLASK_BASE + "/api/gmail/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ master_password: pw }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        err.textContent = data.error;
        err.classList.add("visible");
        pwEl.classList.add("error");
        btn.disabled = false;
        btn.textContent = "Unlock";
        return;
      }
      closeModal("unlock-modal");
      refreshGmailStatus();
    })
    .catch(function () {
      err.textContent = "Connection error";
      err.classList.add("visible");
      btn.disabled = false;
      btn.textContent = "Unlock";
    });
});

document.getElementById("unlock-password").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("unlock-submit-btn").click();
});

document.getElementById("unlock-skip-btn").addEventListener("click", function () {
  closeModal("unlock-modal");
});

// Connect modal
document.getElementById("connect-close-btn").addEventListener("click", function () {
  closeModal("connect-modal");
});

document.getElementById("connect-cancel-btn").addEventListener("click", function () {
  closeModal("connect-modal");
});

document.getElementById("connect-modal").addEventListener("click", function (e) {
  if (e.target === this) closeModal("connect-modal");
});

document.getElementById("connect-submit-btn").addEventListener("click", function () {
  var email = document.getElementById("connect-email").value.trim();
  var appPw = document.getElementById("connect-app-pw").value.trim();
  var masterPw = document.getElementById("connect-master-pw").value.trim();
  var masterConfirm = document.getElementById("connect-master-pw-confirm").value.trim();
  var errorEl = document.getElementById("connect-error");
  var masterInput = document.getElementById("connect-master-pw");
  var confirmInput = document.getElementById("connect-master-pw-confirm");

  errorEl.classList.remove("visible");
  errorEl.textContent = "";
  [masterInput, confirmInput].forEach(function (el) { el.classList.remove("error"); });

  if (!email || !appPw || !masterPw || !masterConfirm) {
    errorEl.textContent = "All fields are required.";
    errorEl.classList.add("visible");
    return;
  }
  if (masterPw !== masterConfirm) {
    errorEl.textContent = "Master passwords do not match.";
    errorEl.classList.add("visible");
    masterInput.classList.add("error");
    confirmInput.classList.add("error");
    return;
  }
  if (masterPw.length < 4) {
    errorEl.textContent = "Master password must be at least 4 characters.";
    errorEl.classList.add("visible");
    masterInput.classList.add("error");
    return;
  }

  var btn = this;
  btn.disabled = true;
  btn.textContent = "Connecting...";

  fetch(FLASK_BASE + "/api/gmail/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, app_password: appPw, master_password: masterPw }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        errorEl.textContent = data.error;
        errorEl.classList.add("visible");
        btn.disabled = false;
        btn.textContent = "Connect";
        return;
      }
      closeModal("connect-modal");
      closeModal("settings-modal");
      refreshGmailStatus();
    })
    .catch(function () {
      errorEl.textContent = "Connection error";
      errorEl.classList.add("visible");
      btn.disabled = false;
      btn.textContent = "Connect";
    });
});

// Close connect-modal on Escape from any of its inputs
["connect-email", "connect-app-pw", "connect-master-pw", "connect-master-pw-confirm"].forEach(function (id) {
  document.getElementById(id).addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("connect-submit-btn").click();
  });
});

init();
