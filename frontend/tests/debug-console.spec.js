import { test } from '@playwright/test';

test('capture console errors when navigating to project', async ({ page }) => {
  const consoleMessages = [];
  const consoleErrors = [];

  // Listen to console events
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(text);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  // Listen to page errors
  page.on('pageerror', error => {
    console.log('❌ PAGE ERROR:', error.message);
    consoleErrors.push(`PAGE ERROR: ${error.message}\n${error.stack}`);
  });

  // Auto-login
  await page.goto('/test-login');
  await page.waitForURL('/', { timeout: 15000 });
  await page.waitForSelector('text=Your Projects', { timeout: 15000 });

  console.log('✅ Logged in successfully');

  // Click on first project
  await page.click('text=Test an online app that I built');

  // Wait a bit for any errors to appear
  await page.waitForTimeout(5000);

  // Log all console errors
  if (consoleErrors.length > 0) {
    console.log('\n🔴 CONSOLE ERRORS FOUND:');
    consoleErrors.forEach((err, idx) => {
      console.log(`\nError ${idx + 1}:`);
      console.log(err);
    });
  } else {
    console.log('\n✅ No console errors found');
  }

  // Log last few console messages for context
  console.log('\n📋 Last 10 console messages:');
  consoleMessages.slice(-10).forEach(msg => console.log(msg));

  // Take screenshot
  await page.screenshot({ path: 'tests/screenshots/debug-console.png', fullPage: true });
});
