# RavenLoom Knowledge Import Extension

Browser extension for importing conversations from ChatGPT and Claude into your RavenLoom knowledge base.

## Installation (Development)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this `extension` directory

## Required Icons

Create PNG icons in the `icons/` directory:
- `icon16.png` (16x16)
- `icon32.png` (32x32)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can use any icon generator or create simple purple "R" icons.

## Usage

1. Configure your RavenLoom server URL in extension settings
2. Navigate to a ChatGPT or Claude conversation
3. Click the extension icon
4. Select a team and click "Import Conversation"

## Features

- Extracts conversation history from ChatGPT and Claude
- Imports into RavenLoom's hierarchical knowledge graph
- Automatic entity and fact extraction
- Team-based organization

## Files

- `manifest.json` - Chrome extension manifest (v3)
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic and API communication
- `content-chatgpt.js` - ChatGPT page content extraction
- `content-claude.js` - Claude page content extraction
- `background.js` - Service worker for API calls

## API Requirements

The RavenLoom server must have the `importConversation` GraphQL mutation available:

```graphql
mutation ImportConversation($teamId: ID!, $input: ConversationImportInput!) {
  importConversation(teamId: $teamId, input: $input) {
    success
    nodesCreated
    factsCreated
    rootNodeId
    message
  }
}
```

## Supported Platforms

- ChatGPT (chat.openai.com, chatgpt.com)
- Claude (claude.ai)
