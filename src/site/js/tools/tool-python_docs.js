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
