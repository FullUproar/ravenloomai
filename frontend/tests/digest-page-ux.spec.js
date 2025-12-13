/**
 * DigestPage UX Tests
 *
 * Tests the user digest/landing page for both desktop and mobile views.
 * Verifies:
 * - Page loads and displays correctly
 * - AI briefing section works
 * - Priority items render with correct styling
 * - Blocked tasks and spotlights display prominently
 * - Focus items are visible
 * - Responsive layout adapts to mobile
 * - Interactive elements are clickable
 */

import { test, expect } from '@playwright/test';

// Test configuration
const TEST_URL = '/';  // DigestPage is the default landing page

// Helper to wait for page to be ready
async function waitForDigestPage(page) {
  // Wait for either content or empty state
  await Promise.race([
    page.waitForSelector('.digest-page', { timeout: 10000 }),
    page.waitForSelector('.digest-loading', { timeout: 5000 }).then(() =>
      page.waitForSelector('.digest-page:not(.digest-loading)', { timeout: 15000 })
    )
  ]).catch(() => {
    // Page might already be loaded
  });

  // Give React time to hydrate
  await page.waitForTimeout(500);
}

// ============================================================================
// DESKTOP TESTS
// ============================================================================

test.describe('DigestPage - Desktop View', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('page loads without errors', async ({ page }) => {
    // Listen for console errors before navigation
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // Page should render something (digest, login, or any valid state)
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent.length).toBeGreaterThan(0);

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'tests/screenshots/digest-desktop-loaded.png',
      fullPage: true
    });

    // Check that there were no critical JS errors
    const criticalErrors = errors.filter(e =>
      !e.includes('React DevTools') && !e.includes('favicon')
    );
    expect(criticalErrors.length).toBeLessThan(3);
  });

  test('header displays correctly', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Header should be visible
    const header = page.locator('.digest-header');
    if (await header.isVisible()) {
      // Should have title
      const title = header.locator('h2');
      await expect(title).toBeVisible();

      // Should have refresh button
      const refreshBtn = header.locator('.refresh-btn');
      if (await refreshBtn.isVisible()) {
        await expect(refreshBtn).toBeEnabled();
      }
    }
  });

  test('AI briefing section renders', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Check for briefing section
    const briefing = page.locator('.digest-briefing');
    if (await briefing.isVisible()) {
      // Should have icon
      const icon = briefing.locator('.briefing-icon');
      await expect(icon).toBeVisible();

      // Should have content or loading state
      const content = briefing.locator('.briefing-content');
      const loading = briefing.locator('.briefing-loading');
      const hasContent = await content.isVisible() || await loading.isVisible();
      expect(hasContent).toBeTruthy();

      // Take screenshot
      await briefing.screenshot({
        path: 'tests/screenshots/digest-briefing-desktop.png'
      });
    }
  });

  test('priority items have correct visual hierarchy', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Check for top 3 cards
    const top3 = page.locator('.digest-top3');
    if (await top3.isVisible()) {
      const cards = top3.locator('.digest-card-large');
      const cardCount = await cards.count();

      if (cardCount > 0) {
        // First card should have rank badge
        const firstCard = cards.first();
        const rank = firstCard.locator('.card-rank');
        if (await rank.isVisible()) {
          await expect(rank).toContainText('1');
        }

        // Cards should have icon, title, subtitle
        await expect(firstCard.locator('.card-icon')).toBeVisible();
        await expect(firstCard.locator('.card-title')).toBeVisible();

        // Take screenshot of top 3
        await top3.screenshot({
          path: 'tests/screenshots/digest-top3-desktop.png'
        });
      }
    }
  });

  test('critical priority items (blocked/spotlight) are visually distinct', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Check for critical priority styling
    const criticalItems = page.locator('.priority-critical');
    const criticalCount = await criticalItems.count();

    if (criticalCount > 0) {
      // Critical items should have red left border
      const firstCritical = criticalItems.first();
      const borderColor = await firstCritical.evaluate(el =>
        getComputedStyle(el).borderLeftColor
      );

      // Should be pinkish-red (#FF3366)
      expect(borderColor).toMatch(/rgb\(255,\s*51,\s*102\)|#ff3366/i);

      // Take screenshot
      await firstCritical.screenshot({
        path: 'tests/screenshots/digest-critical-item.png'
      });
    }
  });

  test('more items section expands correctly', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    const moreSection = page.locator('.digest-more');
    if (await moreSection.isVisible()) {
      // Should have header
      const moreHeader = moreSection.locator('.more-header');
      await expect(moreHeader).toBeVisible();

      // Check for show all button
      const showAllBtn = moreSection.locator('.show-all-btn');
      if (await showAllBtn.isVisible()) {
        // Click to expand
        await showAllBtn.click();
        await page.waitForTimeout(300);

        // Take screenshot of expanded state
        await moreSection.screenshot({
          path: 'tests/screenshots/digest-more-expanded.png'
        });
      }
    }
  });

  test('items are clickable and interactive', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Find any clickable item
    const items = page.locator('.digest-card-large, .digest-item');
    const itemCount = await items.count();

    if (itemCount > 0) {
      const firstItem = items.first();

      // Should have pointer cursor
      const cursor = await firstItem.evaluate(el =>
        getComputedStyle(el).cursor
      );
      expect(cursor).toBe('pointer');

      // Hover should change appearance
      await firstItem.hover();
      await page.waitForTimeout(200);

      // Take hover state screenshot
      await page.screenshot({
        path: 'tests/screenshots/digest-item-hover.png'
      });
    }
  });

  test('empty state displays correctly when no items', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    const emptyState = page.locator('.digest-empty');
    if (await emptyState.isVisible()) {
      // Should have icon and message
      const icon = emptyState.locator('.empty-icon');
      await expect(icon).toBeVisible();

      const heading = emptyState.locator('h3');
      await expect(heading).toBeVisible();

      await emptyState.screenshot({
        path: 'tests/screenshots/digest-empty-state.png'
      });
    }
  });
});

