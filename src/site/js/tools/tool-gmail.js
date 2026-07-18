registerTool({
  name: "gmail_read",
  displayName: "Gmail Read",
  description:
    "Search and read emails from your Gmail inbox. Use to find verification codes, check unread mail, or look up specific messages.",
  icon: "\u2709",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search_emails", "read_email", "list_unread"],
        description:
          "Action: search_emails (search with query), read_email (read full content by uid), list_unread (list unread messages).",
      },
      query: {
        type: "string",
        description:
          'Gmail search query (e.g. "from:paypal", "is:unread"). Required for search_emails.',
      },
      uid: {
        type: "string",
        description:
          "Message UID. Required for read_email. Get UIDs from search_emails or list_unread.",
      },
      max_results: {
        type: "integer",
        description: "Maximum results (1-50, default 10).",
        default: 10,
      },
    },
    required: ["action"],
  },
  execute: async function (args) {
    return await callFlaskTool("gmail", args);
  },
});

registerTool({
  name: "gmail_send",
  displayName: "Gmail Send",
  description:
    "Send new emails or reply to existing ones from your Gmail inbox. Writing and sending requires user approval.",
  icon: "\u2709",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["send_email", "reply"],
        description:
          "Action: send_email (send a new email to someone), reply (reply to an existing message by uid).",
      },
      to: {
        type: "string",
        description: "Recipient email address. Required for send_email.",
      },
      uid: {
        type: "string",
        description:
          "Message UID to reply to. Required for reply. Get from search_emails or list_unread.",
      },
      subject: {
        type: "string",
        description: "Email subject. Used for send_email.",
      },
      body: {
        type: "string",
        description:
          "Email body text. Required for send_email and reply. Write in simple, clear language without any formatting or markdown.",
      },
    },
    required: ["action"],
  },
  needsPermission: true,
  execute: async function (args) {
    return await callFlaskTool("gmail", args, true);
  },
});
