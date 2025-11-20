import { test, expect } from '@playwright/test';

/**
 * Persona-Based User Tests
 *
 * Tests AI conversation quality with different user personas, goals, and interaction styles.
 * This ensures RavenLoom provides value across the full spectrum of users.
 */

test.describe('Virtual User Personas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('text=Your Projects', { timeout: 15000 });

    // Navigate to project and work view
    await page.click('text=Test an online app that I built');
    await page.waitForLoadState('networkidle');
    await page.locator('nav button:has-text("Work")').click();
    await page.waitForTimeout(2000);
  });

  /**
   * PERSONA 1: The Overwhelmed Founder
   * - Juggling multiple priorities
   * - Feeling scattered and anxious
   * - Needs help prioritizing and saying no
   * - Communication: Rushed, stressed, asking for direction
   */
  test('Persona: The Overwhelmed Founder', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n👤 PERSONA: The Overwhelmed Founder');
    console.log('Goal: Launch MVP while juggling client work and hiring');
    console.log('Pain Point: Everything feels urgent, drowning in tasks\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    const conversation = [
      {
        user: "I have 3 client projects due this week, I need to hire a developer, AND I'm trying to launch my product. I don't even know where to start.",
        expectation: "Empathy + Prioritization framework"
      },
      {
        user: "Client work pays the bills but the product is my future. How do I balance this?",
        expectation: "Strategic advice on time allocation"
      },
      {
        user: "Ok but realistically I only have 2 hours today for the product. What should I focus on?",
        expectation: "Concrete, actionable next step"
      },
      {
        user: "That makes sense. Can you help me say no to some of these other things?",
        expectation: "Frameworks for declining/delegating"
      }
    ];

    for (let i = 0; i < conversation.length; i++) {
      console.log(`\n💬 User: "${conversation[i].user}"`);
      console.log(`📊 Expecting: ${conversation[i].expectation}`);

      await input.fill(conversation[i].user);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      await page.screenshot({
        path: `tests/screenshots/persona-overwhelmed-founder-${i + 1}.png`,
        fullPage: true
      });

      console.log('✓ Response captured');
    }

    console.log('\n✅ Overwhelmed Founder persona test complete');
  });

  /**
   * PERSONA 2: The Perfectionist Procrastinator
   * - Analysis paralysis
   * - Fear of starting because it won't be perfect
   * - Needs permission to ship "good enough"
   * - Communication: Detailed, anxious, over-thinking
   */
  test('Persona: The Perfectionist Procrastinator', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n👤 PERSONA: The Perfectionist Procrastinator');
    console.log('Goal: Ship a side project they\'ve been working on for 6 months');
    console.log('Pain Point: Nothing ever feels "ready" to launch\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    const conversation = [
      {
        user: "I've been working on this project for 6 months and I keep finding more things to improve before launch. I don't think it's ready yet.",
        expectation: "Challenge perfectionism, reframe 'ready'"
      },
      {
        user: "But what if people find bugs? What if they don't like it? I only get one first impression.",
        expectation: "Reframe failure, encourage iteration"
      },
      {
        user: "You're right. But how do I know what's actually required vs what's nice-to-have?",
        expectation: "MVP framework, launch criteria"
      },
      {
        user: "Ok I'll do it. But I'm nervous. What if it flops?",
        expectation: "Encouragement + realistic expectations"
      }
    ];

    for (let i = 0; i < conversation.length; i++) {
      console.log(`\n💬 User: "${conversation[i].user}"`);
      console.log(`📊 Expecting: ${conversation[i].expectation}`);

      await input.fill(conversation[i].user);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      await page.screenshot({
        path: `tests/screenshots/persona-perfectionist-${i + 1}.png`,
        fullPage: true
      });

      console.log('✓ Response captured');
    }

    console.log('\n✅ Perfectionist Procrastinator persona test complete');
  });

  /**
   * PERSONA 3: The Burned Out Builder
   * - Working too hard for too long
   * - Lost motivation and clarity
   * - Needs help reconnecting with their "why"
   * - Communication: Flat, defeated, questioning everything
   */
  test('Persona: The Burned Out Builder', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n👤 PERSONA: The Burned Out Builder');
    console.log('Goal: Regain motivation and finish their project');
    console.log('Pain Point: Exhausted, questioning if it\'s worth it\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    const conversation = [
      {
        user: "I've been grinding for 3 months straight and I'm exhausted. I don't even remember why I'm building this anymore.",
        expectation: "Acknowledge burnout, reconnect with purpose"
      },
      {
        user: "I guess I wanted to solve this problem. But now I just feel tired and behind schedule.",
        expectation: "Reframe timeline, suggest recovery"
      },
      {
        user: "Maybe I should just quit. Is that giving up or being realistic?",
        expectation: "Help evaluate objectively, not emotionally"
      },
      {
        user: "You're right. I need a break. But I'm worried I'll lose momentum.",
        expectation: "Sustainable pace advice + small win"
      }
    ];

    for (let i = 0; i < conversation.length; i++) {
      console.log(`\n💬 User: "${conversation[i].user}"`);
      console.log(`📊 Expecting: ${conversation[i].expectation}`);

      await input.fill(conversation[i].user);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      await page.screenshot({
        path: `tests/screenshots/persona-burned-out-${i + 1}.png`,
        fullPage: true
      });

      console.log('✓ Response captured');
    }

    console.log('\n✅ Burned Out Builder persona test complete');
  });

  /**
   * PERSONA 4: The Efficient Executor
   * - Very organized and action-oriented
   * - Wants quick, tactical advice
   * - No fluff, just results
   * - Communication: Brief, direct, to-the-point
   */
  test('Persona: The Efficient Executor', async ({ page }) => {
    test.setTimeout(90000);

    console.log('\n👤 PERSONA: The Efficient Executor');
    console.log('Goal: Optimize workflow and ship faster');
    console.log('Style: Direct, brief, action-oriented\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    const conversation = [
      {
        user: "What's the fastest way to validate my idea?",
        expectation: "Concise, actionable framework"
      },
      {
        user: "Got it. Timeline?",
        expectation: "Specific timeframe + milestones"
      },
      {
        user: "Done. What's next?",
        expectation: "Next clear action"
      },
      {
        user: "Ship by Friday. Possible?",
        expectation: "Realistic assessment + plan"
      }
    ];

    for (let i = 0; i < conversation.length; i++) {
      console.log(`\n💬 User: "${conversation[i].user}"`);
      console.log(`📊 Expecting: ${conversation[i].expectation}`);

      await input.fill(conversation[i].user);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(6000);

      await page.screenshot({
        path: `tests/screenshots/persona-efficient-executor-${i + 1}.png`,
        fullPage: true
      });

      console.log('✓ Response captured');
    }

    console.log('\n✅ Efficient Executor persona test complete');
  });

  /**
   * PERSONA 5: The Habit Builder
   * - Trying to build consistency
   * - Struggles with motivation and streaks
   * - Needs accountability and encouragement
   * - Communication: Honest about failures, seeking support
   */
  test('Persona: The Habit Builder', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n👤 PERSONA: The Habit Builder');
    console.log('Goal: Work on side project 1 hour daily for 30 days');
    console.log('Pain Point: Keeps breaking streaks, feels like a failure\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    const conversation = [
      {
        user: "I'm on day 5 of my daily coding habit. It's hard but I'm doing it!",
        expectation: "Specific encouragement + streak awareness"
      },
      {
        user: "I missed yesterday. I was tired and just... didn't do it. Now my streak is broken.",
        expectation: "Reframe setback, focus on bigger picture"
      },
      {
        user: "You're right, 5 out of 6 days is still good. How do I make sure this doesn't become a pattern?",
        expectation: "Implementation intentions, commitment device"
      },
      {
        user: "Thanks. I'm going to do my session right now actually.",
        expectation: "Encouragement + accountability check-in offer"
      }
    ];

    for (let i = 0; i < conversation.length; i++) {
      console.log(`\n💬 User: "${conversation[i].user}"`);
      console.log(`📊 Expecting: ${conversation[i].expectation}`);

      await input.fill(conversation[i].user);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      await page.screenshot({
        path: `tests/screenshots/persona-habit-builder-${i + 1}.png`,
        fullPage: true
      });

      console.log('✓ Response captured');
    }

    console.log('\n✅ Habit Builder persona test complete');
  });

  /**
   * PERSONA 6: The Context Switcher
   * - Juggling multiple projects simultaneously
   * - Struggles with context switching overhead
   * - Needs help maintaining focus across projects
   * - Communication: Scattered, jumping between topics
   */
  test('Persona: The Context Switcher', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n👤 PERSONA: The Context Switcher');
    console.log('Goal: Make progress on 3 projects without burning out');
    console.log('Pain Point: Context switching kills productivity\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    const conversation = [
      {
        user: "I'm working on my SaaS, a blog, and a course. Today I jumped between all three and got nothing done.",
        expectation: "Time-blocking strategy, batch work"
      },
      {
        user: "But what if I have an idea for the blog while working on the SaaS? Should I ignore it?",
        expectation: "Capture system + focus discipline"
      },
      {
        user: "That makes sense. Should I focus on just one project until it's done?",
        expectation: "Evaluate trade-offs, strategic advice"
      },
      {
        user: "Ok, I'll dedicate mornings to SaaS, evenings to course. Blog on weekends only.",
        expectation: "Validate schedule + implementation tips"
      }
    ];

    for (let i = 0; i < conversation.length; i++) {
      console.log(`\n💬 User: "${conversation[i].user}"`);
      console.log(`📊 Expecting: ${conversation[i].expectation}`);

      await input.fill(conversation[i].user);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      await page.screenshot({
        path: `tests/screenshots/persona-context-switcher-${i + 1}.png`,
        fullPage: true
      });

      console.log('✓ Response captured');
    }

    console.log('\n✅ Context Switcher persona test complete');
  });
});

/**
 * Summary Test - Run all personas in sequence and generate report
 */
test('Generate Persona Test Summary Report', async ({ page }) => {
  test.setTimeout(30000);

  console.log('\n📊 ============================================');
  console.log('PERSONA-BASED TESTING SUMMARY');
  console.log('============================================\n');
  console.log('Personas Tested:');
  console.log('1. The Overwhelmed Founder - Prioritization & Balance');
  console.log('2. The Perfectionist Procrastinator - Overcoming Analysis Paralysis');
  console.log('3. The Burned Out Builder - Reconnecting with Purpose');
  console.log('4. The Efficient Executor - Quick Tactical Advice');
  console.log('5. The Habit Builder - Consistency & Accountability');
  console.log('6. The Context Switcher - Managing Multiple Projects\n');
  console.log('Review screenshots in tests/screenshots/persona-* to verify:');
  console.log('✓ AI provides empathetic, personalized responses');
  console.log('✓ Strategic frameworks match user needs');
  console.log('✓ Advice is actionable and specific');
  console.log('✓ Tone matches user communication style');
  console.log('✓ Value justifies paid subscription\n');
  console.log('============================================\n');
});
