/**
 * Run automated grooming on a team's knowledge graph.
 *
 * Usage: node scripts/run-grooming.js [teamId]
 * Default: Full Uproar team
 */

import '../db.js';
import * as TripleGroomingService from '../services/TripleGroomingService.js';
import * as TripleService from '../services/TripleService.js';
import db from '../db.js';

const teamId = process.argv[2] || '824c6245-231f-4969-95a1-9e1be7217cc7';

async function run() {
  // Before stats
  const before = await TripleService.getGraphStats(teamId);
  console.log(`\n=== BEFORE GROOMING ===`);
  console.log(`Concepts: ${before.totalConcepts}`);
  console.log(`Triples: ${before.totalTriples}`);
  console.log(`Contexts: ${before.totalContexts}`);
  console.log(`Orphans: ${before.orphanConcepts}`);

  // Run grooming
  console.log(`\n=== GROOMING ===`);
  const result = await TripleGroomingService.groomGraph(teamId);

  // After stats
  const after = await TripleService.getGraphStats(teamId);
  console.log(`\n=== AFTER GROOMING ===`);
  console.log(`Concepts: ${after.totalConcepts} (${after.totalConcepts - before.totalConcepts >= 0 ? '+' : ''}${after.totalConcepts - before.totalConcepts})`);
  console.log(`Triples: ${after.totalTriples} (${after.totalTriples - before.totalTriples >= 0 ? '+' : ''}${after.totalTriples - before.totalTriples})`);
  console.log(`Orphans: ${after.orphanConcepts} (${after.orphanConcepts - before.orphanConcepts >= 0 ? '+' : ''}${after.orphanConcepts - before.orphanConcepts})`);

  console.log(`\n=== REPORT ===`);
  console.log(`Duration: ${Math.round(result.durationMs / 1000)}s`);
  console.log(`Decomposed: ${result.decomposed}`);
  console.log(`Auto-merged: ${result.autoMerged?.length || 0}`);
  if (result.autoMerged?.length > 0) {
    result.autoMerged.forEach(m => console.log(`  ✓ ${m.duplicate} → ${m.canonical}`));
  }
  console.log(`Merge proposals: ${result.mergeProposals?.length || 0}`);
  if (result.mergeProposals?.length > 0) {
    result.mergeProposals.forEach(p => console.log(`  ? ${p.conceptA.name} ≈ ${p.conceptB.name} (${p.similarity})`));
  }
  console.log(`Pruned: ${result.pruned}`);
  console.log(`Contexts discovered: ${result.contextsDiscovered}`);
  console.log(`Inferences proposed: ${result.inferences?.length || 0}`);
  console.log(`Inferences created: ${result.inferencesCreated || 0}`);
  if (result.inferences?.length > 0) {
    result.inferences.forEach(i => console.log(`  ⚡ ${i.statement} (${i.confidence})`));
  }
  console.log(`Relationships refined: ${result.relationshipsRefined}`);
  console.log(`Demand-driven: ${result.demandDriven?.queriesAnalyzed || 0} queries analyzed`);

  await db.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
