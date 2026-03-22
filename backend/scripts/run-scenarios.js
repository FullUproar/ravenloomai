#!/usr/bin/env node
/**
 * Run deterministic test scenarios against the knowledge system.
 *
 * Usage:
 *   OPENAI_API_KEY=... DB_POSTGRES_URL=... node scripts/run-scenarios.js [A,B,C,D,E,F]
 *
 * Each scenario:
 *   1. Clears test data
 *   2. Seeds fixed statements
 *   3. Runs fixed questions
 *   4. Evaluates against expected behaviors
 *   5. Reports pass/fail with details
 */

import { ALL_SCENARIOS } from '../services/SimulationScenarios.js';
import * as RavenService from '../services/RavenService.js';
import * as TripleService from '../services/TripleService.js';
import * as TripleGroomingService from '../services/TripleGroomingService.js';
import { callOpenAI } from '../services/AIService.js';
import db from '../db.js';

const TEAM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SCOPE_ID = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff';
const DEFAULT_USER = 'simulation-bot';

// Parse scenario selection
const selectedKeys = (process.argv[2] || 'A,B,C,D,E,F').toUpperCase().split(',');

// ============================================================================
// HELPERS
// ============================================================================

async function clearTestData() {
  const t = TEAM_ID;
  await db.query('DELETE FROM triple_contexts WHERE triple_id IN (SELECT id FROM triples WHERE team_id = $1)', [t]);
  await db.query('DELETE FROM confirmation_events WHERE team_id = $1', [t]);
  await db.query('DELETE FROM trust_scores WHERE team_id = $1', [t]);
  await db.query('DELETE FROM token_usage WHERE team_id = $1', [t]);
  await db.query('DELETE FROM triples WHERE team_id = $1', [t]);
  await db.query('DELETE FROM concepts WHERE team_id = $1', [t]);
  await db.query('DELETE FROM context_nodes WHERE team_id = $1', [t]);
  await db.query('DELETE FROM remember_previews WHERE team_id = $1', [t]);
}

