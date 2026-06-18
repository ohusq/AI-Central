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
