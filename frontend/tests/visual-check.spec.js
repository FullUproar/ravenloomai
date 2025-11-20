import { test, expect } from '@playwright/test';

/**
 * Visual checks - no authentication required
 * Tests public-facing UI elements and layout
 */

test.describe('Visual Checks (No Auth)', () => {
  test('landing page loads and displays correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot of landing/login page
    await page.screenshot({
      path: 'tests/screenshots/visual-landing-page.png',
      fullPage: true
    });

    // Check for RavenLoom branding
    const hasLogo = await page.locator('text=RavenLoom').isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Logo visible:', hasLogo);

    // Check for login elements (should be visible if not authenticated)
    const hasEmailInput = await page.locator('input[type="email"]').isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Email input visible:', hasEmailInput);
  });

  test('responsive layout - mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take mobile screenshot
    await page.screenshot({
      path: 'tests/screenshots/visual-mobile-375.png',
      fullPage: true
    });

    console.log('Mobile viewport screenshot captured');
  });

  test('responsive layout - tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take tablet screenshot
    await page.screenshot({
      path: 'tests/screenshots/visual-tablet-768.png',
      fullPage: true
    });

    console.log('Tablet viewport screenshot captured');
  });

  test('check for console errors', async ({ page }) => {
    const consoleErrors = [];

    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Log any console errors found
    if (consoleErrors.length > 0) {
      console.log('Console errors detected:');
      consoleErrors.forEach(err => console.log(' -', err));
    } else {
      console.log('No console errors detected');
    }

    // Take screenshot
    await page.screenshot({
      path: 'tests/screenshots/visual-console-check.png',
      fullPage: true
    });
  });
});