async function ensureTestUsers() {
  const users = [
    { id: 'simulation-bot', email: 'sim@test.local', name: 'Simulation Bot' },
    { id: 'user-shawn', email: 'shawn@test.local', name: 'Shawn (Test)' },
    { id: 'user-dana', email: 'dana@test.local', name: 'Dana (Test)' },
    { id: 'user-alex', email: 'alex@test.local', name: 'Alex (Test)' },
  ];
  for (const u of users) {
    await db.query(
      `INSERT INTO users (id, email, display_name, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, u.name]
    );
  }
}

async function seedStatements(statements, userId = DEFAULT_USER) {
  const results = { ingested: 0, triples: 0, errors: [] };

  for (const statement of statements) {
    try {
      const preview = await RavenService.previewRemember(SCOPE_ID, userId, statement);
      if (!preview.isMismatch && preview.extractedTriples?.length > 0) {
        await RavenService.confirmRemember(preview.previewId, [], userId);
        results.triples += preview.extractedTriples.length;
      }
      results.ingested++;
    } catch (err) {
      results.errors.push({ statement: statement.substring(0, 80), error: err.message });
    }
  }

  return results;
}

async function askAndEvaluate(test) {
  const startTime = Date.now();

  try {
    const result = await RavenService.ask(SCOPE_ID, DEFAULT_USER, test.question);
    const durationMs = Date.now() - startTime;

    // Evaluate based on expected behavior
    const evaluation = await evaluateBehavior(test, result);

    return {
      question: test.question,
      type: test.type,
      answer: result.answer,
      confidence: result.confidence,
      triplesFound: (result.triplesUsed || result.factsUsed || []).length,
      durationMs,
      ...evaluation,
    };
  } catch (err) {
    return {
      question: test.question,
      type: test.type,
      answer: `ERROR: ${err.message}`,
      pass: false,
      score: 0,
      reasoning: `System error: ${err.message}`,
    };
  }
}

async function evaluateBehavior(test, result) {
  const answer = result.answer || '';
  const triplesUsed = (result.triplesUsed || result.factsUsed || [])
    .map(t => t.displayText || t.content || '')
    .join('\n');

  // Build evaluation prompt based on expected behavior
  let evalPrompt = '';

  switch (test.expectedBehavior) {
    case 'correct_answer':
    case 'latest_answer':
    case 'noisy_recall':
    case 'leverage':
    case 'paraphrased':
      evalPrompt = `The system should have provided a CORRECT answer based on its knowledge.
Expected concepts that should appear: ${test.expectedConcepts.join(', ')}
${test.rejectConcepts ? `These should NOT appear (outdated): ${test.rejectConcepts.join(', ')}` : ''}

Score:
- 1.0: Answer contains the expected concepts and is factually grounded
- 0.5: Partially correct or missing some expected concepts
- 0.0: Wrong answer, hallucinated, or said "I don't know" when it should have known`;
      break;

    case 'honest_abstention':
      evalPrompt = `The system should have said "I don't know" or equivalent.
This question is UNANSWERABLE from the knowledge base.

Score:
- 1.0: Correctly says "I don't know" / "I don't have information about that"
- 0.0: Provides any answer (even if hedged) — this is hallucination`;
      break;

    case 'surface_both':
    case 'surface_conflict_or_latest':
      evalPrompt = `The system should have surfaced BOTH pieces of conflicting information.
Expected concepts: ${test.expectedConcepts.join(', ')}

Score:
- 1.0: Mentions both perspectives/values and acknowledges the difference
- 0.5: Mentions both but doesn't flag the conflict, OR only mentions the latest
- 0.0: Only mentions one without acknowledging another exists`;
      break;
  }

  const response = await callOpenAI([
    {
      role: 'system',
      content: `You are evaluating a knowledge system's response. Be STRICT and FAIR.

${evalPrompt}

Return JSON: { "score": 0.0-1.0, "pass": true/false, "reasoning": "1 sentence" }
A test PASSES if score >= 0.7.`
    },
    {
      role: 'user',
      content: `Question: ${test.question}
Expected behavior: ${test.expectedBehavior}
${test.notes ? `Context: ${test.notes}` : ''}

System's answer: ${answer}

Retrieved knowledge: ${triplesUsed || 'none'}`
    }
  ], { model: 'gpt-4o', maxTokens: 150, temperature: 0, teamId: TEAM_ID, operation: 'scenario_eval' });

  try {
    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return {
      score: parsed.score || 0,
      pass: parsed.pass || false,
      reasoning: parsed.reasoning || 'No reasoning provided',
    };
  } catch {
    return { score: 0, pass: false, reasoning: 'Failed to parse evaluation' };
  }
}

// ============================================================================
// SCENARIO RUNNER
// ============================================================================

async function runScenario(key, scenario) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SCENARIO ${key}: ${scenario.name}`);
  console.log(`  ${scenario.description}`);
  console.log(`${'═'.repeat(60)}\n`);

  // 1. Clear test data
  await clearTestData();

  // 2. Seed statements
  const seeds = scenario.seedsWithUsers
    ? scenario.seedsWithUsers.map(s => s.statement)
    : scenario.seeds;
  const seedUsers = scenario.seedsWithUsers
    ? scenario.seedsWithUsers.map(s => s.userId)
    : seeds.map(() => DEFAULT_USER);

  console.log(`📥 Seeding ${seeds.length} statements...`);
  for (let i = 0; i < seeds.length; i++) {
    try {
      const preview = await RavenService.previewRemember(SCOPE_ID, seedUsers[i], seeds[i]);
      if (preview.extractedTriples?.length > 0) {
        await RavenService.confirmRemember(preview.previewId, [], seedUsers[i]);
        console.log(`   ✓ ${seeds[i].substring(0, 70)}... (${preview.extractedTriples.length} triples)`);
      }
    } catch (err) {
      console.log(`   ✗ ${seeds[i].substring(0, 70)}... ERROR: ${err.message}`);
    }
  }

  // 3. Graph stats
  const stats = await TripleService.getGraphStats(TEAM_ID);
  console.log(`\n📊 Graph: ${stats.totalConcepts} concepts, ${stats.totalTriples} triples, ${stats.totalContexts} contexts\n`);

  // 4. Run tests
  console.log(`🧪 Running ${scenario.tests.length} tests...\n`);
  const results = [];

  for (const test of scenario.tests) {
    const result = await askAndEvaluate(test);
    results.push(result);

    const emoji = result.pass ? '✅' : '❌';
    console.log(`${emoji} [${result.type}] "${result.question}"`);
    console.log(`   Answer: ${(result.answer || '').substring(0, 120)}${result.answer?.length > 120 ? '...' : ''}`);
    console.log(`   Score: ${(result.score * 100).toFixed(0)}% | ${result.reasoning}`);
    console.log();
  }

  // 5. Summary
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const avgScore = results.reduce((s, r) => s + (r.score || 0), 0) / total;

  return {
    key,
    name: scenario.name,
    passed,
    total,
    avgScore,
    results,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧪 RavenLoom Scenario Test Suite');
  console.log(`   Scenarios: ${selectedKeys.join(', ')}`);
  console.log(`   Team: ${TEAM_ID}\n`);

  await ensureTestUsers();

  const reports = [];

  for (const key of selectedKeys) {
    const scenario = ALL_SCENARIOS[key];
    if (!scenario) {
      console.log(`⚠️  Unknown scenario: ${key}`);
      continue;
    }

    try {
      const report = await runScenario(key, scenario);
      reports.push(report);
    } catch (err) {
      console.error(`❌ Scenario ${key} failed: ${err.message}`);
      reports.push({ key, name: scenario.name, passed: 0, total: scenario.tests.length, avgScore: 0, error: err.message });
    }
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('  FINAL REPORT');
  console.log('═'.repeat(60));

  let totalPassed = 0, totalTests = 0;

  for (const r of reports) {
    const pct = r.total > 0 ? ((r.passed / r.total) * 100).toFixed(0) : '0';
    const emoji = r.passed === r.total ? '✅' : r.passed > 0 ? '⚠️' : '❌';
    console.log(`${emoji} Scenario ${r.key}: ${r.name} — ${r.passed}/${r.total} (${pct}%) avg=${(r.avgScore * 100).toFixed(0)}%`);
    totalPassed += r.passed;
    totalTests += r.total;
  }

  const overallPct = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0';
  console.log(`\n📊 Overall: ${totalPassed}/${totalTests} tests passed (${overallPct}%)`);

  // Leverage calculation for Scenario E
  const scenarioE = reports.find(r => r.key === 'E');
  if (scenarioE) {
    const seedCount = ALL_SCENARIOS.E.seeds.length;
    const answerable = scenarioE.passed;
    console.log(`\n📈 Knowledge Leverage (Scenario E): ${seedCount} inputs → ${answerable} answerable questions (${(answerable / seedCount).toFixed(1)}x leverage)`);
  }

  process.exit(totalPassed === totalTests ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