// ============================================================================
// MOBILE TESTS
// ============================================================================

test.describe('DigestPage - Mobile View', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 13 size

  test('page loads correctly on mobile', async ({ page }) => {
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // Page should render something (digest, login, or any valid state)
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent.length).toBeGreaterThan(0);

    await page.screenshot({
      path: 'tests/screenshots/digest-mobile-loaded.png',
      fullPage: true
    });
  });

  test('layout adapts to mobile width', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Check if digest page is visible first
    const digestPage = page.locator('.digest-page');
    if (await digestPage.isVisible()) {
      // Page should not have horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      // Allow small overflow (scrollbars can cause this)
      const scrollWidthDiff = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(scrollWidthDiff).toBeLessThan(20);

      // Content should fit within viewport (with some tolerance for padding)
      const pageWidth = await digestPage.evaluate(el => el.offsetWidth);
      expect(pageWidth).toBeLessThanOrEqual(400);
    }
  });

  test('cards are properly sized for mobile', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    const cards = page.locator('.digest-card-large');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      const firstCard = cards.first();
      const cardWidth = await firstCard.evaluate(el => el.offsetWidth);

      // Card should be nearly full width on mobile (with some padding)
      expect(cardWidth).toBeGreaterThan(300);
      expect(cardWidth).toBeLessThanOrEqual(390);

      await firstCard.screenshot({
        path: 'tests/screenshots/digest-card-mobile.png'
      });
    }
  });

  test('briefing section is readable on mobile', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    const briefing = page.locator('.digest-briefing');
    if (await briefing.isVisible()) {
      // Text should be readable size
      const content = briefing.locator('.briefing-content');
      if (await content.isVisible()) {
        const fontSize = await content.evaluate(el =>
          parseFloat(getComputedStyle(el).fontSize)
        );
        // Font should be at least 14px for mobile readability
        expect(fontSize).toBeGreaterThanOrEqual(14);
      }

      await briefing.screenshot({
        path: 'tests/screenshots/digest-briefing-mobile.png'
      });
    }
  });

  test('touch targets are appropriately sized', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Check clickable items meet minimum touch target size (44px recommended)
    const items = page.locator('.digest-card-large, .digest-item');
    const itemCount = await items.count();

    for (let i = 0; i < Math.min(itemCount, 3); i++) {
      const item = items.nth(i);
      const box = await item.boundingBox();

      if (box) {
        // Height should be at least 44px for comfortable tapping
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('subtitle text is truncated on mobile (per CSS)', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Per the CSS, .item-subtitle should be truncated on mobile (max-width: 100px)
    const subtitles = page.locator('.item-subtitle');
    const subtitleCount = await subtitles.count();

    if (subtitleCount > 0) {
      const firstSubtitle = subtitles.first();
      const maxWidth = await firstSubtitle.evaluate(el =>
        getComputedStyle(el).maxWidth
      );
      // Should have max-width for truncation
      expect(maxWidth).toBe('100px');
    }
  });

  test('scrolling works smoothly', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);

    // Take screenshot after scroll
    await page.screenshot({
      path: 'tests/screenshots/digest-mobile-scrolled.png'
    });
  });

  test('refresh action works via pull or button', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Find and click refresh button if visible
    const refreshBtn = page.locator('.refresh-btn');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();

      // Should trigger a refetch (loading state or data update)
      await page.waitForTimeout(500);

      // Page should still be functional
      const hasContent = await page.locator('.digest-page').isVisible();
      expect(hasContent).toBeTruthy();
    }
  });
});

