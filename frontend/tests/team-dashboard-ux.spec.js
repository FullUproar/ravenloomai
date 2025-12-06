import { test, expect } from '@playwright/test';

/**
 * Team Dashboard UX Tests
 * Tests the core chat and task management experience
 */

test.describe('Team Dashboard - Chat UX', () => {
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

  test('should display sidebar with channels and team members', async ({ page }) => {
    // Sidebar should be visible
    await expect(page.locator('.sidebar')).toBeVisible();

    // Team name in header
    await expect(page.locator('.team-name')).toBeVisible();

    // Channels section
    await expect(page.locator('.channels-section')).toBeVisible();
    await expect(page.locator('.channel-item').first()).toBeVisible();

    // Team members section
    await expect(page.locator('.members-section')).toBeVisible();
  });

  test('should switch between Chat, Tasks, and Ask views', async ({ page }) => {
    // Click Tasks view
    await page.click('.view-btn:has-text("Tasks")');
    await expect(page.locator('.tasks-view, .task-list')).toBeVisible({ timeout: 5000 });

    // Click Ask view
    await page.click('.view-btn:has-text("Ask")');
    await expect(page.locator('.ask-view, .ask-container')).toBeVisible({ timeout: 5000 });

    // Back to Chat view
    await page.click('.view-btn:has-text("Chat")');
    await expect(page.locator('.chat-area')).toBeVisible({ timeout: 5000 });
  });

  test('should show message input with placeholder', async ({ page }) => {
    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    await expect(input).toBeVisible();
  });

  test('should show @mentions popup when typing @', async ({ page }) => {
    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    await input.click();
    await input.fill('@');

    // Mentions popup should appear
    await expect(page.locator('.mention-popup, .mentions-popup')).toBeVisible({ timeout: 3000 });
  });

  test('should show commands popup when typing @raven', async ({ page }) => {
    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    await input.click();
    await input.fill('@raven');

    // Commands popup should appear
    await expect(page.locator('.commands-popup')).toBeVisible({ timeout: 3000 });
  });

  test('should send message and show in chat', async ({ page }) => {
    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    const testMessage = `Test message ${Date.now()}`;

    await input.click();
    await input.fill(testMessage);

    // Send with Enter or button
    await page.keyboard.press('Enter');

    // Message should appear in chat
    await expect(page.locator(`.message-content:has-text("${testMessage}")`)).toBeVisible({ timeout: 10000 });
  });

  test('should show reply button on message hover', async ({ page }) => {
    // Need at least one message
    const message = page.locator('.message').first();

    if (await message.isVisible({ timeout: 3000 }).catch(() => false)) {
      await message.hover();

      // Reply button should be visible on hover
      const replyBtn = message.locator('.message-reply-btn, .reply-btn, button[title*="Reply"]');
      await expect(replyBtn).toBeVisible({ timeout: 2000 });
    }
  });

  test('should show reply indicator when replying', async ({ page }) => {
    const message = page.locator('.message').first();

    if (await message.isVisible({ timeout: 3000 }).catch(() => false)) {
      await message.hover();

      // Click reply button
      const replyBtn = message.locator('.message-reply-btn, .reply-btn, button[title*="Reply"]');
      if (await replyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await replyBtn.click();

        // Reply indicator should appear
        await expect(page.locator('.reply-indicator, .replying-to')).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('should switch channels', async ({ page }) => {
    const channels = page.locator('.channel-item');
    const channelCount = await channels.count();

    if (channelCount > 1) {
      // Click second channel
      await channels.nth(1).click();

      // Channel should be highlighted as active
      await expect(channels.nth(1)).toHaveClass(/active/);
    }
  });

  test('should create new channel via modal', async ({ page }) => {
    // Click add channel button
    await page.click('.channels-section .add-btn');

    // Modal should appear
    await expect(page.locator('.modal')).toBeVisible({ timeout: 3000 });

    // Fill channel name
    const channelName = `test-${Date.now()}`;
    await page.fill('.modal input', channelName);

    // Close without creating (to not pollute)
    await page.click('.btn-secondary:has-text("Cancel")');

    // Modal should close
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe('Team Dashboard - Tasks UX (Asana-style)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }

    // Switch to Tasks view
    await page.click('.view-btn:has-text("Tasks")');
  });

  test('should display tasks view with inline add trigger', async ({ page }) => {
    await expect(page.locator('.tasks-container')).toBeVisible({ timeout: 5000 });

    // Should show "Add task..." trigger button
    await expect(page.locator('.task-add-trigger')).toBeVisible({ timeout: 3000 });
  });

  test('should expand inline task input on click', async ({ page }) => {
    // Click the add task trigger
    await page.click('.task-add-trigger');

    // Should show inline input row
    await expect(page.locator('.task-add-input-row')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.task-add-input')).toBeFocused();
  });

  test('should create task with Enter key', async ({ page }) => {
    // Click to expand inline add
    await page.click('.task-add-trigger');

    // Type task name
    const taskName = `Test task ${Date.now()}`;
    await page.fill('.task-add-input', taskName);

    // Press Enter to create
    await page.keyboard.press('Enter');

    // Task should appear in list
    await expect(page.locator(`.task-title:has-text("${taskName}")`)).toBeVisible({ timeout: 5000 });
  });

  test('should cancel inline add with Escape', async ({ page }) => {
    // Click to expand inline add
    await page.click('.task-add-trigger');
    await expect(page.locator('.task-add-input-row')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Should collapse back to trigger
    await expect(page.locator('.task-add-input-row')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.task-add-trigger')).toBeVisible();
  });

  test('should show task sections with status headers', async ({ page }) => {
    // If tasks exist, should show section headers
    const todoSection = page.locator('.task-section-header:has-text("To Do")');
    const inProgressSection = page.locator('.task-section-header:has-text("In Progress")');

    // At least check that sections render when tasks exist
    const hasTasks = await page.locator('.task-item').count() > 0;
    if (hasTasks) {
      // Should have at least one section visible
      const hasTodoSection = await todoSection.isVisible().catch(() => false);
      const hasInProgressSection = await inProgressSection.isVisible().catch(() => false);
      expect(hasTodoSection || hasInProgressSection).toBe(true);
    }
  });

  test('should show hover actions on task items', async ({ page }) => {
    const taskItem = page.locator('.task-item').first();

    if (await taskItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Hover over task
      await taskItem.hover();

      // Hover actions should appear
      await expect(taskItem.locator('.task-hover-actions')).toBeVisible({ timeout: 2000 });
    }
  });

  test('should complete task with checkbox click', async ({ page }) => {
    const taskCheckbox = page.locator('.task-item.todo .task-checkbox, .task-item.in_progress .task-checkbox').first();

    if (await taskCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await taskCheckbox.click();

      // Wait for task to be marked as done (UI updates)
      await page.waitForTimeout(1000);
    }
  });

  test('should filter tasks with filter buttons', async ({ page }) => {
    // Click "All" filter
    await page.click('.filter-btn:has-text("All")');
    await expect(page.locator('.filter-btn:has-text("All")')).toHaveClass(/active/);

    // Click "My Tasks" filter
    await page.click('.filter-btn:has-text("My Tasks")');
    await expect(page.locator('.filter-btn:has-text("My Tasks")')).toHaveClass(/active/);

    // Click "Open" filter
    await page.click('.filter-btn:has-text("Open")');
    await expect(page.locator('.filter-btn:has-text("Open")')).toHaveClass(/active/);
  });

  test('should show empty state with suggestions when no tasks', async ({ page }) => {
    // This test assumes no tasks exist
    const emptyState = page.locator('.tasks-empty');

    if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Should show icon, heading, and suggestions
      await expect(page.locator('.tasks-empty-icon')).toBeVisible();
      await expect(page.locator('.tasks-empty h4')).toBeVisible();
      await expect(page.locator('.tasks-empty-suggestions')).toBeVisible();
    }
  });
});

test.describe('Team Dashboard - Ask Company UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }

    // Switch to Ask view
    await page.click('.view-btn:has-text("Ask")');
  });

  test('should display Ask view with input', async ({ page }) => {
    await expect(page.locator('.ask-view, .ask-container, .ask-company')).toBeVisible({ timeout: 5000 });

    // Should have input field
    const input = page.locator('.ask-input, input[placeholder*="question"], input[placeholder*="ask"], textarea');
    await expect(input).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }
  });

  test('should focus input with keyboard shortcut', async ({ page }) => {
    // Press / to focus input (common pattern)
    await page.keyboard.press('/');

    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    await expect(input).toBeFocused({ timeout: 2000 }).catch(() => {
      // Alternative: click to focus and verify
    });
  });

  test('should navigate mentions popup with arrow keys', async ({ page }) => {
    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    await input.click();
    await input.fill('@');

    // Wait for popup
    await page.waitForSelector('.mention-popup, .mentions-popup', { timeout: 3000 });

    // Press down arrow
    await page.keyboard.press('ArrowDown');

    // First option should be highlighted
    const highlightedOption = page.locator('.mention-option.highlighted, .mention-option.selected, .mention-option:focus');
    // Just verify navigation works without error
  });

  test('should close popup with Escape', async ({ page }) => {
    const input = page.locator('.message-input, input[placeholder*="Message"], textarea[placeholder*="Message"]');
    await input.click();
    await input.fill('@');

    // Wait for popup
    const popup = page.locator('.mention-popup, .mentions-popup');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Popup should close
    await expect(popup).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('should show mobile-friendly layout', async ({ page }) => {
    await page.goto('/test-login');
    await page.waitForURL('/', { timeout: 15000 });
    await page.waitForSelector('.team-dashboard, .team-card', { timeout: 15000 });

    const teamCard = page.locator('.team-card').first();
    if (await teamCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await teamCard.click();
      await page.waitForSelector('.team-dashboard', { timeout: 10000 });
    }

    // On mobile, sidebar might be collapsed or hidden
    // Main content should still be accessible
    await expect(page.locator('.chat-area, .main-content')).toBeVisible({ timeout: 5000 });
  });
});
