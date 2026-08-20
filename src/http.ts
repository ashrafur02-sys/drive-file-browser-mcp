import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";

/**
 * Stateless Streamable HTTP transport for the MCP server.
 * Designed for serverless platforms (Vercel): every POST request gets a
 * fresh server + transport pair, no session state is kept.
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  /* Bearer token auth (optional — enforced only when MCP_API_KEY is set) */
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = process.env.MCP_API_KEY;
    if (!apiKey) return next();
    const provided = req.headers.authorization;
    if (provided === `Bearer ${apiKey}`) return next();
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: missing or invalid API key" },
      id: null,
    });
  };

  const notAllowed = (_req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed (stateless server: POST only)" },
        id: null,
      })
    );
  };

  app.post("/api/mcp", requireAuth, async (req: Request, res: Response) => {
    try {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/api/mcp", requireAuth, notAllowed);
  app.delete("/api/mcp", requireAuth, notAllowed);

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      server: "drive-file-browser-mcp",
      transport: "streamable-http (stateless)",
      auth: process.env.MCP_API_KEY ? "bearer-token" : "none",
    });
  });

  return app;
}
