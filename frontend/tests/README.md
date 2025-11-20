# Playwright E2E Tests

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install browsers:
   ```bash
   npx playwright install chromium
   ```

## Running Tests

### Production Tests (against www.ravenloom.ai)
```bash
npm run test:playwright              # Headless mode
npm run test:playwright:headed       # See browser
npm run test:playwright:ui           # Interactive UI mode
npm run test:playwright:debug        # Debug mode
```

### Local Development Tests
```bash
TEST_LOCAL=1 npm run test:playwright
```

## Authentication Setup (One-Time)

Since the app uses Google OAuth, you need to authenticate once manually:

1. Run the auth setup (it will pause for you to login):
   ```bash
   npm run test:playwright -- auth.setup.js --headed
   ```

2. When the browser opens:
   - Click "Get Started"
   - Complete Google sign-in manually
   - **Important**: The test will pause - just wait after signing in
   - Press "Resume" in the Playwright inspector when you see your dashboard

3. Your authentication will be saved to `playwright/.auth/user.json`

4. All future tests will use this saved session automatically!

**Note**: If your session expires, just re-run step 1 to refresh it.

## What Gets Tested

### Work Sessions (`work-sessions.spec.js`)
- Session boundary visibility in chat
- Session start/end markers
- AI-generated session summaries
- Navigation between chat and sessions list
- End session modal and workflow

### Visual Regression
- UI component screenshots
- Layout consistency
- Mobile responsive views

## Screenshots

All test screenshots are saved to `tests/screenshots/`:
- `01-home.png` - Home page
- `02-work-view.png` - Work session view
- `03-active-session.png` - Active session indicator
- `04-chat-messages.png` - Chat with session boundaries
- `05-sessions-list.png` - Sessions history
- `06-end-session-modal.png` - End session dialog
- `07-session-ended.png` - Post-session state
- `08-session-summaries.png` - AI summaries view

## Test Reports

After running tests, view the HTML report:
```bash
npm run test:report
```

## CI/CD Integration

Tests can run in CI with:
```bash
CI=1 npm run test:playwright
```

This automatically:
- Runs headless
- Retries failed tests 2x
- Captures traces on failures
