/**
 * Query Stress Test — simulate diverse user queries to find retrieval gaps
 *
 * Tests: factual, broad, timeline, cross-domain, paraphrased, adversarial,
 * implied questions, corrections, edge cases.
 *
 * Grades each answer and reports failures for iteration.
 */

import '../db.js';
import * as RavenService from '../services/RavenService.js';
import db from '../db.js';

const SCOPE_ID = '1376af3b-fd62-4346-afdf-051fe9866504';
const USER_ID = 'NLNDJiASfeXipbAgssyelUL9Rxo2';

const QUERIES = [
  // ── Direct factual ──────────────────────────────────────────────
  { q: 'When does Fugly\'s Mayhem Machine launch?', expect: 'July|2026', type: 'factual' },
  { q: 'Who manufactures our games?', expect: 'Panda|manufactur|China', type: 'factual' },
  { q: 'What is Afterroar HQ?', expect: 'game night|platform|planning', type: 'factual' },
  { q: 'How much does Afterroar Pro cost?', expect: '$5|5/month|per month', type: 'factual' },
  { q: 'What is impeachcolleen.com?', expect: 'HOA|Colleen', type: 'factual' },
  { q: 'How many SKUs does Fugly\'s Mayhem Machine have?', expect: '4', type: 'factual' },
  { q: 'What is the Fuglyverse?', expect: 'IP|expansion|licensing', type: 'factual' },
  { q: 'Where is our manufacturer located?', expect: 'China|Shenzhen|domestic|Panda|manufacturer', type: 'factual' },

  // ── Listing / aggregation ───────────────────────────────────────
  { q: 'What products do we sell?', expect: 'Fugly|Top This|Afterroar|Trolls', type: 'listing' },
  { q: 'What games are we working on?', expect: 'Fugly|HOA|Top This|Trolls|BattleCard|Chaos', type: 'listing' },
  { q: 'What are our revenue targets?', expect: '\\$10|\\$100|million', type: 'listing' },
  { q: 'What Kickstarter campaigns are planned?', expect: 'HOA|BattleCard|2027', type: 'listing' },

  // ── Timeline ────────────────────────────────────────────────────
  { q: 'What are all our upcoming deadlines?', expect: 'July|May|April|2026|2027|2028', type: 'timeline' },
  { q: 'What launches in 2026?', expect: 'May|July|Fall|Mayhem|Top This|Afterroar', type: 'timeline' },
  { q: 'What is the manufacturing timeline?', expect: '6 weeks|weeks|proof|approval|sea freight', type: 'timeline' },

  // ── Cross-domain ────────────────────────────────────────────────
  { q: 'Who handles manufacturing and what are our brand principles?', expect: 'manufactur|brand|humor|irreverent', type: 'cross_domain' },
  { q: 'What are our pricing strategy and launch dates?', expect: '\\$|price|launch|date|July|May', type: 'cross_domain' },

  // ── Exhaustive ──────────────────────────────────────────────────
  { q: 'Tell me everything about the Monthly Mailer', expect: 'subscription|mailer|bonus|card', type: 'exhaustive' },
  { q: 'What do we know about BattleCard Rejects?', expect: 'TCG|parody|Kickstarter|card', type: 'exhaustive' },
  { q: 'Tell me everything about HOA the Game', expect: 'HOA|Colleen|impeach|Kickstarter', type: 'exhaustive' },

  // ── Paraphrased / casual ────────────────────────────────────────
  { q: 'What\'s the deal with that chaos game app?', expect: 'Chaos Agent|mobile|app', type: 'paraphrase' },
  { q: 'How many venues did we find?', expect: '11,576|687|4,914|2,373|venue', type: 'paraphrase' },
  { q: 'What\'s Shawn\'s long-term vision?', expect: '\\$100|Fuglyverse|IP|billion|empire', type: 'paraphrase' },
  { q: 'What card games do we make?', expect: 'Hack|Splice|Top This|BattleCard|Mayhem', type: 'paraphrase' },

  // ── Implied questions ───────────────────────────────────────────
  { q: 'I forget when we need to send files to the manufacturer', expect: 'April|manufacturer|proof|domestic', type: 'implied' },
  { q: 'Remind me about the Kickstarter plans', expect: 'HOA|BattleCard|2027|Kickstarter', type: 'implied' },
  { q: 'I\'m not sure about the Afterroar pricing tiers', expect: 'Free|Pro|\\$5|Venue|\\$10', type: 'implied' },

  // ── Unanswerable ────────────────────────────────────────────────
  { q: 'What is the weather like today?', expect: 'dont_know', type: 'unanswerable' },
  { q: 'How do I bake a cake?', expect: 'dont_know', type: 'unanswerable' },
  { q: 'What is our insurance provider?', expect: 'dont_know', type: 'unanswerable' },
  { q: 'Who won the Super Bowl?', expect: 'dont_know', type: 'unanswerable' },

  // ── Edge cases ──────────────────────────────────────────────────
  { q: 'Fugly', expect: 'Fugly|Mayhem|cat|game', type: 'single_word' },
  { q: 'Top This', expect: 'Top This|Crazy 8|card|reskin', type: 'two_word' },
  { q: 'HYD', expect: 'Hack Your Deck|card|mod', type: 'abbreviation' },

  // ── Multi-hop reasoning ─────────────────────────────────────────
  { q: 'How long until Fugly\'s Mayhem Machine ships after we approve proofs?', expect: '6 weeks|sea freight|logistics', type: 'multi_hop' },
  { q: 'What products launch on the doors-open date?', expect: 'Top This|Trolls|Afterroar|May 1', type: 'multi_hop' },

  // ── Adversarial / tricky ────────────────────────────────────────
  { q: 'What DON\'T we know about our products?', expect: 'dont_know_or_gaps', type: 'adversarial' },
  { q: 'Is Fugly\'s Mayhem Machine ready to ship?', expect: 'not yet|July|2026|proof|approval', type: 'adversarial' },
  { q: 'What happens if the Monthly Mailer subscription flops?', expect: 'convention|giveaway|expansion|bonus', type: 'adversarial' },
  { q: 'Are we profitable?', expect: 'dont_know', type: 'adversarial' },
  { q: 'What\'s the biggest risk to our timeline?', expect: 'manufactur|proof|deadline|lead time', type: 'adversarial' },
  { q: 'Summarize our company in one paragraph', expect: 'Full Uproar|game|tabletop', type: 'adversarial' },
  { q: 'What changed recently?', expect: 'recent|change|date|2025|2026|effective', type: 'adversarial' },
  { q: 'How does Afterroar HQ make money?', expect: 'Free|Pro|\\$5|Venue|\\$10|monetiz|tier', type: 'adversarial' },
];

