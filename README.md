# Drive File Browser MCP

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI assistants — Claude Desktop, Claude Code, Cursor, opencode, or any MCP client — **browse, search, and read files from a Google Drive folder**.

Runs in two modes:
- **Local (stdio)** — for desktop MCP clients
- **Remote (HTTP, Streamable)** — deployed on Vercel: **https://drive-file-browser-mcp.vercel.app/api/mcp**

## Tools Provided

| Tool | Description |
|------|-------------|
| `list_files` | List files and subfolders in a Drive folder |
| `search_files` | Search files by name (case-insensitive substring) |
| `get_file_info` | Get metadata for a specific file (name, type, size, timestamps) |
| `read_file` | Read file content — Google Docs export as markdown, Sheets as CSV, Slides as plain text; plain text files returned directly; binary files return a link |

## Remote Deployment (Vercel)

The server is live at:

```
https://drive-file-browser-mcp.vercel.app/api/mcp
```

It uses the stateless Streamable HTTP transport, so it works with any MCP client that supports remote HTTP servers. The endpoint is protected with a Bearer API key.

### Connect a client

**Claude Desktop / Claude Code** (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "drive-browser": {
      "type": "http",
      "url": "https://drive-file-browser-mcp.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}
```

**Any HTTP client** — send JSON-RPC over POST with headers `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `Authorization: Bearer <YOUR_API_KEY>`:

```bash
curl -X POST https://drive-file-browser-mcp.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <YOUR_API_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

Health check (no auth): `GET https://drive-file-browser-mcp.vercel.app/api/health`

### Deploy your own instance

1. Fork/clone this repo, then:

```bash
npm install
npm i -g vercel
vercel login
vercel link --yes
# env vars:
echo "<your-api-key>" | vercel env add MCP_API_KEY production
echo "<your-drive-folder-id>" | vercel env add DRIVE_ROOT_FOLDER_ID production
echo "<service-account-json-contents>" | vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
vercel deploy --prod --yes
```

2. Get a Google service account JSON (see below) and share your Drive folder with its `client_email`.

### Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The full service account JSON key (inline string) — **required** for Drive access |
| `DRIVE_ROOT_FOLDER_ID` | Default folder ID the server browses |
| `MCP_API_KEY` | Bearer token required on `/api/mcp` — leave unset to disable auth (not recommended) |

Manage them in the Vercel dashboard: Project → Settings → Environment Variables.

## Local Setup (stdio mode)

### 1. Create a Google service account

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. Enable the **Google Drive API** (APIs & Services → Library → search "Google Drive API" → Enable).
3. Go to **APIs & Services → Credentials → Create Credentials → Service account**.
4. Open the service account → **Keys** tab → **Add key → Create new key → JSON**. A `.json` key file downloads.
5. **Share the Drive folder** with the service account's email (found in the JSON file as `client_email`, looks like `xxx@xxx.iam.gserviceaccount.com`) — right-click the folder in Drive → Share → enter that email → Viewer.

### 2. Install and build

```bash
git clone https://github.com/ashrafur02-sys/drive-file-browser-mcp.git
cd drive-file-browser-mcp
npm install
npm run build
```

### 3. Configure

Set environment variables (or copy `.env.example` to `.env` — note: `.env` files are NOT auto-loaded; set real env vars in your MCP client config, or point `GOOGLE_SERVICE_ACCOUNT_JSON` at a file path):

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Inline service account JSON **or** a path to the JSON key file |
| `DRIVE_ROOT_FOLDER_ID` | Default folder ID (or full URL) the server browses |

## Usage with MCP Clients

Add to your client's MCP configuration:

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "drive-browser": {
      "command": "node",
      "args": ["/absolute/path/to/drive-file-browser-mcp/dist/src/index.js"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_JSON": "/absolute/path/to/service-account.json",
        "DRIVE_ROOT_FOLDER_ID": "1TG4ssc_z0FgG2snDapoR_SRu3y16Wxm5"
      }
    }
  }
}
```

**Claude Code / opencode**:

```json
{
  "mcpServers": {
    "drive-browser": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/drive-file-browser-mcp/dist/src/index.js"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_JSON": "/absolute/path/to/service-account.json",
        "DRIVE_ROOT_FOLDER_ID": "1TG4ssc_z0FgG2snDapoR_SRu3y16Wxm5"
      }
    }
  }
}
```

Once connected, ask your assistant things like:

- "List the files in the Drive folder"
- "Search for the press meet presentation"
- "Read the corporate communication file"
- "Get info about the file with ID ..."

## Security Notes

- The server uses **read-only** Drive scope (`drive.readonly`).
- Never commit your service account key. It is gitignored by default.
- Anyone you give the key file to gets read access to everything the service account can see — share the repo, not your key.

## License

MIT
