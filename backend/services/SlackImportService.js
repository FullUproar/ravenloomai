/**
 * SlackImportService - Parse and import Slack workspace exports
 *
 * Handles:
 * - Parsing Slack export ZIP files
 * - Transforming Slack messages to RavenLoom format
 * - Importing channels, messages, and threads
 * - Duplicate prevention via metadata tracking
 */

import AdmZip from 'adm-zip';
import db from '../db.js';
import * as ChannelService from './ChannelService.js';
import * as ThreadService from './ThreadService.js';

/**
 * Parse a Slack export ZIP file and return preview data
 * @param {Buffer} zipBuffer - The ZIP file as a buffer
 * @returns {Object} Preview with channels, users, message counts
 */
export async function parseExport(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Parse channels.json
  const channelsEntry = entries.find(e => e.entryName === 'channels.json');
  if (!channelsEntry) {
    throw new Error('Invalid Slack export: channels.json not found');
  }
  const channels = JSON.parse(channelsEntry.getData().toString('utf8'));

  // Parse users.json
  const usersEntry = entries.find(e => e.entryName === 'users.json');
  const users = usersEntry
    ? JSON.parse(usersEntry.getData().toString('utf8'))
    : [];

  // Build user lookup map
  const userMap = {};
  users.forEach(u => {
    userMap[u.id] = {
      id: u.id,
      name: u.name,
      realName: u.real_name || u.profile?.real_name || u.name,
      displayName: u.profile?.display_name || u.real_name || u.name
    };
  });

  // Count messages and threads per channel
  const channelStats = [];
  for (const channel of channels) {
    const channelFolder = channel.name + '/';
    const messageFiles = entries.filter(e =>
      e.entryName.startsWith(channelFolder) && e.entryName.endsWith('.json')
    );

    let messageCount = 0;
    let threadCount = 0;
    const threadParents = new Set();

    for (const file of messageFiles) {
      try {
        const messages = JSON.parse(file.getData().toString('utf8'));
        for (const msg of messages) {
          if (msg.type === 'message' && !msg.subtype) {
            messageCount++;
            // Track thread parents
            if (msg.thread_ts && msg.thread_ts !== msg.ts) {
              threadParents.add(msg.thread_ts);
            }
          }
        }
      } catch (e) {
        console.error(`Error parsing ${file.entryName}:`, e.message);
      }
    }

    threadCount = threadParents.size;

    channelStats.push({
      id: channel.id,
      name: channel.name,
      messageCount,
      threadCount,
      memberCount: channel.members?.length || 0
    });
  }

  // Calculate totals
  const totalMessages = channelStats.reduce((sum, c) => sum + c.messageCount, 0);

  return {
    source: 'slack',
    channels: channelStats,
    userCount: users.length,
    totalMessages,
    _internal: { userMap, zip, channels }
  };
}

/**
 * Execute the import based on channel mappings
 * @param {string} teamId - RavenLoom team ID
 * @param {Buffer} zipBuffer - The ZIP file buffer
 * @param {Array} mappings - Channel mapping decisions
 * @param {string} importerId - User ID performing the import
 * @returns {Object} Import results
 */
export async function executeImport(teamId, zipBuffer, mappings, importerId) {
  const preview = await parseExport(zipBuffer);
  const { userMap, zip, channels: slackChannels } = preview._internal;
  const entries = zip.getEntries();

  const results = {
    success: true,
    channelsCreated: 0,
    channelsMerged: 0,
    messagesImported: 0,
    threadsImported: 0,
    errors: []
  };

  const importedAt = new Date().toISOString();

  for (const mapping of mappings) {
    if (mapping.action === 'skip') continue;

    const slackChannel = slackChannels.find(c => c.id === mapping.sourceChannelId);
    if (!slackChannel) {
      results.errors.push(`Channel ${mapping.sourceChannelId} not found in export`);
      continue;
    }

    try {
      let targetChannelId;

      if (mapping.action === 'create') {
        // Create new RavenLoom channel
        const channelName = mapping.newChannelName || slackChannel.name;
        const newChannel = await ChannelService.createChannel(teamId, {
          name: channelName,
          description: `Imported from Slack: #${slackChannel.name}`,
          createdBy: importerId
        });
        targetChannelId = newChannel.id;
        results.channelsCreated++;
      } else if (mapping.action === 'merge') {
        targetChannelId = mapping.targetChannelId;
        results.channelsMerged++;
      }

      // Import messages for this channel
      const importResult = await importChannelMessages(
        targetChannelId,
        slackChannel.name,
        entries,
        userMap,
        importedAt
      );

      results.messagesImported += importResult.messagesImported;
      results.threadsImported += importResult.threadsImported;

    } catch (error) {
      results.errors.push(`Error importing #${slackChannel.name}: ${error.message}`);
      console.error(`Import error for channel ${slackChannel.name}:`, error);
    }
  }

  if (results.errors.length > 0) {
    results.success = results.messagesImported > 0; // Partial success
  }

  return results;
}

/**
 * Import all messages for a single channel
 */
