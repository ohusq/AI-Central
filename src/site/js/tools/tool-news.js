registerTool({
  name: "news",
  description:
    "Fetch recent news articles about a given subject. Uses Google News (no API key required) with a DuckDuckGo fallback. Returns headlines, sources, dates, and summaries.",
  icon: "\uD83D\uDCF0",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          'News topic to search for (e.g. "artificial intelligence", "stock market", "climate change")',
      },
      max_results: {
        type: "number",
        description: "Number of news articles to return (max 10, default 5)",
        default: 5,
      },
    },
    required: ["query"],
  },
  execute: async function (args) {
    return await callFlaskTool("news", args);
  },
});
