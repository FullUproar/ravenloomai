/**
 * Test script for 3-tier memory system
 */

import MediumTermMemory from '../services/MediumTermMemory.js';
import ShortTermMemory from '../services/ShortTermMemory.js';
import db from '../db.js';

async function testMemorySystem() {
  console.log('🧪 Testing 3-Tier Memory System\n');

  try {
    // Find an existing project to test with
    const projectResult = await db.query('SELECT id FROM projects LIMIT 1');

    if (projectResult.rows.length === 0) {
      console.log('❌ No projects found. Create a project first.');
      process.exit(1);
    }

    const projectId = projectResult.rows[0].id;
    console.log(`📁 Using project ID: ${projectId}\n`);

    // === TEST TIER 2: Medium-term Memory ===
    console.log('=== Testing Tier 2: Medium-term Memory ===\n');

    // Add some test memories
    console.log('Adding test memories...');

    await MediumTermMemory.addFact(
      projectId,
      'user_timezone',
      'Pacific Time (PT)',
      8
    );
    console.log('✅ Added fact: user_timezone');

    await MediumTermMemory.addDecision(
      projectId,
      'weekly_checkin_day',
      'Every Monday morning',
      7
    );
    console.log('✅ Added decision: weekly_checkin_day');

    await MediumTermMemory.addPreference(
      projectId,
      'communication_style',
      'Direct and concise, no platitudes',
      6
    );
    console.log('✅ Added preference: communication_style');

    await MediumTermMemory.addInsight(
      projectId,
      'user_pattern',
      'User is most productive in the morning hours',
      7
    );
    console.log('✅ Added insight: user_pattern');

    // Get all memories
    console.log('\nRetrieving all memories...');
    const memories = await MediumTermMemory.getMemories(projectId);
    console.log(`Found ${memories.length} memories:`);
    memories.forEach(m => {
      console.log(`  - [${m.memory_type}] ${m.key}: ${m.value} (importance: ${m.importance})`);
    });

    // Get stats
    console.log('\nMemory statistics:');
    const stats = await MediumTermMemory.getStats(projectId);
    console.log(`  Total: ${stats.totalMemories}`);
    console.log(`  Facts: ${stats.facts}`);
    console.log(`  Decisions: ${stats.decisions}`);
    console.log(`  Preferences: ${stats.preferences}`);
    console.log(`  Insights: ${stats.insights}`);
    console.log(`  Avg Importance: ${stats.avgImportance}`);

    // Format for prompt
    console.log('\nFormatted for LLM prompt:');
    const formatted = MediumTermMemory.formatForPrompt(memories);
    console.log(formatted);

    // Token estimation
    const tokens = MediumTermMemory.estimateTokens(memories);
    console.log(`Estimated tokens: ${tokens}`);

    // === TEST TIER 1: Short-term Memory ===
    console.log('\n=== Testing Tier 1: Short-term Memory ===\n');

    // Find a conversation
    const convResult = await db.query(
      'SELECT id FROM conversations WHERE project_id = $1 LIMIT 1',
      [projectId]
    );

    if (convResult.rows.length > 0) {
      const conversationId = convResult.rows[0].id;
      console.log(`💬 Using conversation ID: ${conversationId}\n`);

      // Get context
      console.log('Getting short-term context...');
      const context = await ShortTermMemory.getContext(conversationId);

      console.log(`  Recent messages: ${context.recentMessages.length}`);
      console.log(`  Has summary: ${context.summary ? 'Yes' : 'No'}`);
      console.log(`  Estimated tokens: ${context.tokenEstimate}`);

      if (context.recentMessages.length > 0) {
        console.log('\nRecent messages:');
        context.recentMessages.forEach(msg => {
          console.log(`  ${msg.sender_name}: ${msg.content.substring(0, 60)}...`);
        });
      }

      // Format for prompt
      console.log('\nFormatted for LLM prompt:');
      const stFormatted = ShortTermMemory.formatForPrompt(context);
      console.log(stFormatted.substring(0, 300) + '...');

      // Test summary creation (if enough messages)
      const messageCount = await db.query(
        'SELECT COUNT(*) as count FROM conversation_messages WHERE conversation_id = $1',
        [conversationId]
      );

      const totalMessages = parseInt(messageCount.rows[0].count);
      console.log(`\nTotal messages in conversation: ${totalMessages}`);

      if (totalMessages >= 20) {
        console.log('Creating conversation summary...');
        const summary = await ShortTermMemory.createSummary(conversationId);
        console.log('Summary created:');
        console.log(summary);
      } else {
        console.log('Not enough messages for summary (need 20+)');
      }
    } else {
      console.log('⚠️  No conversations found for this project');
    }

    console.log('\n✅ All memory system tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await db.end();
  }
}

testMemorySystem();
