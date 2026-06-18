registerTool({
  name: "html_css",
  description:
    "Fetch HTML and CSS documentation from MDN (Mozilla Developer Network). Use this for questions about HTML elements, attributes, CSS properties, selectors, layout (flexbox, grid), animations, responsive design, and web standards.",
  icon: "\u003C\u002F\u003E",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          'HTML/CSS topic to look up (e.g. "flexbox", "grid", "div", "background-color", "position absolute", "media queries")',
      },
      url: {
        type: "string",
        description:
          "Direct MDN article URL to fetch full content from (e.g. https://developer.mozilla.org/en-US/docs/Web/CSS/display)",
      },
    },
    required: ["query"],
  },
  execute: async function (args) {
    return await callFlaskTool("html_css", args);
  },
});
