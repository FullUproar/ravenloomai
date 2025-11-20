import { test as setup } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate with Google', async ({ page }) => {
  // Navigate to your app
  await page.goto('/');

  // Click "Get Started" or sign in button
  await page.click('button:has-text("Get Started")');

  // Click Google sign-in button (adjust selector as needed)
  await page.click('button:has-text("Continue with Google")');

  // ** PAUSE HERE FOR MANUAL LOGIN **
  // The test will pause and wait for you to manually log in with Google
  await page.pause();

  // Wait for successful login - adjust selector to match your logged-in state
  await page.waitForSelector('text=RavenLoom', { timeout: 60000 });

  // Save the authentication state
  await page.context().storageState({ path: authFile });
});
