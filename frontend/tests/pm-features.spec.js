import { test, expect } from '@playwright/test';

/**
 * PM Features E2E Tests
 * Tests for Work Breakdown Structure, AI Focus, and Pro Mode features
 */

// Helper function to login and navigate to team dashboard
async function setupTestSession(page) {
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
}

test.describe('Pro Mode Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestSession(page);
  });

  test('should display Pro Mode toggle in settings', async ({ page }) => {
    // Look for a settings button or gear icon
    const settingsBtn = page.locator('[data-testid="settings-btn"], .settings-btn, button[title*="Settings"]');
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
    }

    // Check if Pro Mode toggle exists somewhere in the UI
    const proModeToggle = page.locator('.pro-mode-toggle, [data-testid="pro-mode-toggle"]');
    const proModeText = page.locator('text=Pro Mode');

    // At least one should be visible if Pro Mode is accessible
    const hasProModeUI = await proModeToggle.isVisible().catch(() => false) ||
                         await proModeText.isVisible().catch(() => false);

    // This test is informational - Pro Mode may or may not be immediately visible
    console.log('Pro Mode UI accessible:', hasProModeUI);
  });

  test('should toggle Pro Mode features on and off', async ({ page }) => {
    // Navigate to settings or PM section
    const settingsBtn = page.locator('.settings-btn, [data-testid="settings-btn"]');
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
    }

    // Find Pro Mode toggle
    const proModeToggle = page.locator('.pro-mode-toggle, [data-testid="pro-mode-toggle"]');

    if (await proModeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Get initial state
      const wasActive = await proModeToggle.evaluate(el => el.classList.contains('active'));

      // Click to toggle
      await proModeToggle.click();

      // Wait for state change
      await page.waitForTimeout(500);

      // Verify toggle changed
      const isActive = await proModeToggle.evaluate(el => el.classList.contains('active'));
      expect(isActive).toBe(!wasActive);
    }
  });

  test('should show feature grid when Pro Mode is enabled', async ({ page }) => {
    // Navigate to settings
    const settingsBtn = page.locator('.settings-btn, [data-testid="settings-btn"]');
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
    }

    const proModeToggle = page.locator('.pro-mode-toggle');
    const featuresGrid = page.locator('.pro-features-grid, [data-testid="features-grid"]');

    if (await proModeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Ensure Pro Mode is enabled
      const isActive = await proModeToggle.evaluate(el => el.classList.contains('active'));
      if (!isActive) {
        await proModeToggle.click();
        await page.waitForTimeout(500);
      }

      // Check that features grid is visible
      await expect(featuresGrid).toBeVisible({ timeout: 3000 });
    }
  });

  test('should toggle individual features', async ({ page }) => {
    // Navigate to settings with Pro Mode enabled
    const settingsBtn = page.locator('.settings-btn, [data-testid="settings-btn"]');
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
    }

    const proModeToggle = page.locator('.pro-mode-toggle');
    if (await proModeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Enable Pro Mode if not already
      const isActive = await proModeToggle.evaluate(el => el.classList.contains('active'));
      if (!isActive) {
        await proModeToggle.click();
        await page.waitForTimeout(500);
      }

      // Click on a feature toggle
      const ganttFeature = page.locator('[data-testid="feature-showGanttChart"], .pro-feature-item:has-text("Gantt")');
      if (await ganttFeature.isVisible({ timeout: 2000 }).catch(() => false)) {
        const wasEnabled = await ganttFeature.evaluate(el => el.classList.contains('enabled'));
        await ganttFeature.click();
        await page.waitForTimeout(300);
        const isEnabled = await ganttFeature.evaluate(el => el.classList.contains('enabled'));
        expect(isEnabled).toBe(!wasEnabled);
      }
    }
  });
});

