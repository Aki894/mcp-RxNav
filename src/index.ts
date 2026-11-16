#!/usr/bin/env node
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {createServer} from "./server.js";

// Accept the previous service argument for existing client configurations.
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "rxnav")) {
  console.error("Usage: mcp-rxnav [rxnav]");
  process.exitCode = 2;
} else {
  const server = createServer();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { void server.close().finally(() => process.exit(0)); });
  }
  server.connect(new StdioServerTransport()).catch(() => {
    console.error("Failed to start MCP server");
    process.exitCode = 1;
  });
}