async function run() {
  console.log(`\n🔍 Query Stress Test — ${QUERIES.length} queries\n`);

  let pass = 0, fail = 0, errors = 0;
  const failures = [];

  for (const { q, expect, type } of QUERIES) {
    process.stdout.write(`[${type.padEnd(12)}] "${q.substring(0, 50)}..." `);
    try {
      const result = await RavenService.ask(SCOPE_ID, USER_ID, q);
      const answer = result.answer || '';
      const conf = result.confidence;

      // Grade
      let passed = false;
      if (expect === 'dont_know' || expect === 'dont_know_or_gaps' || expect === 'dont_know_or_partial') {
        passed = conf <= 0.5 || /don.t have|no confirmed|not sure|don.t know|gap|missing/i.test(answer);
      } else if (expect === 'multiple products listed' || expect === 'multiple dates') {
        // Count distinct items — should have 3+
        const bullets = (answer.match(/\*\*[^*]+\*\*/g) || []).length + (answer.match(/^-/gm) || []).length;
        passed = bullets >= 3 || answer.length > 200;
      } else if (expect === 'roles or people' || expect === 'some info about Fugly' || expect === 'something reasonable' || expect === 'price points') {
        passed = conf > 0.3 && answer.length > 30;
      } else {
        // Check if any expected keyword appears
        const keywords = expect.split('|');
        passed = keywords.some(k => answer.toLowerCase().includes(k.toLowerCase()));
      }

      if (passed) {
        console.log(`✅ (${conf})`);
        pass++;
      } else {
        console.log(`❌ (${conf}) → ${answer.substring(0, 100)}...`);
        fail++;
        failures.push({ q, type, expect, got: answer.substring(0, 300), confidence: conf });
      }
    } catch (err) {
      console.log(`💥 ERROR: ${err.message.substring(0, 80)}`);
      errors++;
      failures.push({ q, type, expect, got: `ERROR: ${err.message}`, confidence: 0 });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RESULTS: ${pass}/${QUERIES.length} passed (${Math.round(pass/QUERIES.length*100)}%)`);
  console.log(`   ✅ Pass: ${pass}  ❌ Fail: ${fail}  💥 Error: ${errors}`);

  if (failures.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('❌ FAILURES:');
    failures.forEach(f => {
      console.log(`\n  [${f.type}] "${f.q}"`);
      console.log(`  Expected: ${f.expect}`);
      console.log(`  Got (${f.confidence}): ${f.got}`);
    });
  }

  await db.end();
  process.exit(failures.length > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
