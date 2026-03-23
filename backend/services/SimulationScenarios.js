/**
 * SimulationScenarios - Deterministic test scenarios for RavenLoom
 *
 * Each scenario has:
 * - Fixed seed data (statements to remember)
 * - Fixed test questions with expected behaviors
 * - Scoring criteria specific to the scenario
 *
 * This is NOT LLM-generated data. Tests are reproducible and fair.
 * Anti-nepotism: questions use different language than seed data.
 */

// ============================================================================
// SCENARIO A: Clean extraction + recall (baseline)
// ============================================================================

export const SCENARIO_A = {
  name: 'Clean Recall',
  description: 'Basic extraction and retrieval. Can the system remember and recall clean, unambiguous facts?',
  seeds: [
    'Fugly\'s Mayhem Machine launches on April 15, 2024. It\'s a card game modifier that adds chaos tokens to any existing card game.',
    'Our manufacturing partner is Panda Games Manufacturing, based in Shenzhen, China. Production lead time is 6 weeks.',
    'Revenue target for 2024 is $750,000, which is a 25% increase over 2023.',
    'BattleCard Rejects is a satirical trading card game parody releasing in Q3 2024, priced at $24.99.',
    'Top This is a fast-paced stacking card game where players race to build the tallest tower. Best for 3-6 players.',
    'Jamie handles all social media marketing. Contact her at jamie@fulluproar.com for campaign questions.',
  ],
  tests: [
    {
      question: 'When does the chaos card game ship?',
      type: 'direct_paraphrased',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['Fugly\'s Mayhem Machine', 'April 15', '2024'],
      notes: 'Tests paraphrased recall — "chaos card game" should map to Fugly\'s Mayhem Machine',
    },
    {
      question: 'Who makes our games and how long does production take?',
      type: 'multi_hop',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['Panda Games', 'Shenzhen', '6 weeks'],
      notes: 'Requires connecting manufacturer identity with lead time',
    },
    {
      question: 'How many people can play Top This?',
      type: 'direct',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['3-6 players'],
      notes: 'Simple direct recall',
    },
    {
      question: 'What is the retail price of our parody card game?',
      type: 'direct_paraphrased',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['$24.99', 'BattleCard Rejects'],
      notes: '"parody card game" should map to BattleCard Rejects',
    },
    {
      question: 'Who should I talk to about our Instagram strategy?',
      type: 'multi_hop',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['Jamie', 'social media'],
      notes: 'Instagram → social media → Jamie. Tests concept generalization.',
    },
    {
      question: 'What is our CEO\'s favorite color?',
      type: 'unanswerable',
      expectedBehavior: 'honest_abstention',
      expectedConcepts: [],
      notes: 'System must say "I don\'t know" — no guessing',
    },
    {
      question: 'How much revenue did we make in 2022?',
      type: 'unanswerable',
      expectedBehavior: 'honest_abstention',
      expectedConcepts: [],
      notes: 'We have 2024 targets and 2023 reference, but no 2022 data. Must not infer.',
    },
  ],
};

// ============================================================================
// SCENARIO B: Contradictory updates (supersession)
// ============================================================================

export const SCENARIO_B = {
  name: 'Contradictory Updates',
  description: 'Can the system handle knowledge that changes over time? Second statement should supersede first.',
  seeds: [
    'Hack Your Deck is scheduled to launch on July 1, 2024.',
    'BattleCard Rejects will be manufactured by PrintCo in Austin, Texas.',
    // These come AFTER the above (simulate temporal ordering)
    'UPDATE: Hack Your Deck launch has been pushed back to September 15, 2024 due to manufacturing delays.',
    'We\'ve switched manufacturers for BattleCard Rejects — now using GamePrint in Portland, Oregon for better quality.',
  ],
  tests: [
    {
      question: 'When does Hack Your Deck come out?',
      type: 'supersession',
      expectedBehavior: 'latest_answer',
      expectedConcepts: ['September 15', '2024'],
      rejectConcepts: ['July 1'],
      notes: 'Must answer with the UPDATED date, not the original',
    },
    {
      question: 'Who manufactures BattleCard Rejects?',
      type: 'supersession',
      expectedBehavior: 'latest_answer',
      expectedConcepts: ['GamePrint', 'Portland'],
      rejectConcepts: ['PrintCo', 'Austin'],
      notes: 'Must answer with the UPDATED manufacturer',
    },
    {
      question: 'Why was Hack Your Deck delayed?',
      type: 'direct',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['manufacturing delays'],
      notes: 'The reason for the update should be retrievable',
    },
  ],
};

// ============================================================================
// SCENARIO C: Multi-user conflict
// ============================================================================

export const SCENARIO_C = {
  name: 'Multi-User Conflict',
  description: 'Two users provide conflicting information. System should surface the conflict, not silently pick one.',
  seedsWithUsers: [
    { userId: 'user-shawn', statement: 'All client contracts use Net 30 payment terms.' },
    { userId: 'user-dana', statement: 'Enterprise clients get Net 15 payment terms. Standard clients stay at Net 30.' },
    { userId: 'user-shawn', statement: 'The holiday party is on December 20th at the downtown venue.' },
    { userId: 'user-dana', statement: 'I heard the holiday party is December 18th at the rooftop bar.' },
  ],
  tests: [
    {
      question: 'What are our payment terms?',
      type: 'conflict_surfacing',
      expectedBehavior: 'surface_both',
      expectedConcepts: ['Net 30', 'Net 15', 'enterprise'],
      notes: 'Must mention BOTH terms and the distinction. Not silently pick one.',
    },
    {
      question: 'When is the holiday party?',
      type: 'conflict_surfacing',
      expectedBehavior: 'surface_conflict_or_latest',
      expectedConcepts: ['December 18', 'December 20'],
      notes: 'Should either surface both dates or prefer the more recent/specific one',
    },
  ],
};

