registerTool({
  name: "io_operations",
  description:
    "Read, write, list, or delete files on the local filesystem. Use absolute paths (e.g. C:\\Users\\...) to access any location, or relative paths for the project workspace. Requires user permission before executing.",
  icon: "\uD83D\uDCC1",
  requiresPermission: true,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read", "write", "list", "delete"],
        description:
          "Operation to perform: read (file content), write (create/overwrite), list (directory contents), delete (file or empty directory)",
      },
      path: {
        type: "string",
        description:
          'Relative path (e.g. "src/js/tools.js"), absolute path, or ~/path for home directory (e.g. "~/Desktop/file.txt")',
      },
      content: {
        type: "string",
        description: "Content to write (only for write action)",
      },
    },
    required: ["action", "path"],
  },
  execute: async function (args) {
    return await callFlaskTool("io_operations", args, true);
  },
});
