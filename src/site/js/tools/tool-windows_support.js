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
