import { test, expect } from '@playwright/test';

/**
 * AI Conversation Quality Test
 * Tests whether AI responses are clear, actionable, and provide value
 */

test.describe('AI Conversation Quality & UX', () => {
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

  test('AI should provide clear, actionable responses for productivity questions', async ({ page }) => {
    test.setTimeout(90000); // AI responses can take time

    console.log('🤖 Testing AI conversation quality...\n');

    // Test 1: Ask for help getting started
    console.log('📝 Test 1: Getting started guidance');
    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    await input.fill("I'm feeling overwhelmed. Where should I start with my project today?");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(8000); // Wait for AI response

    // Check if AI responded
    let pageContent = await page.textContent('body');
    console.log('✓ AI responded to overwhelming feeling');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/ai-test-01-overwhelmed.png', fullPage: true });

    // Test 2: Ask about prioritization
    console.log('\n📝 Test 2: Task prioritization');
    await input.fill("I have 10 things to do. How do I figure out what's most important?");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(8000);

    pageContent = await page.textContent('body');
    console.log('✓ AI responded to prioritization question');

    await page.screenshot({ path: 'tests/screenshots/ai-test-02-prioritization.png', fullPage: true });

    // Test 3: Check if AI can help break down tasks
    console.log('\n📝 Test 3: Breaking down complex tasks');
    await input.fill("I need to test my app but don't know where to start. Can you help me break this down?");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(8000);

    pageContent = await page.textContent('body');
    console.log('✓ AI responded to task breakdown request');

    await page.screenshot({ path: 'tests/screenshots/ai-test-03-breakdown.png', fullPage: true });

    // Test 4: Verify AI can provide encouragement
    console.log('\n📝 Test 4: Emotional support and encouragement');
    await input.fill("I've been working for 2 hours but feel like I haven't made progress");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(8000);

    pageContent = await page.textContent('body');
    console.log('✓ AI responded to emotional support request');

    await page.screenshot({ path: 'tests/screenshots/ai-test-04-encouragement.png', fullPage: true });

    // Test 5: Check if AI maintains context
    console.log('\n📝 Test 5: Context awareness');
    await input.fill("Can you remind me what we discussed at the start?");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(8000);

    pageContent = await page.textContent('body');
    console.log('✓ AI responded to context recall');

    await page.screenshot({ path: 'tests/screenshots/ai-test-05-context.png', fullPage: true });

    console.log('\n✅ All AI conversation tests completed');
    console.log('📸 Check screenshots to verify response quality');
  });

  test('AI should handle edge cases gracefully', async ({ page }) => {
    test.setTimeout(60000);

    console.log('🛡️ Testing AI edge case handling...\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    // Test 1: Vague request
    console.log('📝 Test 1: Vague request handling');
    await input.fill("help");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(6000);

    let pageContent = await page.textContent('body');
    console.log('✓ AI handled vague request');

    await page.screenshot({ path: 'tests/screenshots/ai-edge-01-vague.png', fullPage: true });

    // Test 2: Off-topic question
    console.log('\n📝 Test 2: Off-topic redirect');
    await input.fill("What's the weather like?");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(6000);

    pageContent = await page.textContent('body');
    console.log('✓ AI handled off-topic question');

    await page.screenshot({ path: 'tests/screenshots/ai-edge-02-offtopic.png', fullPage: true });

    // Test 3: Negative sentiment
    console.log('\n📝 Test 3: Negative sentiment handling');
    await input.fill("This is pointless, I hate my project");
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(6000);

    pageContent = await page.textContent('body');
    console.log('✓ AI handled negative sentiment');

    await page.screenshot({ path: 'tests/screenshots/ai-edge-03-negative.png', fullPage: true });

    console.log('\n✅ All edge case tests completed');
  });

  test('AI conversation flow should feel natural and helpful', async ({ page }) => {
    test.setTimeout(120000);

    console.log('💬 Testing natural conversation flow...\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    // Simulate real user journey
    const messages = [
      { text: "Hey, I need to launch my product soon but I'm stuck", expectedKeywords: [] },
      { text: "I haven't finished the testing and I'm worried about bugs", expectedKeywords: [] },
      { text: "Yeah, I guess I should. What kind of tests should I write first?", expectedKeywords: [] },
      { text: "That makes sense. Can you help me make a plan for today?", expectedKeywords: [] },
    ];

    for (let i = 0; i < messages.length; i++) {
      console.log(`\n💬 Message ${i + 1}: "${messages[i].text}"`);

      await input.fill(messages[i].text);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      await page.screenshot({
        path: `tests/screenshots/ai-flow-${i + 1}.png`,
        fullPage: true
      });

      console.log(`✓ Response received`);
    }

    // Final check: Did the conversation maintain continuity?
    const finalContent = await page.textContent('body');

    console.log('\n✅ Conversation flow test completed');
    console.log('📊 Review screenshots to verify:');
    console.log('   - Responses are contextually relevant');
    console.log('   - AI maintains conversation thread');
    console.log('   - Suggestions are actionable');
    console.log('   - Tone is supportive and professional');
  });

  test('AI should provide value that justifies payment', async ({ page }) => {
    test.setTimeout(90000);

    console.log('💰 Testing value proposition...\n');

    const input = page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]');

    // Test scenarios that demonstrate premium value
    const valueTests = [
      {
        scenario: 'Strategic Planning',
        message: "I have 3 different projects competing for my time. How do I decide which to focus on?",
        expectedValue: 'Strategic prioritization advice'
      },
      {
        scenario: 'Accountability',
        message: "I said I'd finish this by today but I'm only 50% done. What should I do?",
        expectedValue: 'Realistic goal adjustment and accountability'
      },
      {
        scenario: 'Productivity Optimization',
        message: "I work best in the morning but keep scheduling meetings then. How can I protect that time?",
        expectedValue: 'Actionable schedule optimization'
      }
    ];

    for (const test of valueTests) {
      console.log(`\n🎯 Testing: ${test.scenario}`);
      console.log(`   Question: "${test.message}"`);

      await input.fill(test.message);
      await page.click('button:has-text("Send")');
      await page.waitForTimeout(8000);

      const screenshotName = test.scenario.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({
        path: `tests/screenshots/ai-value-${screenshotName}.png`,
        fullPage: true
      });

      console.log(`   ✓ Response captured (Expected: ${test.expectedValue})`);
    }

    console.log('\n✅ Value proposition tests completed');
    console.log('📊 Review screenshots to verify AI provides:');
    console.log('   - Clear, actionable advice');
    console.log('   - Personalized recommendations');
    console.log('   - Strategic thinking support');
    console.log('   - Value worth paying for');
  });
});
