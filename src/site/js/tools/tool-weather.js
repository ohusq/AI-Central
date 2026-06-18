registerTool({
  name: "weather",
  description:
    "Get current weather conditions for a location. Leave location empty to auto-detect.",
  icon: "\u2601",
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
