#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { drive, drive_v3, auth } from "@googleapis/drive";
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_FOLDER_ID =
  process.env.DRIVE_ROOT_FOLDER_ID ?? "1TG4ssc_z0FgG2snDapoR_SRu3y16Wxm5";

const MAX_CONTENT_BYTES = 200_000;

function loadServiceAccount(): string {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim().startsWith("{")) return inline.trim();
  const p =
    inline ??
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ??
    "service-account.json";
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  throw new Error(
    "No service account found. Set GOOGLE_SERVICE_ACCOUNT_JSON (inline JSON or a file path) " +
      "or place a service-account.json file next to the project."
  );
}

function extractFolderId(input: string): string {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : input.trim();
}

/* ------------------------------------------------------------------ */
/* Google Drive client                                                 */
/* ------------------------------------------------------------------ */

let driveClient: drive_v3.Drive | undefined;

function getDrive(): drive_v3.Drive {
  if (!driveClient) {
    const googleAuth = new auth.GoogleAuth({
      credentials: JSON.parse(loadServiceAccount()),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    driveClient = drive({ version: "v3", auth: googleAuth });
  }
  return driveClient;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/markdown",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.drawing": "image/png",
};

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".json", ".xml", ".yaml", ".yml",
  ".html", ".htm", ".css", ".js", ".ts", ".py", ".java", ".c", ".cpp",
  ".h", ".sh", ".sql", ".log", ".ini", ".cfg", ".toml",
]);

function isLikelyText(name: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileSummary(f: drive_v3.Schema$File): string {
  const parts = [f.name ?? "unnamed", `id=${f.id}`];
  parts.push(f.mimeType === "application/vnd.google-apps.folder" ? "folder" : `type=${f.mimeType}`);
  if (f.size) parts.push(`size=${formatBytes(Number(f.size))}`);
  if (f.modifiedTime) parts.push(`modified=${f.modifiedTime}`);
  return parts.join(" | ");
}

async function listFolder(folderId: string): Promise<drive_v3.Schema$File[]> {
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const res = await getDrive().files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
      pageSize: 200,
      pageToken,
    });
    files.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

/* ------------------------------------------------------------------ */
/* MCP Server                                                          */
/* ------------------------------------------------------------------ */

const server = new McpServer({
  name: "drive-file-browser",
  version: "1.0.0",
});

server.tool(
  "list_files",
  "List files and subfolders inside a Google Drive folder. Defaults to the configured root folder.",
  { folderId: z.string().optional().describe("Drive folder ID or URL (defaults to DRIVE_ROOT_FOLDER_ID)" ) },
  async ({ folderId }) => {
    const id = folderId ? extractFolderId(folderId) : DEFAULT_FOLDER_ID;
    const files = await listFolder(id);
    if (files.length === 0) return { content: [{ type: "text", text: "Folder is empty." }] };
    const listing = files
      .sort((a, b) => (a.mimeType === "application/vnd.google-apps.folder" ? -1 : 1))
      .map(fileSummary)
      .join("\n");
    return {
      content: [{ type: "text", text: `Contents of folder ${id} (${files.length} items):\n\n${listing}` }],
    };
  }
);

server.tool(
  "search_files",
  "Search for files by name across the configured Google Drive folder tree (recursive).",
  {
    query: z.string().describe("File name to search for (case-insensitive substring)"),
    folderId: z.string().optional().describe("Folder ID or URL to search within (defaults to root folder)"),
  },
  async ({ query, folderId }) => {
    const rootId = folderId ? extractFolderId(folderId) : DEFAULT_FOLDER_ID;
    const res = await getDrive().files.list({
      q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id, name, mimeType, size, modifiedTime)",
      pageSize: 50,
    });
    const files = res.data.files ?? [];
    if (files.length === 0)
      return { content: [{ type: "text", text: `No files found matching "${query}".` }] };
    return {
      content: [
        { type: "text", text: `Found ${files.length} file(s) matching "${query}" (search scope: ${rootId}):\n\n${files.map(fileSummary).join("\n")}` },
      ],
    };
  }
);

server.tool(
  "get_file_info",
  "Get metadata (name, type, size, timestamps) for a specific Google Drive file.",
  { fileId: z.string().describe("Drive file ID or URL") },
  async ({ fileId }) => {
    const res = await getDrive().files.get({
      fileId,
      fields: "id, name, mimeType, size, createdTime, modifiedTime, parents, description, webViewLink",
    });
    const f = res.data;
    const lines = [
      `Name: ${f.name}`,
      `ID: ${f.id}`,
      `Type: ${f.mimeType}`,
      `Size: ${f.size ? formatBytes(Number(f.size)) : "n/a"}`,
      `Created: ${f.createdTime ?? "n/a"}`,
      `Modified: ${f.modifiedTime ?? "n/a"}`,
      `Link: ${f.webViewLink ?? "n/a"}`,
      ...(f.description ? [`Description: ${f.description}`] : []),
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "read_file",
  "Read the text content of a Google Drive file. Google Docs export as markdown, Sheets as CSV, Slides as plain text. Plain text files are returned directly; binary files return metadata and a web link.",
  {
    fileId: z.string().describe("Drive file ID or URL"),
    saveTo: z.string().optional().describe("Optional local path to save the file contents to"),
  },
  async ({ fileId, saveTo }) => {
    const meta = await getDrive().files.get({ fileId, fields: "id, name, mimeType, size, webViewLink" });
    const { mimeType, name } = meta.data;

    let content: string | Buffer | undefined;
    let note = "";

    try {
      if (mimeType && mimeType.startsWith("application/vnd.google-apps.")) {
        const exportMime = EXPORT_MIME[mimeType];
        if (!exportMime) {
          return {
            content: [{ type: "text", text: `Cannot export Google Workspace file of type ${mimeType}. Only Docs, Sheets, Slides and Drawings are supported.` }],
          };
        }
        const res = await getDrive().files.export({ fileId, mimeType: exportMime }, { responseType: "arraybuffer" });
        content = Buffer.from(res.data as ArrayBuffer);
        note = `Exported as ${exportMime}.`;
      } else if (!mimeType || mimeType.startsWith("text/") || isLikelyText(name ?? "")) {
        const res = await getDrive().files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
        content = Buffer.from(res.data as ArrayBuffer);
      } else {
        const link = meta.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
        return {
          content: [{ type: "text", text: `"${name}" (${mimeType ?? "unknown type"}) is a binary file and cannot be returned as text. View it here: ${link}` }],
        };
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to read file "${name}": ${(err as Error).message}` }],
      };
    }

    if (saveTo) {
      fs.mkdirSync(path.dirname(path.resolve(saveTo)), { recursive: true });
      fs.writeFileSync(saveTo, content);
      return {
        content: [{ type: "text", text: `Saved "${name}" to ${path.resolve(saveTo)} (${formatBytes(content.length)}). ${note}` }],
      };
    }

    let text = content.toString("utf8");
    if (text.length > MAX_CONTENT_BYTES) {
      text = text.slice(0, MAX_CONTENT_BYTES) + `\n\n... [truncated, file is ${formatBytes(content.length)} total]`;
    }
    return {
      content: [{ type: "text", text: `--- ${name} ---\n${note}\n\n${text}` }],
    };
  }
);

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`drive-file-browser MCP server running (root folder: ${DEFAULT_FOLDER_ID})\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
  process.exit(1);
});
