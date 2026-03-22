#!/usr/bin/env node
/**
 * Run simulation locally against the production DB.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... DB_POSTGRES_URL=postgres://... node scripts/run-simulation.js [persona] [cycles]
 *
 * Example:
 *   node scripts/run-simulation.js shawn 1
 *   node scripts/run-simulation.js dana,shawn,alex 2
 */

import * as SimulationService from '../services/SimulationService.js';
import * as TripleService from '../services/TripleService.js';
import * as TripleGroomingService from '../services/TripleGroomingService.js';

const TEAM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SCOPE_ID = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff';

const personas = (process.argv[2] || 'shawn').split(',');
const cycles = parseInt(process.argv[3] || '1');

console.log(`\n🧪 RavenLoom Simulation`);
console.log(`   Personas: ${personas.join(', ')}`);
console.log(`   Cycles: ${cycles}`);
console.log(`   Team: ${TEAM_ID}`);
console.log(`   Scope: ${SCOPE_ID}\n`);

async function main() {
  // Pre-check: graph stats
  const statsBefore = await TripleService.getGraphStats(TEAM_ID);
  console.log(`📊 Before: ${statsBefore.totalConcepts} concepts, ${statsBefore.totalTriples} triples, ${statsBefore.totalContexts} contexts\n`);

  // Run simulation
  const report = await SimulationService.runSimulation(TEAM_ID, SCOPE_ID, {
    personas,
    cycles,
    groomBetweenCycles: true
  });

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('📋 SIMULATION REPORT');
  console.log('='.repeat(60));
  console.log(`Personas: ${report.persona}`);
  console.log(`Cycles: ${report.cycles}`);
  console.log(`Remembered: ${report.rememberedCount} triples`);
  console.log(`Questions asked: ${report.questionsAsked}`);
  console.log(`Correct answers: ${report.correctAnswers}/${report.questionsAsked}`);
  console.log(`Multi-hop: ${report.multiHopSuccesses}/${report.multiHopAttempts}`);
  console.log(`Overall score: ${(report.overallScore * 100).toFixed(1)}%`);

  if (report.graphStats) {
    console.log(`\n📊 Graph: ${report.graphStats.totalConcepts} concepts, ${report.graphStats.totalTriples} triples, ${report.graphStats.totalContexts} contexts`);
    console.log(`   Orphans: ${report.graphStats.orphanConcepts}, Chunky: ${report.graphStats.chunkyTriples}, Universal: ${report.graphStats.universalTriples}`);
  }

  if (report.evaluations?.length > 0) {
    console.log('\n📝 Evaluations:');
    for (const ev of report.evaluations) {
      const score = ((ev.accuracy || 0) + (ev.completeness || 0) + (ev.relevance || 0)) / 3;
      const emoji = score >= 0.7 ? '✅' : score >= 0.4 ? '⚠️' : '❌';
      console.log(`${emoji} [${ev.persona}] "${ev.question}"`);
      console.log(`   Answer: ${(ev.answer || '').substring(0, 100)}...`);
      console.log(`   Accuracy: ${((ev.accuracy || 0) * 100).toFixed(0)}%, Completeness: ${((ev.completeness || 0) * 100).toFixed(0)}%, Relevance: ${((ev.relevance || 0) * 100).toFixed(0)}%`);
      if (ev.multiHopSuccess != null) {
        console.log(`   Multi-hop: ${((ev.multiHopSuccess || 0) * 100).toFixed(0)}%`);
      }
      if (ev.reasoning) console.log(`   Reasoning: ${ev.reasoning}`);
      console.log();
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Simulation failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
