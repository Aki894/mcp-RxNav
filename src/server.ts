import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {CallToolRequestSchema, ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import {ZodError} from "zod";
import {ApiError, type RequestOptions} from "./http.js";
import {definitions, execute} from "./tools.js";

export function createServer(options: RequestOptions = {}) {
  const server = new Server({name: "mcp-rxnav", version: "2.0.0"}, {capabilities: {tools: {}}});
  server.setRequestHandler(ListToolsRequestSchema, async () => ({tools: definitions}));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const result = await execute(request.params.name, request.params.arguments ?? {}, {...options, signal: extra.signal});
      return {content: [{type: "text" as const, text: JSON.stringify(result)}]};
    } catch (error) {
      const failure = error instanceof ZodError
        ? new ApiError("invalid_arguments", error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "))
        : error instanceof ApiError ? error : new ApiError("internal", "Tool execution failed");
      return {isError: true, content: [{type: "text" as const,
        text: JSON.stringify({error: {code: failure.code, message: failure.message, retryable: failure.retryable}})}]};
    }
  });
  return server;
}
