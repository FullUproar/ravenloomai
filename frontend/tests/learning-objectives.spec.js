import { test, expect } from '@playwright/test';

/**
 * Learning Objectives Tests
 * Tests the Learning Objectives feature in Ask the Team section
 *
 * Note: These tests require authentication. Run locally with `npm run dev` first,
 * or run against production where you are already logged in.
 */

// Skip these tests in CI since they require authentication
test.skip(({ browserName }) => !process.env.TEST_LOCAL, 'Skipping - requires local auth');

test.describe('Learning Objectives', () => {
  test.beforeEach(async ({ page }) => {
    // Try to login via test endpoint (only works locally)
    await page.goto('/test-login');

    // Wait for either redirect to home or stay on login
    await Promise.race([
      page.waitForURL('/', { timeout: 5000 }),
      page.waitForSelector('.team-dashboard, .team-card', { timeout: 5000 })
    ]).catch(() => {
      // If no redirect, we might already be logged in or on production
    });

    // Wait for dashboard to load
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    // Click on first team if on team selection screen
    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }

    // Navigate to Ask the Team view
    await page.click('button:has-text("Ask the Team"), .nav-item:has-text("Ask")');
    await page.waitForSelector('.ask-area, .ask-tabs', { timeout: 10000 });
  });

  test('should display tabs for Questions and Learning Objectives', async ({ page }) => {
    // Both tabs should be visible
    await expect(page.locator('.ask-tab:has-text("Questions")')).toBeVisible();
    await expect(page.locator('.ask-tab:has-text("Learning Objectives")')).toBeVisible();
  });

  test('should switch to Learning Objectives tab', async ({ page }) => {
    // Click on Learning Objectives tab
    await page.click('.ask-tab:has-text("Learning Objectives")');

    // Should show the LO content
    await expect(page.locator('.learning-objectives-content')).toBeVisible({ timeout: 5000 });

    // Should show the create button
    await expect(page.locator('button:has-text("New Learning Objective")')).toBeVisible();
  });

  test('should open create Learning Objective modal', async ({ page }) => {
    // Navigate to LO tab
    await page.click('.ask-tab:has-text("Learning Objectives")');
    await page.waitForSelector('.learning-objectives-content', { timeout: 5000 });

    // Click create button
    await page.click('button:has-text("New Learning Objective")');

    // Modal should appear
    await expect(page.locator('.modal:has-text("Create Learning Objective")')).toBeVisible({ timeout: 5000 });

    // Modal should have input fields
    await expect(page.locator('.modal input[type="text"]')).toBeVisible();
    await expect(page.locator('.modal textarea')).toBeVisible();

    // Should have Raven option
    await expect(page.locator('.lo-assign-option:has-text("Raven")')).toBeVisible();
  });

  test('should create a new Learning Objective', async ({ page }) => {
    // Navigate to LO tab
    await page.click('.ask-tab:has-text("Learning Objectives")');
    await page.waitForSelector('.learning-objectives-content', { timeout: 5000 });

    // Open create modal
    await page.click('button:has-text("New Learning Objective")');
    await page.waitForSelector('.modal', { timeout: 5000 });

    // Fill in the form
    const testTitle = `Test LO ${Date.now()}`;
    await page.fill('.modal input[type="text"]', testTitle);
    await page.fill('.modal textarea', 'This is a test learning objective description');

    // Select Raven as researcher (should be default)
    await page.click('.lo-assign-option:has-text("Raven")');

    // Submit the form
    await page.click('.modal button[type="submit"]:has-text("Create")');

    // Modal should close
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 5000 });

    // New LO should appear in the list (may take a moment for AI to generate questions)
    await expect(page.locator(`.lo-card:has-text("${testTitle}")`)).toBeVisible({ timeout: 10000 });
  });

  test('should click into Learning Objective detail view', async ({ page }) => {
    // Navigate to LO tab
    await page.click('.ask-tab:has-text("Learning Objectives")');
    await page.waitForSelector('.learning-objectives-content', { timeout: 5000 });

    // Check if there are any existing LOs
    const loCard = page.locator('.lo-card').first();
    const hasLOs = await loCard.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasLOs) {
      // Click on the first LO
      await loCard.click();

      // Should show detail view
      await expect(page.locator('.lo-detail-view')).toBeVisible({ timeout: 5000 });

      // Should have a back button
      await expect(page.locator('.back-btn:has-text("Back")')).toBeVisible();

      // Should show the LO title
      await expect(page.locator('.lo-detail-header h4')).toBeVisible();
    } else {
      // No LOs exist, skip this test
      test.skip();
    }
  });

  test('should display "Ask Raven to dig deeper" button on answered questions', async ({ page }) => {
    // Stay on Questions tab
    await expect(page.locator('.ask-tab.active:has-text("Questions")')).toBeVisible();

    // Check if there are answered questions
    const answeredQuestion = page.locator('.team-question-card.answered').first();
    const hasAnswered = await answeredQuestion.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasAnswered) {
      // Should have the follow-up button
      await expect(answeredQuestion.locator('.followup-btn:has-text("dig deeper")')).toBeVisible();
    } else {
      // No answered questions, skip
      test.skip();
    }
  });

  test('should return to Questions tab when clicking back from LO', async ({ page }) => {
    // Navigate to LO tab
    await page.click('.ask-tab:has-text("Learning Objectives")');
    await page.waitForSelector('.learning-objectives-content', { timeout: 5000 });

    // Go back to Questions tab
    await page.click('.ask-tab:has-text("Questions")');

    // Questions tab should be active
    await expect(page.locator('.ask-tab.active:has-text("Questions")')).toBeVisible();

    // Should show the ask form
    await expect(page.locator('#ask-form')).toBeVisible();
  });
});
