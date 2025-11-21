import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Verify AI Response Quality', () => {
  test('AI should generate a real response, not just loading message', async ({ page }) => {
    test.setTimeout(90000); // 90 seconds

    console.log('\n🔍 Testing AI response quality...\n');

    // Auto-login
    await page.goto(`${BASE_URL}/test-login`);
    await page.waitForSelector('text=Your Projects', { timeout: 20000 });
    console.log('✓ Logged in');

    // Create project
    const createButton = page.locator('button:has-text("Create New Project"), button:has-text("Create Project")').first();
    await createButton.click();

    const goalInput = 'I want to launch a SaaS product by April 2026';
    const textarea = page.locator('textarea').first();
    await textarea.fill(goalInput);
    await page.click('button:has-text("Start")');

    console.log('✓ Project created');

    // Wait for chat view and AI response
    await page.waitForTimeout(3000); // Give time for navigation

    // Wait up to 60 seconds for a real AI message (not loading state)
    console.log('⏳ Waiting for AI to generate response...');

    const aiMessageLocator = page.locator('[style*="align-self: flex-start"]').first();
    await aiMessageLocator.waitFor({ timeout: 60000 });

    // Get the AI message text
    const aiMessage = await aiMessageLocator.textContent();
    console.log(`\n📨 AI Message:\n"${aiMessage}"\n`);

    // Assertions
    expect(aiMessage).toBeTruthy();
    expect(aiMessage.length).toBeGreaterThan(50); // Should be substantial
    expect(aiMessage.toLowerCase()).not.toContain('thinking'); // Should not be loading message
    expect(aiMessage.toLowerCase()).not.toContain('...'); // Should not have ellipsis from loading

    // Check if it's a substantive response about the goal
    const hasSubstantiveContent =
      aiMessage.toLowerCase().includes('saas') ||
      aiMessage.toLowerCase().includes('launch') ||
      aiMessage.toLowerCase().includes('product') ||
      aiMessage.toLowerCase().includes('goal') ||
      aiMessage.toLowerCase().includes('how') ||
      aiMessage.toLowerCase().includes('what');

    expect(hasSubstantiveContent).toBeTruthy();

    console.log('✅ AI generated a real, substantive response!');
  });
});
