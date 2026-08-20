# Drive File Browser MCP

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI assistants — Claude Desktop, Claude Code, Cursor, opencode, or any MCP client — **browse, search, and read files from a Google Drive folder**.

## Tools Provided

| Tool | Description |
|------|-------------|
| `list_files` | List files and subfolders in a Drive folder |
| `search_files` | Search files by name (case-insensitive substring) |
| `get_file_info` | Get metadata for a specific file (name, type, size, timestamps) |
| `read_file` | Read file content — Google Docs export as markdown, Sheets as CSV, Slides as plain text; plain text files returned directly; binary files return a link |

## Prerequisites

- Node.js 18+
- A Google Cloud service account with the target Drive folder shared to it

## Setup

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
      "args": ["/absolute/path/to/drive-file-browser-mcp/dist/index.js"],
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
      "args": ["/absolute/path/to/drive-file-browser-mcp/dist/index.js"],
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
