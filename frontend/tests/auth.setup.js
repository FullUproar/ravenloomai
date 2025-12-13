import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

// Test account credentials
const TEST_EMAIL = process.env.TEST_EMAIL || 'shawnoahpollock@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '$$TESTaccount';

setup('authenticate with login page', async ({ page }) => {
  console.log('Navigating to login page...');

  // Navigate to home, which will show login if not authenticated
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Check if already authenticated (might have existing session)
  const isLoggedIn = await page.locator('text=Your Projects').isVisible().catch(() => false);

  if (!isLoggedIn) {
    console.log('Logging in with test credentials...');

    // Find and fill email input
    const emailInput = page.locator('input[type="email"], input[placeholder*="mail"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
    }

    // Find and fill password input
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(TEST_PASSWORD);
    }

    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log in")');
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
    }

    // Wait for redirect to dashboard
    console.log('Waiting for login to complete...');
    await page.waitForURL('/', { timeout: 30000 });
  }

  // Wait for dashboard to load
  console.log('Verifying dashboard loaded...');
  try {
    await page.waitForSelector('text=Your Projects', { timeout: 15000 });
  } catch (e) {
    // If no "Your Projects", check for digest page
    await page.waitForSelector('.digest-page', { timeout: 5000 });
  }

  // Wait extra time for Firebase to fully set auth tokens
  console.log('Waiting for auth to stabilize...');
  await page.waitForTimeout(2000);

  console.log('✅ Login successful! Saving auth state...');
  await page.context().storageState({ path: authFile });
  console.log('✅ Auth state saved to', authFile);

  // Verify what was saved
  const fs = await import('fs');
  const savedState = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  console.log('📦 Cookies saved:', savedState.cookies?.length || 0);
  console.log('📦 Origins saved:', savedState.origins?.length || 0);
});
