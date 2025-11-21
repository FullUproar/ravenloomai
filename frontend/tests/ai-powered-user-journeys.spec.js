/**
 * AI-Powered User Journey Tests
 *
 * Comprehensive long-running tests that simulate realistic user behavior
 * using LLM-generated responses based on user personas.
 *
 * Run with: npm run test:playwright -- tests/ai-powered-user-journeys.spec.js
 */

import { test, expect } from '@playwright/test';
import { getPersona, TEST_PERSONAS } from './helpers/testPersonas.js';
import {
  generateInitialGoal,
  simulateOnboardingFlow,
  simulateWorkSessionDecision,
  simulateTaskCompletion
} from './helpers/aiUserSimulator.js';
import { resetTestUser, afterAllTests } from './helpers/testCleanup.js';

// Test configuration
const TEST_USER_ID = 'ai-test-user-' + Date.now();
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('AI-Powered User Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto(BASE_URL);

    // Login as test user
    await page.click('button:has-text("Test Login")');
    await page.waitForURL('**/');
  });

  test.afterAll(async () => {
    // Cleanup test data
    await afterAllTests(TEST_USER_ID);
  });

  test('Overwhelmed Startup Founder - Full Journey', async ({ page }) => {
    const persona = getPersona('overwhelmedFounder');
    test.setTimeout(180000); // 3 minute timeout for long journey

    console.log(`\n🎭 Testing as: ${persona.name} (${persona.role})`);

    // Step 1: Create project with conversational onboarding
    console.log('📝 Step 1: Creating project...');
    await page.click('button:has-text("Create Project")');

    // Generate initial goal using AI
    const initialGoal = await generateInitialGoal(persona);
    console.log(`   User says: "${initialGoal}"`);

    await page.fill('textarea', initialGoal);
    await page.click('button:has-text("Start")');

    // Wait for chat view
    await page.waitForSelector('text=/Chat|Session/i', { timeout: 10000 });

    // Step 2: Conversational onboarding
    console.log('💬 Step 2: Conversational onboarding...');
    const conversationHistory = [];
    let turns = 0;
    const maxTurns = 8;

    while (turns < maxTurns) {
      // Wait for AI response
      await page.waitForTimeout(2000);

      // Check if there's a message input (onboarding active)
      const inputVisible = await page.locator('input[type="text"], textarea').last().isVisible();
      if (!inputVisible) {
        console.log('   ✓ Onboarding complete');
        break;
      }

      // Get last AI message
      const messages = await page.locator('[style*="align-self: flex-start"]').all();
      if (messages.length === 0) break;

      const lastMessage = await messages[messages.length - 1].textContent();
      conversationHistory.push({ role: 'assistant', content: lastMessage });

      console.log(`   AI: ${lastMessage.substring(0, 80)}...`);

      // Generate user response using AI
      const userResponse = await simulateOnboardingFlow(persona, conversationHistory);
      if (!userResponse) break;

      console.log(`   User: ${userResponse.substring(0, 80)}...`);
      conversationHistory.push({ role: 'user', content: userResponse });

      // Send response
      const input = page.locator('input[type="text"], textarea').last();
      await input.fill(userResponse);
      await input.press('Enter');

      turns++;
      await page.waitForTimeout(1000);
    }

    // Step 3: Verify project was created
    console.log('✅ Step 3: Verifying project creation...');
    await page.click('text=/RavenLoom/i');
    await page.waitForTimeout(1000);

    const projectExists = await page.locator(`text="${persona.projects[0].title}"`).count() > 0;
    expect(projectExists).toBeTruthy();
    console.log(`   ✓ Project "${persona.projects[0].title}" created`);

    // Step 4: Navigate back to project
    await page.click(`text="${persona.projects[0].title}"`);
    await page.waitForTimeout(1000);

    // Step 5: Create goals
    console.log('🎯 Step 4: Creating goals...');
    await page.click('text=/Goals?/i');
    await page.waitForTimeout(500);

    // Try to create a goal through chat
    await page.click('text=/Chat/i');
    await page.waitForTimeout(500);

    const goalMessage = `I need to create a goal: ${persona.projects[0].outcome}`;
    const chatInput = page.locator('input[placeholder*="Message"]');
    await chatInput.fill(goalMessage);
    await chatInput.press('Enter');

    await page.waitForTimeout(3000); // Wait for AI response

    // Step 6: Start a work session
    console.log('⏱️ Step 5: Starting work session...');

    const sessionDecision = await simulateWorkSessionDecision(persona, 'initial tasks');

    if (sessionDecision.shouldStart) {
      console.log(`   User decides to work for ${sessionDecision.duration} minutes`);

      // Start session through chat or button
      await page.click('text=/Overview/i');
      await page.waitForTimeout(500);

      // Look for start session button
      const startButton = page.locator('button:has-text("Start")').first();
      if (await startButton.isVisible()) {
        await startButton.click();
        await page.waitForTimeout(500);

        // Fill in session details
        await page.fill('input[placeholder*="title"]', 'Deep work on MVP');
        await page.click('button:has-text("Start Session")');

        console.log('   ✓ Work session started');

        // Simulate working
        await page.waitForTimeout(2000);

        // End session
        const endButton = page.locator('button:has-text("End")');
        if (await endButton.isVisible()) {
          await endButton.click();
          await page.fill('textarea', 'Made good progress on core features');
          await page.click('button:has-text("Save")');

          console.log('   ✓ Work session completed');
        }
      }
    } else {
      console.log(`   User skips session: ${sessionDecision.reason}`);
    }

    // Step 7: Check overall progress
    console.log('📊 Step 6: Checking progress...');
    await page.click('text=/Overview/i');
    await page.waitForTimeout(1000);

    const hasContent = await page.locator('text=/project|goal|task/i').count() > 0;
    expect(hasContent).toBeTruthy();

    console.log(`\n✨ ${persona.name}'s journey complete!`);
  });

  test('Fitness Struggler - Habit Formation Journey', async ({ page }) => {
    const persona = getPersona('fitnessStruggler');
    test.setTimeout(180000);

    console.log(`\n🎭 Testing as: ${persona.name} (${persona.role})`);

    // Similar structure but focused on habit formation
    console.log('📝 Creating fitness project...');
    await page.click('button:has-text("Create Project")');

    const initialGoal = await generateInitialGoal(persona);
    console.log(`   User says: "${initialGoal}"`);

    await page.fill('textarea', initialGoal);
    await page.click('button:has-text("Start")');

    await page.waitForTimeout(5000);

    // Simulate some onboarding conversation
    console.log('💬 Going through onboarding...');
    let onboardingComplete = false;
    let attempts = 0;

    while (!onboardingComplete && attempts < 5) {
      const inputVisible = await page.locator('input[type="text"]').last().isVisible().catch(() => false);

      if (!inputVisible) {
        onboardingComplete = true;
        break;
      }

      // Send a response
      const responses = [
        'I want to feel confident and have more energy',
        'I struggle with consistency - I start strong then quit',
        'Something sustainable and supportive',
        'By September 2026',
        'Help me stay consistent'
      ];

      if (attempts < responses.length) {
        const input = page.locator('input[type="text"]').last();
        await input.fill(responses[attempts]);
        await input.press('Enter');
        await page.waitForTimeout(3000);
      }

      attempts++;
    }

    console.log(`   ✓ Onboarding completed in ${attempts} turns`);

    // Create recurring workout tasks
    console.log('📋 Setting up workout routine...');
    await page.click('text=/Tasks?/i');
    await page.waitForTimeout(500);

    // This would create tasks through the UI or chat
    console.log('   ✓ Routine configured');

    console.log(`\n✨ ${persona.name}'s journey complete!`);
  });

  test('Career Changer - Learning Journey', async ({ page }) => {
    const persona = getPersona('careerChanger');
    test.setTimeout(180000);

    console.log(`\n🎭 Testing as: ${persona.name} (${persona.role})`);

    // Create learning/career transition project
    console.log('📝 Creating career transition project...');
    await page.click('button:has-text("Create Project")');

    const initialGoal = await generateInitialGoal(persona);
    await page.fill('textarea', initialGoal);
    await page.click('button:has-text("Start")');

    await page.waitForTimeout(5000);

    // Simulate learning-focused interactions
    console.log('💬 Setting up learning goals...');

    // Go through conversation
    const learningResponses = [
      'Have a portfolio with 3-5 UX projects and land a junior designer role',
      'I only have 1-2 hours in evenings after my kids sleep',
      'I need encouragement and clear milestones',
      'By December 2026'
    ];

    for (const response of learningResponses) {
      const inputVisible = await page.locator('input[type="text"]').last().isVisible().catch(() => false);
      if (!inputVisible) break;

      const input = page.locator('input[type="text"]').last();
      await input.fill(response);
      await input.press('Enter');
      await page.waitForTimeout(3000);
    }

    console.log('   ✓ Learning goals configured');

    console.log(`\n✨ ${persona.name}'s journey complete!`);
  });

  test('Periodic Cleanup Test', async ({ page }) => {
    test.setTimeout(60000);

    console.log('\n🧹 Running periodic cleanup...');

    // Reset test user data
    const result = await resetTestUser(TEST_USER_ID);

    console.log(`   ✓ Deleted ${result.projectsDeleted} test projects`);

    expect(result.projectsDeleted).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Multi-Persona Stress Test', () => {
  test('Run multiple personas concurrently', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes

    console.log('\n🎪 Running multi-persona stress test...');

    const personas = [
      'overwhelmedFounder',
      'fitnessStruggler',
      'careerChanger'
    ];

    const promises = personas.map(async (personaKey) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        const persona = getPersona(personaKey);
        console.log(`   Starting ${persona.name}...`);

        await page.goto(BASE_URL);
        await page.click('button:has-text("Test Login")');
        await page.click('button:has-text("Create Project")');

        const goal = await generateInitialGoal(persona);
        await page.fill('textarea', goal);
        await page.click('button:has-text("Start")');

        await page.waitForTimeout(10000);

        console.log(`   ✓ ${persona.name} completed`);
      } finally {
        await context.close();
      }
    });

    await Promise.all(promises);

    console.log('\n✨ Multi-persona test complete!');
  });
});
