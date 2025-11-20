/**
 * Proactive Check-In Cron Job
 *
 * Runs periodically to send check-in messages to inactive projects.
 * Respects kill switches and token budgets.
 *
 * Usage:
 *   node scripts/run-proactive-checkins.js
 *
 * Recommended schedule (via cron or task scheduler):
 *   - Run 2-3 times per day (e.g., 9am, 2pm, 6pm)
 *   - Adjust based on your user base timezone distribution
 */

import ProactiveCheckInService from '../services/ProactiveCheckInService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('\n🤖 ========================================');
  console.log('🤖 PROACTIVE CHECK-IN CRON JOB');
  console.log('🤖 ========================================\n');
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);

  try {
    // Check environment config
    const tokenBudget = process.env.DAILY_CHECKIN_TOKEN_BUDGET || '10000';
    const maxCheckIns = process.env.MAX_CHECKINS_PER_RUN || '20';

    console.log(`📊 Token budget: ${tokenBudget} tokens/day`);
    console.log(`📊 Max check-ins per run: ${maxCheckIns}`);
    console.log('');

    // Get current token usage stats before running
    const statsBefore = ProactiveCheckInService.getTokenUsageStats();
    console.log('📈 Token usage before run:');
    console.log(`   Used: ${statsBefore.used}/${statsBefore.budget} (${statsBefore.percentage}%)`);
    console.log(`   Remaining: ${statsBefore.remaining}`);
    console.log('');

    if (statsBefore.remaining <= 0) {
      console.log('⚠️  Token budget exhausted for today. Skipping check-ins.');
      console.log(`   Budget will reset on: ${statsBefore.lastReset}`);
      process.exit(0);
    }

    // Run check-in process
    const result = await ProactiveCheckInService.processCheckIns();

    // Display results
    console.log('\n📊 ========================================');
    console.log('📊 RESULTS');
    console.log('📊 ========================================\n');

    if (result.success) {
      console.log(`✅ Success! Sent ${result.checkInsSent} check-in(s)`);
      console.log(`🪙 Tokens used: ${result.tokensUsed}`);
      console.log(`⏱️  Duration: ${result.durationMs}ms`);
      console.log('');

      // Get updated stats
      const statsAfter = ProactiveCheckInService.getTokenUsageStats();
      console.log('📈 Token usage after run:');
      console.log(`   Used: ${statsAfter.used}/${statsAfter.budget} (${statsAfter.percentage}%)`);
      console.log(`   Remaining: ${statsAfter.remaining}`);
      console.log('');

      if (result.checkInsSent > 0) {
        console.log('📧 Check-ins sent to:');
        result.results.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.userEmail} - Project: "${item.projectTitle}"`);
        });
      } else {
        console.log('ℹ️  No projects needed check-ins at this time.');
      }
    } else {
      console.error('❌ Check-in process failed:', result.error);
      process.exit(1);
    }

    console.log('\n🤖 ========================================');
    console.log('🤖 CRON JOB COMPLETE');
    console.log('🤖 ========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ FATAL ERROR');
    console.error('❌ ========================================\n');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

// Run the job
main();
