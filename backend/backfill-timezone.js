import db from './db.js';

async function backfillTimezones() {
  try {
    console.log('🕐 Starting timezone backfill...');
    
    // Get current timezone offset in hours
    const now = new Date();
    const offsetHours = now.getTimezoneOffset() / 60;
    console.log(`📍 Local timezone is ${offsetHours} hours behind UTC`);
    
    // Get all metrics that need adjustment
    const result = await db.query('SELECT * FROM metrics ORDER BY id');
    console.log(`📊 Found ${result.rows.length} metrics to adjust`);
    
    if (result.rows.length === 0) {
      console.log('✅ No metrics found to backfill');
      return;
    }
    
    // Show current timestamps
    console.log('\n📋 Current timestamps:');
    result.rows.forEach(metric => {
      const current = new Date(metric.recorded_at);
      console.log(`  ID ${metric.id}: ${current.toISOString()} (${current.toLocaleString()})`);
    });
    
    // Calculate new timestamps (subtract offset to make them local)
    const updates = result.rows.map(metric => {
      const current = new Date(metric.recorded_at);
      const adjusted = new Date(current.getTime() - (offsetHours * 60 * 60 * 1000));
      return {
        id: metric.id,
        current: current.toISOString(),
        adjusted: adjusted.toISOString(),
        currentLocal: current.toLocaleString(),
        adjustedLocal: adjusted.toLocaleString()
      };
    });
    
    // Show what changes will be made
    console.log('\n📝 Proposed changes:');
    updates.forEach(update => {
      console.log(`  ID ${update.id}:`);
      console.log(`    From: ${update.current} (${update.currentLocal})`);
      console.log(`    To:   ${update.adjusted} (${update.adjustedLocal})`);
    });
    
    // Apply the updates
    console.log('\n🔄 Applying timestamp adjustments...');
    for (const update of updates) {
      await db.query(
        'UPDATE metrics SET recorded_at = $1 WHERE id = $2',
        [update.adjusted, update.id]
      );
      console.log(`  ✅ Updated metric ID ${update.id}`);
    }
    
    // Verify the changes
    const verifyResult = await db.query('SELECT * FROM metrics ORDER BY id');
    console.log('\n✅ Verification - Updated timestamps:');
    verifyResult.rows.forEach(metric => {
      const updated = new Date(metric.recorded_at);
      console.log(`  ID ${metric.id}: ${updated.toISOString()} (${updated.toLocaleString()})`);
    });
    
    console.log('\n🎉 Timezone backfill completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during backfill:', error.message);
    throw error;
  }
}

// Run the backfill
backfillTimezones()
  .then(() => {
    console.log('🏁 Backfill script finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Backfill script failed:', error);
    process.exit(1);
  })
  .finally(() => {
    db.end();
  });