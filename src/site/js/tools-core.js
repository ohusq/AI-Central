(function () {
  "use strict";

  var tools = {};
  var FLASK_BASE = "http://localhost:8080";

  // --- permission system ---
  var permissions = {};

  function loadPermissions() {
    try {
      var d = localStorage.getItem("ai-central-permissions");
      if (d) permissions = JSON.parse(d);
    } catch (e) {}
  }

  function savePermissions() {
    try {
      localStorage.setItem(
        "ai-central-permissions",
        JSON.stringify(permissions),
      );
    } catch (e) {}
  }

  window.__permResolve = null;
  window.__permToolName = null;

  function requestPermission(toolName, args) {
    return new Promise(function (resolve) {
      window.__permResolve = resolve;
      window.__permToolName = toolName;
      var modal = document.getElementById("permission-modal");
      document.getElementById("perm-tool-name").textContent = toolName;
      document.getElementById("perm-tool-desc").textContent =
        (tools[toolName] && tools[toolName].description) || "";
      document.getElementById("perm-tool-args").textContent = JSON.stringify(
        args,
        null,
        2,
      );
      modal.classList.add("active");
    });
  }

  window.handlePermissionResponse = function (decision) {
    if (!window.__permResolve) return;
    var modal = document.getElementById("permission-modal");
    modal.classList.remove("active");
    if (decision === "once") {
      permissions[window.__permToolName] = "session";
      window.__permResolve(true);
    } else if (decision === "always") {
      permissions[window.__permToolName] = "always";
      savePermissions();
      window.__permResolve(true);
    } else {
      window.__permResolve(false);
    }
    window.__permResolve = null;
    window.__permToolName = null;
  };

  // --- public registration (called by individual tool files) ---
  window.registerTool = function (tool) {
    tools[tool.name] = tool;
  };

  function getSchemas() {
    return Object.values(tools).map(function (t) {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      };
    });
  }

  window.callFlaskTool = async function (name, args, permissionGranted) {
    var body = { name: name, args: args };
    if (permissionGranted) body.permission_granted = true;
    var res = await fetch(FLASK_BASE + "/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var errData = await res.json().catch(function () {
        return {};
      });
      throw new Error(
        (errData && errData.error) || "Tool execution failed: " + res.status,
      );
    }
    var data = await res.json();
    return data.result;
  };

  function getPermission(name) {
    return permissions[name] || "ask";
  }

  function setPermission(name, value) {
    if (value === "ask") {
      delete permissions[name];
    } else {
      permissions[name] = value;
    }
    savePermissions();
  }

  var DISPLAY_NAMES = {
    gmail_read: "Gmail Read",
    gmail_send: "Gmail Send",
    weather: "Weather",
    wikipedia: "Wikipedia",
    news: "News",
    cppreference: "C++ Reference",
    python_docs: "Python Docs",
    html_css: "HTML/CSS",
    io_operations: "File Operations",
    windows_support: "Windows Support",
    programming_help: "Programming Help",
  };

  function listTools() {
    return Object.keys(tools).map(function (name) {
      var t = tools[name];
      return {
        name: name,
        displayName: t.displayName || DISPLAY_NAMES[name] || name,
        icon: t.icon || "?",
        description: t.description || "",
        permission: getPermission(name),
      };
    });
  }

  async function executeTool(name, args) {
    var tool = tools[name];
    if (!tool) throw new Error("Unknown tool: " + name);

    var perm = getPermission(name);
    if (perm === "never") {
      throw new Error("Permission denied for " + name + " (blocked in settings)");
    }

    var needsPerm = false;
    if (typeof tool.needsPermission === "function") {
      needsPerm = tool.needsPermission(args);
    } else if (tool.needsPermission) {
      needsPerm = true;
    }
    if (needsPerm && perm !== "always") {
      var granted = await requestPermission(name, args);
      if (!granted) throw new Error("User denied permission for " + name);
    }

    var result = await tool.execute(args);
    return result;
  }

  function getInfo(name) {
    var tool = tools[name];
    if (!tool) return null;
    return { name: tool.name, icon: tool.icon };
  }

  // --- public API ---
  window.Tools = {
    getSchemas: getSchemas,
    execute: executeTool,
    getInfo: getInfo,
    loadPermissions: loadPermissions,
    listTools: listTools,
    getPermission: getPermission,
    setPermission: setPermission,
  };

  loadPermissions();
})();
