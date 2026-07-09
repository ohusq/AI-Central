registerTool({
  name: "gmail",
  description:
    "Search and read emails from your Gmail inbox. Use to find verification codes, check unread mail, or look up specific messages by sender or subject.",
  icon: "\u2709",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search_emails", "read_email", "list_unread"],
        description:
          "Action to perform: search_emails (search with Gmail query syntax), read_email (read full content by uid), list_unread (list unread messages).",
      },
      query: {
        type: "string",
        description:
          'Gmail search query (e.g. "from:paypal", "subject:verification", "is:unread"). Required for search_emails.',
      },
      uid: {
        type: "string",
        description:
          "Message UID to read. Required for read_email. Get UIDs from search_emails or list_unread results.",
      },
      max_results: {
        type: "integer",
        description: "Maximum number of results (1-50, default 10).",
        default: 10,
      },
    },
    required: ["action"],
  },
  execute: async function (args) {
    return await callFlaskTool("gmail", args);
  },
});
