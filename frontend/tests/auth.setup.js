import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

// Test account credentials
const TEST_EMAIL = process.env.TEST_EMAIL || 'shawnoahpollock@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '$$TESTaccount';

setup('authenticate with test login page', async ({ page }) => {
  console.log('Navigating to test login page...');

  // Navigate to auto-login page
  await page.goto('/test-login');

  // Wait for the auto-login to complete and redirect
  console.log('Waiting for auto-login to complete...');
  await page.waitForURL('/', { timeout: 10000 });

  // Wait for dashboard to load - look for "Your Projects" heading
  console.log('Verifying dashboard loaded...');
  await page.waitForSelector('text=Your Projects', { timeout: 10000 });

  console.log('✅ Login successful! Saving auth state...');
  await page.context().storageState({ path: authFile });
  console.log('✅ Auth state saved to', authFile);
});
