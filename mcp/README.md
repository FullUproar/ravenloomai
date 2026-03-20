# RavenLoom MCP Server

MCP server that lets Claude interact with RavenLoom's knowledge base. Ask questions, extract facts, confirm them, search, and browse scopes — all from a Claude conversation.

## Setup

```bash
npm install
npm run build
```

## Tools

| Tool | Purpose |
|------|---------|
| `raven_ask` | Ask a question — returns answer with confidence + sources |
| `raven_remember_preview` | Extract facts from text (preview before saving) |
| `raven_remember_confirm` | Confirm and save facts from a preview |
| `raven_search_facts` | Search confirmed facts by keyword |
| `raven_list_scopes` | List available scopes for a team |

## Claude Desktop Config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ravenloom": {
      "command": "node",
      "args": ["C:/dev/RavenLoom/ravenloom-mcp/build/index.js"],
      "env": {
        "RAVENLOOM_URL": "http://localhost:4000/graphql",
        "RAVENLOOM_TEAM_ID": "824c6245-231f-4969-95a1-9e1be7217cc7",
        "RAVENLOOM_USER_ID": "NLNDJiASfeXipbAgssyelUL9Rxo2"
      }
    }
  }
}
```

## Claude Code Config

Add to `.claude/settings.json` or use `claude mcp add`:

```bash
claude mcp add ravenloom -- node C:/dev/RavenLoom/ravenloom-mcp/build/index.js
```

Or manually in settings:

```json
{
  "mcpServers": {
    "ravenloom": {
      "command": "node",
      "args": ["C:/dev/RavenLoom/ravenloom-mcp/build/index.js"],
      "env": {
        "RAVENLOOM_URL": "http://localhost:4000/graphql",
        "RAVENLOOM_TEAM_ID": "824c6245-231f-4969-95a1-9e1be7217cc7",
        "RAVENLOOM_USER_ID": "NLNDJiASfeXipbAgssyelUL9Rxo2"
      }
    }
  }
}
```

## Prerequisites

RavenLoom backend must be running:

```bash
cd ../ravenloom/backend && node index.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RAVENLOOM_URL` | Yes | GraphQL endpoint (default: `http://localhost:4000/graphql`) |
| `RAVENLOOM_TEAM_ID` | Yes | Default team UUID |
| `RAVENLOOM_USER_ID` | Yes | Firebase user ID for auth context |
