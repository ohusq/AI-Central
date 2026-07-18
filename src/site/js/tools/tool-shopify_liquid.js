registerTool({
  name: "shopify_liquid",
  description:
    "Search Shopify Liquid documentation for tags, filters, objects, and language basics. " +
    "Use this for any Shopify theme development, Liquid syntax, or storefront rendering questions.",
  icon: "\u2112",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query (e.g. 'product object', 'money filter', 'for tag', 'color filter')",
      },
    },
    required: ["query"],
  },
  execute: async function (args) {
    return await callFlaskTool("shopify_liquid", args);
  },
});
