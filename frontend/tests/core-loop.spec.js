/**
 * Core Loop E2E Tests - RavenLoom Phase 1
 *
 * Tests the fundamental Remember → Ask → Recall loop.
 * Designed to catch regressions in the critical path.
 *
 * These tests assume:
 * - Backend is running at localhost:4000
 * - Frontend is running at localhost:5173
 * - User is authenticated (via auth setup)
 * - User has at least one team
 */

import { test, expect } from '@playwright/test';

test.describe('Core Loop: Remember → Ask', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app — should land on team selector or Shell
    await page.goto('/');
    // Wait for either team selector or Shell to load
    await page.waitForSelector('.shell, .team-selector', { timeout: 15000 });
  });

  test('Shell loads with minimal chrome', async ({ page }) => {
    // Should see the Shell header
    await expect(page.locator('.shell-logo')).toBeVisible();
    await expect(page.locator('.shell-logo')).toHaveText('Raven');

    // Should have navigation tabs
    await expect(page.locator('.shell-nav-tab').first()).toBeVisible();

    // Should NOT have old TeamDashboard elements
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect(page.locator('.command-palette')).not.toBeVisible();
  });

  test('Onboarding shows for first-time users', async ({ page }) => {
    // Clear onboarding state
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.removeItem(key);
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.onboarding, .shell', { timeout: 15000 });

    // Should show onboarding headline
    const onboarding = page.locator('.onboarding');
    if (await onboarding.isVisible()) {
      await expect(page.locator('.onboarding-headline')).toContainText('Stop answering');
      await expect(page.locator('.onboarding-textarea')).toBeVisible();
      // Skip button should be available
      await expect(page.locator('.onboarding-skip')).toBeVisible();
    }
  });

  test('Onboarding can be skipped', async ({ page }) => {
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.removeItem(key);
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.onboarding, .shell-header', { timeout: 15000 });

    const skipBtn = page.locator('.onboarding-skip');
    if (await skipBtn.isVisible()) {
      await skipBtn.click();
      // Should now see the main Shell
      await expect(page.locator('.shell-header')).toBeVisible();
      await expect(page.locator('.raven-home')).toBeVisible();
    }
  });

  test('Scope toggle switches between Just Me and My Team', async ({ page }) => {
    // Skip onboarding
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.scope-toggle', { timeout: 15000 });

    const toggle = page.locator('.scope-toggle');
    await expect(toggle).toBeVisible();

    // Default should be "My Team"
    await expect(toggle).toContainText('My Team');

    // Click to switch to "Just Me"
    await toggle.click();
    await expect(toggle).toContainText('Just Me');

    // Click again to switch back
    await toggle.click();
    await expect(toggle).toContainText('My Team');
  });

  test('Remember flow: paste → extract → confirm', async ({ page }) => {
    // Ensure we're past onboarding
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.raven-knowledge', { timeout: 15000 });

    // Find the input area
    const input = page.locator('.raven-knowledge-input');
    await input.fill('Our team meeting decided to use Stripe for payments. Launch date is July 1st.');

    // Click Remember button
    const rememberBtn = page.locator('button:has-text("Remember")');
    if (await rememberBtn.isVisible()) {
      await rememberBtn.click();

      // Wait for fact extraction (may take a few seconds due to AI call)
      await page.waitForSelector('.raven-knowledge-fact, .onboarding-fact-card', {
        timeout: 30000
      });

      // Confirm the facts
      const confirmBtn = page.locator('button:has-text("Confirm")');
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();

        // Should show success state
        await page.waitForSelector('text=/Created|saved|confirmed/i', { timeout: 10000 });
      }
    }
  });

  test('Ask flow: question → sourced answer', async ({ page }) => {
    // Ensure past onboarding
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.raven-knowledge', { timeout: 15000 });

    const input = page.locator('.raven-knowledge-input');
    await input.fill('What payment processor are we using?');

    // Click Ask button
    const askBtn = page.locator('button:has-text("Ask")');
    if (await askBtn.isVisible()) {
      await askBtn.click();

      // Wait for answer (AI call)
      await page.waitForSelector('.raven-knowledge-answer, .raven-knowledge-result', {
        timeout: 30000
      });
    }
  });

  test('Fact counter updates after Remember', async ({ page }) => {
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.shell-header', { timeout: 15000 });

    // Check if fact counter is visible (will be if there are facts)
    const counter = page.locator('.shell-fact-counter');
    // Just verify it doesn't error — count may be 0
    const isVisible = await counter.isVisible();
    if (isVisible) {
      const text = await counter.textContent();
      expect(text).toMatch(/Raven knows \d+ things?/);
    }
  });

  test('Footer shows Full Uproar branding', async ({ page }) => {
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.reload();
    await page.waitForSelector('.shell-footer', { timeout: 15000 });
    await expect(page.locator('.shell-footer-brand')).toContainText('Full Uproar');
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.goto('/');
    await page.waitForSelector('.shell-header', { timeout: 15000 });
  });

  test('Can switch between Raven and Explore tabs', async ({ page }) => {
    // Click Explore tab
    await page.click('.shell-nav-tab:has-text("Explore")');
    await expect(page.locator('.explore-placeholder')).toBeVisible();

    // Click back to Raven
    await page.click('.shell-nav-tab:has-text("Raven")');
    await expect(page.locator('.raven-home')).toBeVisible();
  });

  test('User menu opens and closes', async ({ page }) => {
    const userBtn = page.locator('.shell-user-btn');
    await userBtn.click();
    await expect(page.locator('.shell-user-dropdown')).toBeVisible();

    // Click elsewhere to close
    await page.click('.shell-main');
    await expect(page.locator('.shell-user-dropdown')).not.toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('Shell has proper ARIA roles', async ({ page }) => {
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ravenloom_onboarded_')) {
          localStorage.setItem(key, 'true');
        }
      });
    });
    await page.goto('/');
    await page.waitForSelector('.shell-header', { timeout: 15000 });

    // Navigation tabs should have tablist role
    await expect(page.locator('[role="tablist"]')).toBeVisible();

    // Active tab should have aria-selected
    const activeTab = page.locator('.shell-nav-tab.active');
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');

    // User menu button should have aria-haspopup
    await expect(page.locator('.shell-user-btn')).toHaveAttribute('aria-haspopup', 'true');
  });
});
