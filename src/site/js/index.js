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
  } catch {}
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
          } catch (e) {}
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
          pendingAiDiv = null;
        }
      } else if (msg.content) {
        if (pendingAiDiv) {
          const contentDiv = document.createElement("div");
          contentDiv.className = "response-text markdown-body";
          renderMarkdown(msg.content, contentDiv);
          pendingAiDiv.appendChild(contentDiv);
          chatResult.appendChild(pendingAiDiv);
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
    "- weather: Get current weather conditions for a location.\n" +
    "- wikipedia: Search Wikipedia.\n" +
    "- cppreference / python_docs / windows_support / programming_help: Documentation lookups.\n\n" +
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
    "When you have enough information, respond directly."
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

  try {
    const res = await fetch(`${LM_STUDIO_BASE}/v1/models`);
    const data = await res.json();
    modelName = data.data[0]?.id;
    if (!modelName) {
      chatResult.textContent = "No model loaded in LM Studio";
      sendBtn.disabled = true;
    }
  } catch {}

  try {
    const envRes = await fetch(FLASK_BASE + "/environment");
    envInfo = await envRes.json();
  } catch {
    // If Flask server isn't running, we'll use the default prompt
  }
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
            var preview = toolResult.split("\n")[0];
            if (preview.length > 60) preview = preview.slice(0, 60) + "...";
            setToolDetail(toolEl, preview);

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
        aiDiv.appendChild(contentEl);
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

          if (!hasStarted && content) {
            hasStarted = true;
            reasoningEl.classList.add("fading");
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
        } catch (e) {}
      }
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
    conv.messages.push({ role: "assistant", content: rawMarkdown });
    conv.updatedAt = Date.now();
    saveConversations();
    renderConversationList();
  }

  isStreaming = false;
}

init();
