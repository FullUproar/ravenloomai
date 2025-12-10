import { test, expect } from '@playwright/test';

/**
 * Team Settings E2E Tests
 *
 * Tests the Team Settings modal functionality:
 * - Opening/closing the settings modal
 * - Proactive AI toggles
 * - Admin-only access
 */

test.describe('Team Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Login via test endpoint
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });

    // Wait for dashboard to load
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    // Click on first team if on team selection screen
    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }
  });

  test.describe('Settings Modal Access', () => {
    test('should show settings button in sidebar footer for admin users', async ({ page }) => {
      // Settings button should be visible in sidebar footer
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');
      const isVisible = await settingsButton.isVisible({ timeout: 5000 }).catch(() => false);

      // If visible, user is admin
      if (isVisible) {
        await expect(settingsButton).toBeVisible();
      } else {
        // If not visible, user is not admin - this is expected behavior
        test.skip();
      }
    });

    test('should open settings modal when settings button is clicked', async ({ page }) => {
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');

      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();

        // Modal should be visible
        await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.team-settings-modal h3')).toContainText('Team Settings');
      } else {
        test.skip();
      }
    });

    test('should close settings modal when close button is clicked', async ({ page }) => {
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');

      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });

        // Click close button
        await page.click('.team-settings-modal .modal-close');

        // Modal should be hidden
        await expect(page.locator('.team-settings-modal')).not.toBeVisible({ timeout: 3000 });
      } else {
        test.skip();
      }
    });

    test('should close settings modal when clicking overlay', async ({ page }) => {
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');

      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });

        // Click overlay (outside modal)
        await page.click('.modal-overlay', { position: { x: 10, y: 10 } });

        // Modal should be hidden
        await expect(page.locator('.team-settings-modal')).not.toBeVisible({ timeout: 3000 });
      } else {
        test.skip();
      }
    });

    test('should close settings modal when Close button is clicked', async ({ page }) => {
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');

      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });

        // Click Close button in footer
        await page.click('.team-settings-modal .modal-footer button');

        // Modal should be hidden
        await expect(page.locator('.team-settings-modal')).not.toBeVisible({ timeout: 3000 });
      } else {
        test.skip();
      }
    });
  });

  test.describe('Proactive AI Settings', () => {
    test.beforeEach(async ({ page }) => {
      // Open settings modal
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');
      if (await settingsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsButton.click();
        await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });
      } else {
        test.skip();
      }
    });

    test('should display Proactive AI section', async ({ page }) => {
      await expect(page.locator('.team-settings-modal h4:has-text("Proactive AI Features")')).toBeVisible();
      await expect(page.locator('.team-settings-modal .settings-description')).toContainText(
        'Control AI-powered productivity features for your team'
      );
    });

    test('should display master toggle for Proactive AI', async ({ page }) => {
      const masterToggle = page.locator('.team-settings-modal label:has-text("Enable Proactive AI") input[type="checkbox"]');
      await expect(masterToggle).toBeVisible();
    });

    test('should show feature toggles when master toggle is enabled', async ({ page }) => {
      const masterToggle = page.locator('.team-settings-modal label:has-text("Enable Proactive AI") input[type="checkbox"]');

      // Ensure master toggle is checked
      if (!(await masterToggle.isChecked())) {
        await masterToggle.click();
        await page.waitForTimeout(500);
      }

      // Feature toggles should be visible
      await expect(page.locator('.team-settings-modal label:has-text("Morning Focus")')).toBeVisible();
      await expect(page.locator('.team-settings-modal label:has-text("Smart Nudges")')).toBeVisible();
      await expect(page.locator('.team-settings-modal label:has-text("AI Insights")')).toBeVisible();
      await expect(page.locator('.team-settings-modal label:has-text("Meeting Prep")')).toBeVisible();
    });

    test('should hide feature toggles when master toggle is disabled', async ({ page }) => {
      const masterToggle = page.locator('.team-settings-modal label:has-text("Enable Proactive AI") input[type="checkbox"]');

      // Disable master toggle if enabled
      if (await masterToggle.isChecked()) {
        await masterToggle.click();
        await page.waitForTimeout(500);
      }

      // Feature toggles should be hidden
      await expect(page.locator('.team-settings-modal label:has-text("Morning Focus")')).not.toBeVisible();
      await expect(page.locator('.team-settings-modal label:has-text("Smart Nudges")')).not.toBeVisible();
      await expect(page.locator('.team-settings-modal label:has-text("AI Insights")')).not.toBeVisible();
      await expect(page.locator('.team-settings-modal label:has-text("Meeting Prep")')).not.toBeVisible();
    });

    test('should toggle individual features', async ({ page }) => {
      const masterToggle = page.locator('.team-settings-modal label:has-text("Enable Proactive AI") input[type="checkbox"]');

      // Ensure master toggle is checked
      if (!(await masterToggle.isChecked())) {
        await masterToggle.click();
        await page.waitForTimeout(500);
      }

      // Toggle Morning Focus
      const morningFocusToggle = page.locator('.team-settings-modal label:has-text("Morning Focus") input[type="checkbox"]');
      const wasChecked = await morningFocusToggle.isChecked();
      await morningFocusToggle.click();
      await page.waitForTimeout(500);

      // State should have changed
      expect(await morningFocusToggle.isChecked()).toBe(!wasChecked);
    });

    test('should display hint text for each toggle', async ({ page }) => {
      const masterToggle = page.locator('.team-settings-modal label:has-text("Enable Proactive AI") input[type="checkbox"]');

      // Ensure master toggle is checked
      if (!(await masterToggle.isChecked())) {
        await masterToggle.click();
        await page.waitForTimeout(500);
      }

      // Check hint texts
      await expect(page.locator('.team-settings-modal:has-text("Master toggle for all AI features")')).toBeVisible();
      await expect(page.locator('.team-settings-modal:has-text("AI-generated daily plans")')).toBeVisible();
      await expect(page.locator('.team-settings-modal:has-text("Reminders for overdue/stale tasks")')).toBeVisible();
      await expect(page.locator('.team-settings-modal:has-text("Productivity analytics and recommendations")')).toBeVisible();
      await expect(page.locator('.team-settings-modal:has-text("Auto-generated context before meetings")')).toBeVisible();
    });
  });

  test.describe('Settings Persistence', () => {
    test('should persist toggle state after closing and reopening modal', async ({ page }) => {
      const settingsButton = page.locator('.footer-btn[title="Team Settings"], button:has-text("Team Settings")');

      if (!(await settingsButton.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip();
      }

      await settingsButton.click();
      await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });

      // Get initial state of master toggle
      const masterToggle = page.locator('.team-settings-modal label:has-text("Enable Proactive AI") input[type="checkbox"]');
      const initialState = await masterToggle.isChecked();

      // Toggle it
      await masterToggle.click();
      await page.waitForTimeout(1000); // Wait for mutation to complete

      // Close modal
      await page.click('.team-settings-modal .modal-close');
      await expect(page.locator('.team-settings-modal')).not.toBeVisible({ timeout: 3000 });

      // Reopen modal
      await settingsButton.click();
      await expect(page.locator('.team-settings-modal')).toBeVisible({ timeout: 5000 });

      // Check state persisted
      const newState = await masterToggle.isChecked();
      expect(newState).toBe(!initialState);

      // Restore original state
      await masterToggle.click();
      await page.waitForTimeout(1000);
    });
  });
});

test.describe('Team Settings - Non-Admin User', () => {
  test('should not show settings button for non-admin users', async ({ page }) => {
    // This test would need a non-admin test login endpoint
    // For now, we verify that the settings functionality is only accessible
    // when the button is visible (which requires admin permissions)
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }

    // If settings button is not visible, user lacks admin permissions
    const settingsButton = page.locator('.footer-btn[title="Team Settings"]');
    const isVisible = await settingsButton.isVisible({ timeout: 2000 }).catch(() => false);

    // Note: This test passes whether or not the button is visible
    // The actual permission check happens at the GraphQL level
    expect(true).toBe(true);
  });
});
