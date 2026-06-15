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

  function registerTool(tool) {
    tools[tool.name] = tool;
  }

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

  async function callFlaskTool(name, args, permissionGranted) {
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
  }

  async function executeTool(name, args) {
    var tool = tools[name];
    if (!tool) throw new Error("Unknown tool: " + name);

    if (tool.requiresPermission && permissions[name] !== "always") {
      var granted = await requestPermission(name, args);
      if (!granted) throw new Error("User denied permission for " + name);
    }

    return await tool.execute(args);
  }

  function getInfo(name) {
    var tool = tools[name];
    if (!tool) return null;
    return { name: tool.name, icon: tool.icon };
  }

  // ==================== TOOLS ====================

  // --- wikipedia (existing, stays browser-side) ---
  registerTool({
    name: "wikipedia",
    description:
      'Search Wikipedia or get a summary of a specific page. Use "search" to find pages by keyword, use "summary" to read a specific page.',
    icon: "W",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "summary"],
          description: '"search" to find pages, "summary" to get page content',
        },
        query: {
          type: "string",
          description: "Search term or exact page title",
        },
        limit: {
          type: "number",
          description: "Number of search results (max 10)",
          default: 5,
        },
      },
      required: ["action", "query"],
    },
    execute: async function (args) {
      var action = args.action;
      var query = args.query;
      var limit = args.limit || 5;

      if (action === "search") {
        var url =
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
          encodeURIComponent(query) +
          "&srlimit=" +
          Math.min(limit, 10) +
          "&format=json&origin=*";
        var res = await fetch(url);
        if (!res.ok) throw new Error("Wikipedia search failed: " + res.status);
        var data = await res.json();
        var results = (data.query && data.query.search) || [];
        if (results.length === 0)
          return 'No Wikipedia results found for "' + query + '".';
        var lines = results.map(function (r, i) {
          var snippet = (r.snippet || "").replace(/<\/?[^>]+>/g, "");
          return i + 1 + ". " + r.title + " \u2014 " + snippet;
        });
        return (
          'Search results for "' +
          query +
          '":\n' +
          lines.join("\n") +
          "\n\nUse summary with the exact title from the list to get full article content."
        );
      }

      if (action === "summary") {
        var summaryUrl =
          "https://en.wikipedia.org/api/rest_v1/page/summary/" +
          encodeURIComponent(query);
        var summaryRes = await fetch(summaryUrl);
        if (summaryRes.status === 404) {
          var fallbackUrl =
            "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
            encodeURIComponent(query) +
            "&srlimit=1&format=json&origin=*";
          var fbRes = await fetch(fallbackUrl);
          if (fbRes.ok) {
            var fbData = await fbRes.json();
            var fbResults = (fbData.query && fbData.query.search) || [];
            if (fbResults.length > 0) {
              var correctTitle = fbResults[0].title;
              var retryUrl =
                "https://en.wikipedia.org/api/rest_v1/page/summary/" +
                encodeURIComponent(correctTitle);
              var retryRes = await fetch(retryUrl);
              if (retryRes.ok) {
                var retryData = await retryRes.json();
                var retryExtract = retryData.extract || "No extract available.";
                if (retryExtract.length > 3000)
                  retryExtract = retryExtract.slice(0, 3000) + "...";
                return (
                  'Found page "' +
                  correctTitle +
                  '" instead:\n\n' +
                  retryExtract
                );
              }
            }
          }
          return (
            'Page "' +
            query +
            '" not found on Wikipedia. Try using search first to find the exact page title.'
          );
        }
        if (!summaryRes.ok)
          throw new Error("Wikipedia summary failed: " + summaryRes.status);
        var summaryData = await summaryRes.json();
        var extract = summaryData.extract || "No extract available.";
        if (
          summaryData.title &&
          summaryData.title.toLowerCase() !== query.toLowerCase()
        ) {
          extract = "Page: " + summaryData.title + "\n\n" + extract;
        }
        if (extract.length > 3000) extract = extract.slice(0, 3000) + "...";
        return extract;
      }

      throw new Error("Unknown action: " + action);
    },
  });

  // --- weather ---
  registerTool({
    name: "weather",
    description:
      "Get current weather conditions for a location. Leave location empty to auto-detect.",
    icon: "\uD83C\uDF24",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            'City name or coordinates (e.g. "London" or "48.85,2.35"). Leave empty for auto-detect.',
        },
      },
    },
    execute: async function (args) {
      return await callFlaskTool("weather", args);
    },
  });

  // --- cppreference ---
  registerTool({
    name: "cppreference",
    description:
      "Fetch C++ reference documentation from cppreference.com. Use this for C++ standard library questions (std::vector, std::map, algorithms, etc.).",
    icon: "C",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'C++ topic to look up (e.g. "std::vector", "std::map::find", "auto")',
        },
      },
      required: ["query"],
    },
    execute: async function (args) {
      return await callFlaskTool("cppreference", args);
    },
  });

  // --- python_docs ---
  registerTool({
    name: "python_docs",
    description:
      "Fetch Python documentation from docs.python.org. Use this for Python standard library questions.",
    icon: "P",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Python topic to look up (e.g. "list.append", "os.path.join", "json.dumps")',
        },
      },
      required: ["query"],
    },
    execute: async function (args) {
      return await callFlaskTool("python_docs", args);
    },
  });

  // --- windows_support ---
  registerTool({
    name: "windows_support",
    description:
      "Search Microsoft documentation and support articles for Windows issues, errors, and features.",
    icon: "\u229E",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Windows topic to search (e.g. "bluescreen 0x50", "enable hyper-v", "bitlocker recovery")',
        },
      },
      required: ["query"],
    },
    execute: async function (args) {
      return await callFlaskTool("windows_support", args);
    },
  });

  // --- programming_help ---
  registerTool({
    name: "programming_help",
    description:
      "Fetch programming documentation for any language/platform. Supports MDN (JS/TS/CSS/HTML), Python docs, Rust docs, Go docs, C# docs, cppreference, and general fallback search.",
    icon: "\u003C\u002F\u003E",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Search terms (e.g. "Array.map", "goroutines", "async await")',
        },
        language: {
          type: "string",
          description:
            "Programming language (javascript, typescript, python, rust, go, csharp, cpp, java, html, css). Leave empty for general search.",
        },
        url: {
          type: "string",
          description:
            "Direct documentation URL to fetch. Overrides language-based defaults.",
        },
      },
      required: ["query"],
    },
    execute: async function (args) {
      return await callFlaskTool("programming_help", args);
    },
  });

  // --- io_operations ---
  registerTool({
    name: "io_operations",
    description:
      "Read, write, list, or delete files on the local filesystem. Use absolute paths (e.g. C:\\Users\\...) to access any location, or relative paths for the project workspace. Requires user permission before executing.",
    icon: "\uD83D\uDCC1",
    requiresPermission: true,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write", "list", "delete"],
          description:
            "Operation to perform: read (file content), write (create/overwrite), list (directory contents), delete (file or empty directory)",
        },
        path: {
          type: "string",
          description:
            'Relative path (e.g. "src/js/tools.js"), absolute path, or ~/path for home directory (e.g. "~/Desktop/file.txt")',
        },
        content: {
          type: "string",
          description: "Content to write (only for write action)",
        },
      },
      required: ["action", "path"],
    },
    execute: async function (args) {
      return await callFlaskTool("io_operations", args, true);
    },
  });

  // --- public API ---
  window.Tools = {
    getSchemas: getSchemas,
    execute: executeTool,
    getInfo: getInfo,
    loadPermissions: loadPermissions,
  };

  loadPermissions();
})();