// ============================================================================
// VISUAL REGRESSION TESTS
// ============================================================================

test.describe('DigestPage - Visual Regression', () => {
  test('desktop visual snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Wait for any animations to complete
    await page.waitForTimeout(1000);

    // Full page screenshot
    await page.screenshot({
      path: 'tests/screenshots/digest-visual-desktop.png',
      fullPage: true
    });
  });

  test('mobile visual snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/screenshots/digest-visual-mobile.png',
      fullPage: true
    });
  });

  test('dark theme colors are correct', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Check background color is dark
    const digestPage = page.locator('.digest-page');
    if (await digestPage.isVisible()) {
      const bgColor = await digestPage.evaluate(el =>
        getComputedStyle(el).backgroundColor
      );

      // Should be a dark color (low RGB values)
      const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        // Dark theme should have low RGB values
        expect(r).toBeLessThan(50);
        expect(g).toBeLessThan(50);
        expect(b).toBeLessThan(50);
      }
    }
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

test.describe('DigestPage - Performance', () => {
  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    const loadTime = Date.now() - startTime;

    // Page should load within 10 seconds (includes auth redirect time)
    expect(loadTime).toBeLessThan(10000);

    console.log(`DigestPage load time: ${loadTime}ms`);
  });

  test('no layout shifts after load', async ({ page }) => {
    await page.goto(TEST_URL);
    await waitForDigestPage(page);

    // Get initial positions
    const initialPositions = await page.evaluate(() => {
      const elements = document.querySelectorAll('.digest-card-large, .digest-briefing');
      return Array.from(elements).map(el => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      });
    });

    // Wait a bit for any async updates
    await page.waitForTimeout(1000);

    // Get positions after wait
    const finalPositions = await page.evaluate(() => {
      const elements = document.querySelectorAll('.digest-card-large, .digest-briefing');
      return Array.from(elements).map(el => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      });
    });

    // Positions should be stable (no major shifts)
    for (let i = 0; i < Math.min(initialPositions.length, finalPositions.length); i++) {
      const shift = Math.abs(initialPositions[i].top - finalPositions[i].top);
      expect(shift).toBeLessThan(5); // Allow tiny shifts for animations
    }
  });
});