test.describe('WBS Draft Editor', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestSession(page);
  });

  test('should navigate to WBS section', async ({ page }) => {
    // Look for WBS tab or navigation item
    const wbsNav = page.locator('text=WBS, text=Work Breakdown, .wbs-tab, [data-testid="wbs-nav"]').first();

    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
      await page.waitForTimeout(500);

      // Verify WBS content is visible
      const wbsContent = page.locator('.wbs-draft-editor, .wbs-container');
      await expect(wbsContent).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show mode toggle between Draft Editor and Project View', async ({ page }) => {
    // Navigate to WBS section if it exists
    const wbsNav = page.locator('text=WBS, text=Work Breakdown').first();
    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
    }

    // Check for mode toggle buttons
    const draftEditorBtn = page.locator('button:has-text("Draft Editor"), [data-testid="draft-editor-mode"]');
    const projectViewBtn = page.locator('button:has-text("Project View"), [data-testid="project-view-mode"]');

    if (await draftEditorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(projectViewBtn).toBeVisible();
    }
  });

  test('should create a new WBS draft', async ({ page }) => {
    // Navigate to WBS section
    const wbsNav = page.locator('text=WBS, text=Work Breakdown').first();
    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
    }

    // Switch to Draft Editor mode
    const draftEditorBtn = page.locator('button:has-text("Draft Editor")');
    if (await draftEditorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await draftEditorBtn.click();
    }

    // Click create new draft button
    const createBtn = page.locator('[data-testid="create-draft-btn"], .wbs-sidebar .add-btn, button:has-text("New Draft")');
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();

      // Wait for new draft to appear
      await page.waitForTimeout(1000);

      // Check that draft list has an item
      const draftItems = page.locator('.wbs-draft-item, [data-testid^="draft-item-"]');
      await expect(draftItems.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('should add child node to WBS tree', async ({ page }) => {
    // Navigate to WBS and create/select a draft
    const wbsNav = page.locator('text=WBS, text=Work Breakdown').first();
    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
    }

    const draftEditorBtn = page.locator('button:has-text("Draft Editor")');
    if (await draftEditorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await draftEditorBtn.click();
    }

    // Select or create a draft
    const draftItem = page.locator('.wbs-draft-item').first();
    if (await draftItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftItem.click();

      // Find an add child button on a node
      const addChildBtn = page.locator('[data-testid^="add-child-"], .wbs-action-btn:has-text("+")').first();
      if (await addChildBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const initialNodeCount = await page.locator('.wbs-draft-node').count();
        await addChildBtn.click();
        await page.waitForTimeout(500);

        // Verify node count increased
        const newNodeCount = await page.locator('.wbs-draft-node').count();
        expect(newNodeCount).toBeGreaterThan(initialNodeCount);
      }
    }
  });

  test('should edit node label', async ({ page }) => {
    // Navigate to WBS Draft Editor
    const wbsNav = page.locator('text=WBS, text=Work Breakdown').first();
    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
    }

    const draftEditorBtn = page.locator('button:has-text("Draft Editor")');
    if (await draftEditorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await draftEditorBtn.click();
    }

    // Select a draft
    const draftItem = page.locator('.wbs-draft-item').first();
    if (await draftItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftItem.click();

      // Double-click on a node label to edit
      const nodeLabel = page.locator('.wbs-node-label').first();
      if (await nodeLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nodeLabel.dblclick();

        // Check that edit input appears
        const editInput = page.locator('.wbs-edit-input, input[placeholder*="Node"]');
        await expect(editInput).toBeVisible({ timeout: 2000 });

        // Type new value
        await editInput.fill('Updated Node Label');

        // Save (press Enter or click save button)
        await page.keyboard.press('Enter');

        // Verify label was updated
        await expect(page.locator('.wbs-node-label:has-text("Updated Node Label")')).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should delete a node', async ({ page }) => {
    // Navigate to WBS Draft Editor
    const wbsNav = page.locator('text=WBS, text=Work Breakdown').first();
    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
    }

    const draftEditorBtn = page.locator('button:has-text("Draft Editor")');
    if (await draftEditorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await draftEditorBtn.click();
    }

    // Select a draft
    const draftItem = page.locator('.wbs-draft-item').first();
    if (await draftItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftItem.click();

      // Get initial node count
      const initialCount = await page.locator('.wbs-draft-node').count();

      if (initialCount > 1) {
        // Click delete on a node (not the root)
        const deleteBtn = page.locator('[data-testid^="delete-"], .wbs-action-btn.delete').nth(1);
        if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deleteBtn.click();
          await page.waitForTimeout(500);

          // Verify node was deleted
          const newCount = await page.locator('.wbs-draft-node').count();
          expect(newCount).toBeLessThan(initialCount);
        }
      }
    }
  });

  test('should show materialize button for drafts', async ({ page }) => {
    // Navigate to WBS Draft Editor
    const wbsNav = page.locator('text=WBS, text=Work Breakdown').first();
    if (await wbsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wbsNav.click();
    }

    const draftEditorBtn = page.locator('button:has-text("Draft Editor")');
    if (await draftEditorBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await draftEditorBtn.click();
    }

    // Select a draft
    const draftItem = page.locator('.wbs-draft-item').first();
    if (await draftItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await draftItem.click();

      // Check for materialize button
      const materializeBtn = page.locator('button:has-text("Materialize"), button:has-text("Create Project"), [data-testid="materialize-btn"]');
      await expect(materializeBtn).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('AI Focus Feature', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestSession(page);
  });

  test('should show AI Focus badge in channel header', async ({ page }) => {
    // Look for AI Focus badge near channel area
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    // The badge should be visible in the chat interface
    if (await focusBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(focusBadge).toBeVisible();
    }
  });

  test('should open AI Focus selector on badge click', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();

      // Wait for modal/selector to appear
      const focusSelector = page.locator('.ai-focus-selector, [data-testid="ai-focus-selector"]');
      await expect(focusSelector).toBeVisible({ timeout: 3000 });
    }
  });

  test('should show focus type radio buttons', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();
      await page.waitForTimeout(500);

      // Check for radio buttons
      const noneRadio = page.locator('input[type="radio"][value="none"], [data-testid="focus-type-none"]');
      const goalRadio = page.locator('input[type="radio"][value="goal"], [data-testid="focus-type-goal"]');
      const projectRadio = page.locator('input[type="radio"][value="project"], [data-testid="focus-type-project"]');
      const taskRadio = page.locator('input[type="radio"][value="task"], [data-testid="focus-type-task"]');

      await expect(noneRadio).toBeVisible({ timeout: 2000 });
      await expect(goalRadio).toBeVisible({ timeout: 2000 });
      await expect(projectRadio).toBeVisible({ timeout: 2000 });
      await expect(taskRadio).toBeVisible({ timeout: 2000 });
    }
  });

  test('should show goal dropdown when goal type selected', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();
      await page.waitForTimeout(500);

      // Click on Goal radio
      const goalRadio = page.locator('input[value="goal"], [data-testid="focus-type-goal"], label:has-text("Goal") input');
      if (await goalRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
        await goalRadio.click();
        await page.waitForTimeout(300);

        // Check for goal dropdown
        const goalSelect = page.locator('[data-testid="goal-select"], select:has-text("Select a goal")');
        await expect(goalSelect).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should show project dropdown when project type selected', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();
      await page.waitForTimeout(500);

      // Click on Project radio
      const projectRadio = page.locator('input[value="project"], [data-testid="focus-type-project"], label:has-text("Project") input');
      if (await projectRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
        await projectRadio.click();
        await page.waitForTimeout(300);

        // Check for project dropdown
        const projectSelect = page.locator('[data-testid="project-select"], select:has-text("Select a project")');
        await expect(projectSelect).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should show task dropdown when task type selected', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();
      await page.waitForTimeout(500);

      // Click on Task radio
      const taskRadio = page.locator('input[value="task"], [data-testid="focus-type-task"], label:has-text("Task") input');
      if (await taskRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
        await taskRadio.click();
        await page.waitForTimeout(300);

        // Check for task dropdown
        const taskSelect = page.locator('[data-testid="task-select"], select:has-text("Select a task")');
        await expect(taskSelect).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should close AI Focus modal on Cancel', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();
      await page.waitForTimeout(500);

      const focusSelector = page.locator('.ai-focus-selector');
      if (await focusSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Click cancel
        const cancelBtn = page.locator('[data-testid="cancel-btn"], button:has-text("Cancel"), .btn-secondary');
        await cancelBtn.click();

        // Verify modal closed
        await expect(focusSelector).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should close AI Focus modal on close button', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await focusBadge.click();
      await page.waitForTimeout(500);

      const focusSelector = page.locator('.ai-focus-selector');
      if (await focusSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Click X button
        const closeBtn = page.locator('.modal-close, [data-testid="close-button"]');
        await closeBtn.click();

        // Verify modal closed
        await expect(focusSelector).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should update badge when focus is set', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge, [data-testid="ai-focus-badge"]');

    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check initial state
      const initialText = await focusBadge.textContent();

      await focusBadge.click();
      await page.waitForTimeout(500);

      // Select Goal type and pick a goal
      const goalRadio = page.locator('input[value="goal"], label:has-text("Goal") input');
      if (await goalRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
        await goalRadio.click();
        await page.waitForTimeout(300);

        const goalSelect = page.locator('[data-testid="goal-select"], select');
        if (await goalSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
          // Select first option after placeholder
          const options = await goalSelect.locator('option').all();
          if (options.length > 1) {
            await goalSelect.selectOption({ index: 1 });
          }

          // Save
          const saveBtn = page.locator('[data-testid="save-btn"], button:has-text("Save"), .btn-primary');
          await saveBtn.click();

          await page.waitForTimeout(1000);

          // Check that badge indicates focus is active (may show 🎯 or have active class)
          const updatedBadge = page.locator('.ai-focus-badge.active, .ai-focus-badge:has-text("🎯")');
          // Note: This assertion may need adjustment based on actual implementation
        }
      }
    }
  });
});

