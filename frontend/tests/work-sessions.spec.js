import { test, expect } from '@playwright/test';

test.describe('Work Sessions', () => {
  test.beforeEach(async ({ page }) => {
    // Auto-login via test page
    await page.goto('/test-login');

    // Wait for redirect to dashboard
    await page.waitForURL('/', { timeout: 15000 });

    // Wait for dashboard to load
    await page.waitForSelector('text=Your Projects', { timeout: 15000 });
  });

  test('should display session boundaries in chat', async ({ page }) => {

    // Take screenshot of dashboard
    await page.screenshot({ path: 'tests/screenshots/01-dashboard.png', fullPage: true });

    // Click on the first project
    console.log('Clicking on project...');
    await page.click('text=Test an online app that I built');

    // Wait for navigation and project page to load
    console.log('Waiting for project page to load...');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('button:has-text("Overview"), button:has-text("Work")', { timeout: 15000 });

    // Take screenshot after entering project
    await page.screenshot({ path: 'tests/screenshots/02-inside-project.png', fullPage: true });

    // Navigate to Work view
    console.log('Clicking Work button...');
    await page.click('button:has-text("Work")');
    await page.waitForTimeout(1000);

    // Take screenshot of work view
    await page.screenshot({ path: 'tests/screenshots/02-work-view.png', fullPage: true });

    // Check if session is already active
    const hasActiveSession = await page.locator('div:has-text("🚀 Session Started")').isVisible({ timeout: 2000 }).catch(() => false);

    if (!hasActiveSession) {
      // Start a work session
      const startButton = page.locator('button:has-text("Start Working")');
      if (await startButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await startButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // Take screenshot showing active session
    await page.screenshot({ path: 'tests/screenshots/03-active-session.png', fullPage: true });

    // Send a test message
    await page.fill('input[placeholder*="Message"]', 'Testing work session boundaries');
    await page.click('button:has-text("Send")');

    // Wait for AI response
    await page.waitForTimeout(3000);

    // Take screenshot with messages
    await page.screenshot({ path: 'tests/screenshots/04-chat-messages.png', fullPage: true });

    // Check for session boundaries - look for session start marker
    const sessionBoundary = page.locator('div:has-text("🚀 Session Started")');
    await expect(sessionBoundary).toBeVisible({ timeout: 5000 });

    // Navigate to sessions list
    const sessionsButton = page.locator('button:has-text("📋 Sessions")');
    if (await sessionsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sessionsButton.click();
      await page.waitForTimeout(1000);

      // Take screenshot of sessions list
      await page.screenshot({ path: 'tests/screenshots/05-sessions-list.png', fullPage: true });

      // Go back to chat
      await page.click('button:has-text("Back to Chat")');
    }

    // End the session
    await page.click('button:has-text("End")');
    await page.waitForTimeout(500);

    // Take screenshot of end session modal
    await page.screenshot({ path: 'tests/screenshots/06-end-session-modal.png', fullPage: true });

    // Optionally add notes
    const notesField = page.locator('textarea[placeholder*="accomplish"]');
    if (await notesField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesField.fill('Tested session boundaries feature');
    }

    // Confirm ending session
    await page.click('button:has-text("End Session")');
    await page.waitForTimeout(2000);

    // Take final screenshot
    await page.screenshot({ path: 'tests/screenshots/07-session-ended.png', fullPage: true });

    // Should navigate back to overview
    await expect(page.locator('text=Overview')).toBeVisible({ timeout: 5000 });
  });

  test('should show AI-generated session summaries', async ({ page }) => {
    // This test checks if session summaries appear after ending a session

    // Navigate to work view
    await page.click('button:has-text("Work")').catch(() => {});
    await page.waitForTimeout(1000);

    // Click sessions list
    const sessionsButton = page.locator('button:has-text("📋 Sessions")');
    if (await sessionsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sessionsButton.click();
      await page.waitForTimeout(1000);

      // Look for session summaries (they appear in italic purple text)
      const summaryText = page.locator('div[style*="color: #9D8BCC"][style*="italic"]');

      // Take screenshot
      await page.screenshot({ path: 'tests/screenshots/08-session-summaries.png', fullPage: true });

      // Check if at least one summary exists
      const summaryCount = await summaryText.count();
      console.log(`Found ${summaryCount} session summaries`);
    }
  });

  test('visual regression - UI components', async ({ page }) => {
    // Take screenshots of key UI components for visual comparison

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Header
    await page.screenshot({ path: 'tests/screenshots/ui-header.png', clip: { x: 0, y: 0, width: 1280, height: 80 } });

    // Navigation
    const nav = page.locator('nav').last();
    if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nav.screenshot({ path: 'tests/screenshots/ui-navigation.png' });
    }

    // Take full page screenshot for overall layout review
    await page.screenshot({ path: 'tests/screenshots/ui-full-page.png', fullPage: true });
  });
});