// ============================================================================
// SCENARIO D: Noisy/messy input
// ============================================================================

export const SCENARIO_D = {
  name: 'Noisy Input',
  description: 'Can the system extract knowledge from messy, conversational, typo-laden input?',
  seeds: [
    'so yeah we basically decided that the card game thing, fuglys mayhem machine or whatever, it ships in april. the 15th i think.',
    'talked to panda games yesterday, they said 6 weeks for production once we send final files. thats our manufacturer btw, theyre in shenzhen',
    'FYI battlecard rejects pricing is $24.99 retail, $12 wholesale. sarah confirmed this in the meeting',
    'top this = 3 to 6 players, takes about 20 min per round, its the stacking one',
  ],
  tests: [
    {
      question: 'When does Fugly\'s Mayhem Machine launch?',
      type: 'noisy_recall',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['April', '15'],
      notes: 'System should parse through the noise and extract the date',
    },
    {
      question: 'What is the production timeline?',
      type: 'noisy_recall',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['6 weeks', 'Panda Games'],
      notes: 'Should connect manufacturer with lead time despite messy input',
    },
    {
      question: 'How much does BattleCard Rejects cost at wholesale?',
      type: 'noisy_recall',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['$12'],
      notes: 'Should extract the wholesale price specifically',
    },
    {
      question: 'How long is a game of Top This?',
      type: 'noisy_recall',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['20 min'],
      notes: 'Should parse "takes about 20 min per round"',
    },
  ],
};

// ============================================================================
// SCENARIO E: Knowledge leverage measurement
// ============================================================================

export const SCENARIO_E = {
  name: 'Knowledge Leverage',
  description: 'Measure the ratio of useful outputs to inputs. How many questions can N statements answer?',
  seeds: [
    'Full Uproar Games was founded in 2021 by Shawn in Indianapolis, Indiana. We make tabletop games.',
    'Our product line includes: Fugly\'s Mayhem Machine (card game modifier, $19.99), Hack Your Deck (game mod toolkit, $14.99), BattleCard Rejects (TCG parody, $24.99), HOA the Game (board game, $34.99), Top This (card game, $12.99), and Trolls vs Idols (social deduction, $29.99).',
    'Panda Games Manufacturing in Shenzhen handles all our physical production. Lead time is 6 weeks, minimum order is 5000 units.',
  ],
  tests: [
    // From just 3 inputs, can the system answer all of these?
    { question: 'Where is the company based?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['Indianapolis'] },
    { question: 'When was the company founded?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['2021'] },
    { question: 'How much does HOA the Game cost?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['$34.99'] },
    { question: 'What is our cheapest product?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['Top This', '$12.99'] },
    { question: 'What is the minimum production run?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['5000'] },
    { question: 'Who founded the company?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['Shawn'] },
    { question: 'How many products do we sell?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['six', '6'] },
    { question: 'What kind of game is Trolls vs Idols?', type: 'leverage', expectedBehavior: 'correct_answer', expectedConcepts: ['social deduction'] },
  ],
};

// ============================================================================
// SCENARIO F: Paraphrased recall (language diversity)
// ============================================================================

export const SCENARIO_F = {
  name: 'Paraphrased Recall',
  description: 'Users ask about stored knowledge using completely different words. Tests semantic retrieval.',
  seeds: [
    'Fugly\'s Mayhem Machine introduces "Chaos Tokens" that randomly alter game rules mid-play.',
    'Our eco-friendly packaging initiative uses 100% recycled cardboard and soy-based inks for all products.',
    'The company reached 50,000 total units sold across all products in November 2023.',
    'Afterroar HQ is our digital community platform launching in 2025 with forums, tutorials, and live events.',
  ],
  tests: [
    {
      question: 'What makes the gameplay unpredictable in that modifier game?',
      type: 'paraphrased',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['Chaos Tokens', 'randomly', 'rules'],
      notes: '"unpredictable" → Chaos Tokens. "modifier game" → Fugly\'s.',
    },
    {
      question: 'Are our boxes environmentally friendly?',
      type: 'paraphrased',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['recycled', 'soy-based', 'eco-friendly'],
      notes: '"boxes" → packaging. "environmentally friendly" → eco-friendly.',
    },
    {
      question: 'How many games have we shipped total?',
      type: 'paraphrased',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['50,000'],
      notes: '"shipped" → "sold". "total" → "across all products".',
    },
    {
      question: 'Do we have an online space where players can hang out?',
      type: 'paraphrased',
      expectedBehavior: 'correct_answer',
      expectedConcepts: ['Afterroar HQ', '2025', 'community'],
      notes: '"online space" → "digital community platform". "hang out" → forums/events.',
    },
  ],
};

// ============================================================================
// ALL SCENARIOS
// ============================================================================

export const ALL_SCENARIOS = {
  A: SCENARIO_A,
  B: SCENARIO_B,
  C: SCENARIO_C,
  D: SCENARIO_D,
  E: SCENARIO_E,
  F: SCENARIO_F,
};

export default ALL_SCENARIOS;