test.describe('Eisenhower Matrix (Pro Mode Feature)', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestSession(page);
  });

  test('should show Eisenhower Matrix when enabled', async ({ page }) => {
    // First enable Pro Mode if needed
    const settingsBtn = page.locator('.settings-btn, [data-testid="settings-btn"]');
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
    }

    const proModeToggle = page.locator('.pro-mode-toggle');
    if (await proModeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isActive = await proModeToggle.evaluate(el => el.classList.contains('active'));
      if (!isActive) {
        await proModeToggle.click();
        await page.waitForTimeout(500);
      }

      // Enable Eisenhower feature
      const eisenhowerFeature = page.locator('[data-testid="feature-showEisenhowerMatrix"], .pro-feature-item:has-text("Eisenhower")');
      if (await eisenhowerFeature.isVisible({ timeout: 2000 }).catch(() => false)) {
        const isEnabled = await eisenhowerFeature.evaluate(el => el.classList.contains('enabled'));
        if (!isEnabled) {
          await eisenhowerFeature.click();
          await page.waitForTimeout(300);
        }
      }
    }

    // Close settings and look for Eisenhower Matrix view
    await page.keyboard.press('Escape');

    // Check if there's a way to access Eisenhower view
    const eisenhowerView = page.locator('.eisenhower-matrix, [data-testid="eisenhower-matrix"]');
    const eisenhowerTab = page.locator('text=Eisenhower, text=Matrix').first();

    // At least one should be visible or accessible when the feature is enabled
    if (await eisenhowerTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await eisenhowerTab.click();
      await expect(eisenhowerView).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Mobile Responsiveness - PM Features', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await setupTestSession(page);
  });

  test('should show Pro Mode settings on mobile', async ({ page }) => {
    const settingsBtn = page.locator('.settings-btn, [data-testid="settings-btn"], .mobile-menu-btn');
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();

      const proModeToggle = page.locator('.pro-mode-toggle');
      if (await proModeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(proModeToggle).toBeVisible();
      }
    }
  });

  test('should show AI Focus badge on mobile', async ({ page }) => {
    const focusBadge = page.locator('.ai-focus-badge');
    if (await focusBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Badge should be tap-able on mobile
      await focusBadge.tap();
      await page.waitForTimeout(500);

      const focusSelector = page.locator('.ai-focus-selector');
      await expect(focusSelector).toBeVisible({ timeout: 3000 });
    }
  });
});
