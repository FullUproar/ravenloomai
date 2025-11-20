import { test, expect } from '@playwright/test';

test.describe('Navigation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('text=Your Projects', { timeout: 15000 });
  });

  test('Work button should navigate to chat view', async ({ page }) => {
    console.log('Navigating to project...');
    await page.click('text=Test an online app that I built');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('button:has-text("Overview"), button:has-text("Work")', { timeout: 15000 });

    // Check initial state - should be on Overview
    await page.screenshot({ path: 'tests/screenshots/nav-01-initial.png', fullPage: true });

    // Get URL before clicking Work
    const urlBefore = page.url();
    console.log('URL before:', urlBefore);

    // Click Work button
    console.log('Clicking Work button...');
    await page.click('button:has-text("Work")');
    await page.waitForTimeout(2000);

    // Get URL after clicking Work
    const urlAfter = page.url();
    console.log('URL after:', urlAfter);

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/nav-02-after-work-click.png', fullPage: true });

    // Check if URL changed to /chat
    expect(urlAfter).toContain('/chat');

    // Check if Work button is highlighted (purple color)
    const workButton = page.locator('button:has-text("Work")');
    const workButtonColor = await workButton.evaluate(el => window.getComputedStyle(el).color);
    console.log('Work button color:', workButtonColor);

    // Check if we can see chat interface elements
    const hasSessionsButton = await page.locator('button:has-text("Sessions"), button:has-text("📋 Sessions")').isVisible({ timeout: 3000 }).catch(() => false);
    const hasMessageInput = await page.locator('input[placeholder*="Message"], textarea[placeholder*="Message"]').isVisible({ timeout: 3000 }).catch(() => false);

    console.log('Has Sessions button:', hasSessionsButton);
    console.log('Has Message input:', hasMessageInput);

    if (!hasMessageInput) {
      console.log('❌ Chat interface not visible after clicking Work!');

      // Debug: check what's actually visible
      const pageText = await page.textContent('body');
      console.log('Page contains "Ready to get started":', pageText.includes('Ready to get started'));
      console.log('Page contains "Start a work session":', pageText.includes('Start a work session'));
    }

    // The chat interface should be visible
    expect(hasSessionsButton || hasMessageInput).toBe(true);
  });
});