async function importChannelMessages(channelId, slackChannelName, entries, userMap, importedAt) {
  const channelFolder = slackChannelName + '/';
  const messageFiles = entries.filter(e =>
    e.entryName.startsWith(channelFolder) && e.entryName.endsWith('.json')
  );

  // Collect all messages and sort by timestamp
  let allMessages = [];
  for (const file of messageFiles) {
    try {
      const messages = JSON.parse(file.getData().toString('utf8'));
      allMessages = allMessages.concat(messages.filter(m => m.type === 'message' && !m.subtype));
    } catch (e) {
      console.error(`Error parsing ${file.entryName}:`, e.message);
    }
  }

  // Sort by timestamp
  allMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  // Separate thread replies from main messages
  const mainMessages = [];
  const threadReplies = {}; // thread_ts -> [replies]

  for (const msg of allMessages) {
    if (msg.thread_ts && msg.thread_ts !== msg.ts) {
      // This is a thread reply
      if (!threadReplies[msg.thread_ts]) {
        threadReplies[msg.thread_ts] = [];
      }
      threadReplies[msg.thread_ts].push(msg);
    } else {
      mainMessages.push(msg);
    }
  }

  let messagesImported = 0;
  let threadsImported = 0;
  const tsToMessageId = {}; // Map Slack ts to RavenLoom message ID

  // First pass: Import all main messages
  for (const msg of mainMessages) {
    // Check for duplicate
    const existing = await checkDuplicate(channelId, msg.ts);
    if (existing) continue;

    const messageId = await insertMessage(channelId, msg, null, userMap, importedAt);
    if (messageId) {
      tsToMessageId[msg.ts] = messageId;
      messagesImported++;
    }
  }

  // Second pass: Create threads and import replies
  for (const [threadTs, replies] of Object.entries(threadReplies)) {
    const parentMessageId = tsToMessageId[threadTs];
    if (!parentMessageId) {
      // Parent message wasn't imported (maybe filtered out or duplicate)
      continue;
    }

    // Create a thread for this conversation
    const parentMsg = mainMessages.find(m => m.ts === threadTs);
    const threadTitle = parentMsg
      ? truncateText(transformSlackText(parentMsg.text, userMap), 100)
      : 'Imported thread';

    const thread = await createThreadForImport(channelId, threadTitle);
    if (!thread) continue;

    threadsImported++;

    // Update parent message to link to thread
    await db.query(
      'UPDATE messages SET thread_id = $1 WHERE id = $2',
      [thread.id, parentMessageId]
    );

    // Import all replies into this thread
    for (const reply of replies) {
      const existing = await checkDuplicate(channelId, reply.ts);
      if (existing) continue;

      const replyId = await insertMessage(channelId, reply, thread.id, userMap, importedAt);
      if (replyId) {
        messagesImported++;
      }
    }

    // Update thread stats
    await db.query(
      `UPDATE threads SET message_count = (
        SELECT COUNT(*) FROM messages WHERE thread_id = $1
      ), last_activity_at = NOW() WHERE id = $1`,
      [thread.id]
    );
  }

  return { messagesImported, threadsImported };
}

/**
 * Check if a message with this Slack timestamp already exists
 */
async function checkDuplicate(channelId, slackTs) {
  const result = await db.query(
    `SELECT 1 FROM messages
     WHERE channel_id = $1
       AND metadata->>'importSource' = 'slack'
       AND metadata->>'originalTs' = $2
     LIMIT 1`,
    [channelId, slackTs]
  );
  return result.rows.length > 0;
}

/**
 * Insert a single message into the database
 */
async function insertMessage(channelId, slackMsg, threadId, userMap, importedAt) {
  const user = userMap[slackMsg.user] || { displayName: 'Unknown User', id: slackMsg.user };
  const transformedText = transformSlackText(slackMsg.text, userMap);
  const content = `**${user.displayName}**: ${transformedText}`;

  const metadata = {
    importSource: 'slack',
    importedAt,
    originalTs: slackMsg.ts,
    originalUser: user.displayName,
    originalUserId: slackMsg.user
  };

  // Convert Slack timestamp to Date
  const createdAt = new Date(parseFloat(slackMsg.ts) * 1000);

  try {
    const result = await db.query(
      `INSERT INTO messages (channel_id, thread_id, user_id, content, is_ai, mentions_ai, metadata, created_at)
       VALUES ($1, $2, NULL, $3, false, false, $4, $5)
       RETURNING id`,
      [channelId, threadId, content, JSON.stringify(metadata), createdAt]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('Error inserting message:', error.message);
    return null;
  }
}

/**
 * Create a thread for imported messages
 */
async function createThreadForImport(channelId, title) {
  try {
    const result = await db.query(
      `INSERT INTO threads (channel_id, title, started_by, message_count, is_resolved)
       VALUES ($1, $2, NULL, 0, false)
       RETURNING *`,
      [channelId, title]
    );
    return result.rows[0] ? {
      id: result.rows[0].id,
      channelId: result.rows[0].channel_id,
      title: result.rows[0].title
    } : null;
  } catch (error) {
    console.error('Error creating thread:', error.message);
    return null;
  }
}

/**
 * Transform Slack-specific text formatting to standard markdown
 */
function transformSlackText(text, userMap) {
  if (!text) return '';

  let result = text;

  // Transform user mentions: <@U1234567> -> @username
  result = result.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
    const user = userMap[userId];
    return user ? `@${user.displayName}` : match;
  });

  // Transform channel mentions: <#C1234567|channel-name> -> #channel-name
  result = result.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');

  // Transform URLs with labels: <url|label> -> [label](url)
  result = result.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');

  // Transform plain URLs: <url> -> url
  result = result.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // Unescape HTML entities
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');
  result = result.replace(/&amp;/g, '&');

  return result;
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export default {
  parseExport,
  executeImport
};
