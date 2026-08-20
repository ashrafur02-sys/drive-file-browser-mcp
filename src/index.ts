#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `drive-file-browser MCP server running (stdio, root folder: ${process.env.DRIVE_ROOT_FOLDER_ID ?? "1TG4ssc_z0FgG2snDapoR_SRu3y16Wxm5"})\n`
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
  process.exit(1);
});
