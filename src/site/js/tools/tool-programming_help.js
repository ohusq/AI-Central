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
