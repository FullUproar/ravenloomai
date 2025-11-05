# Quick Start - Visual Testing Guide

## What You Have Now

You now have **visual testing capabilities** for both component-level and end-to-end testing! Here's how to use them.

## 1. Storybook - Component Visual Testing

### What Is It?
Storybook lets you view and interact with components in isolation without running the full app. Perfect for:
- Seeing what a component looks like
- Testing different states (loading, error, success)
- Testing edge cases (long text, empty data)
- Visual regression testing
- Component documentation

### How to Use It

**Start Storybook:**
```bash
cd frontend
npm run storybook
```

**What You'll See:**
- Opens automatically at [http://localhost:6006](http://localhost:6006)
- Left sidebar: Browse components
- Center: Live component preview
- Right panel: Controls to change props
- Bottom: Accessibility checks

**Example - TaskCard Component:**

Currently available with **20+ variations**:
- Default (not started)
- In Progress
- Completed
- Blocked
- Cancelled
- High/Medium/Low Priority
- Overdue
- Long title/description
- Loading state
- Error state
- All context types (@phone, @home, @office, @computer, @errands, @anywhere)

**Try This:**
1. Open Storybook
2. Click "Components" → "TaskCard" in sidebar
3. Click any story (e.g., "In Progress")
4. See the component render instantly
5. Use Controls panel to change props
6. See changes in real-time

### Screenshots

When viewing TaskCard stories, you'll see:

**Default Story:**
- Task card with "not started" status
- Medium priority badge
- Due date
- Context badge (@phone)

**Overdue Story:**
- Red left border
- Red "Overdue" label
- Everything else like default

**Interactive Story:**
- Click buttons to trigger actions
- Watch console for event logs
- Test real interactions

## 2. Cypress - End-to-End Visual Testing

### What Is It?
Cypress lets you test complete user flows in a real browser with visual feedback. Perfect for:
- Testing full workflows
- Seeing tests run in real-time
- Debugging with screenshots
- Recording test runs
- Testing API interactions

### How to Use It

**Interactive Mode (Watch Tests Run):**
```bash
cd frontend
npm run cypress:open
```

**What You'll See:**
- Cypress UI opens
- Click "E2E Testing"
- Select browser (Chrome recommended)
- Click "Start E2E Testing"
- See list of test files
- Click any test to run it

**Headless Mode (CI/CD):**
```bash
npm run cypress:run
```

**Example Test - Goal Creation:**

The goal-creation.cy.js test includes:
1. ✅ Create measurable goal via chat
2. ✅ Update goal progress
3. ✅ Create goal via form
4. ✅ Mark goal as completed
5. ✅ Filter goals by status
6. ✅ Record metric for goal
7. ✅ Handle errors gracefully

**Try This:**
1. Start your frontend dev server: `npm run dev`
2. In another terminal: `npm run cypress:open`
3. Click "E2E Testing"
4. Select Chrome
5. Click "goal-creation.cy.js"
6. Watch the magic happen!

### What You'll See During Tests

**Real-Time Execution:**
- Each test step highlighted in sidebar
- Browser showing actual UI
- Elements being clicked
- Forms being filled
- Assertions passing/failing

**On Failure:**
- Automatic screenshot taken
- Error details shown
- Stack trace available
- Can replay and debug

**On Success:**
- Green checkmarks
- Test completion time
- Video recording saved
- Screenshots for each step

## 3. Real-World Testing Workflow

### For Component Development

**Step 1:** Create component
```javascript
// TaskCard.jsx
function TaskCard({ task }) {
  return <div className="task-card">{task.title}</div>;
}
```

**Step 2:** Create stories
```javascript
// TaskCard.stories.jsx
export const Default = {
  args: {
    task: { id: 1, title: 'My Task', status: 'not_started' }
  }
};
```

**Step 3:** View in Storybook
```bash
npm run storybook
```

**Step 4:** Test different states
- Click through all stories
- Use Controls to modify props
- Check accessibility
- Get visual confirmation

**Step 5:** Build with confidence
- Component looks correct
- All states work
- Accessibility verified
- Ready for integration

### For Feature Development

**Step 1:** Write E2E test first (optional TDD)
```javascript
it('should create a goal', () => {
  cy.visit('/dashboard');
  cy.get('[data-testid="new-goal"]').click();
  cy.get('[data-testid="goal-title"]').type('My Goal');
  cy.get('[data-testid="submit"]').click();
  cy.contains('My Goal').should('be.visible');
});
```

**Step 2:** Run test (it fails - expected)
```bash
npm run cypress:open
```

**Step 3:** Implement feature
- Add components
- Wire up API calls
- Handle edge cases

**Step 4:** Run test again (it passes!)
```bash
npm run cypress:run
```

**Step 5:** Deploy with confidence
- Feature works end-to-end
- Visual confirmation
- Regression prevention

## 4. Available Test Scripts

### Storybook
```bash
npm run storybook              # Start dev server (port 6006)
npm run build-storybook        # Build static site
npm run test-storybook         # Run component tests with Vitest
```

### Cypress
```bash
npm run cypress:open           # Interactive mode
npm run cypress:run            # Headless mode
npm run test:e2e              # Alias for cypress:run
npm run test:e2e:headed       # Alias for cypress:open
```

### Backend Tests
```bash
cd backend
npm test                       # Run all tests
npm test -- validation.test.js # Run specific file
npm test -- --coverage        # With coverage report
```

## 5. What to Test Next

### Components for Storybook
Priority components to add stories for:

1. **GoalCard** - Show goal with progress bar
   - Active goal (30% progress)
   - Completed goal (100%)
   - Paused goal
   - Overdue goal

2. **ChatMessage** - Show chat bubbles
   - User message
   - AI message
   - Message with function result
   - Typing indicator

3. **PersonaSwitcher** - Show persona selection
   - Multiple personas
   - Active persona highlighted
   - Suggested persona

4. **OnboardingStep** - Show onboarding UI
   - Question displayed
   - Field extraction shown
   - Progress indicator

### E2E Tests for Cypress
Priority flows to test:

1. **Task Management**
   - Create task from chat
   - Update task status
   - Mark task as done
   - Filter by status

2. **Persona Switching**
   - Manual switch
   - Auto-switch trigger
   - Persona in messages

3. **Onboarding Flow**
   - Project onboarding
   - Field extraction
   - Persona selection

4. **Conversation**
   - Send message
   - Receive response
   - Function calls executed

## 6. Tips & Tricks

### Storybook Tips

**Live Editing:**
- Edit TaskCard.jsx or TaskCard.stories.jsx
- Save file
- Storybook auto-reloads
- See changes instantly

**Controls Panel:**
- Change any prop value
- Test edge cases easily
- No code changes needed

**Accessibility:**
- Check "Accessibility" tab
- See violations highlighted
- Fix issues before deployment

**Documentation:**
- Click "Docs" tab
- Auto-generated from JSDoc
- Shows all props
- Includes examples

### Cypress Tips

**Time Travel:**
- Hover over any command in sidebar
- See what UI looked like at that moment
- Click to pin that state
- Inspect elements

**Network Mocking:**
```javascript
cy.intercept('POST', '**/graphql', {
  statusCode: 200,
  body: { data: { goal: { id: 1, title: 'Mock Goal' } } }
});
```

**Custom Commands:**
- Use `cy.createGoal()` instead of API calls
- Use `cy.sendChatMessage()` for chat
- See [frontend/cypress/support/commands.js](frontend/cypress/support/commands.js)

**Screenshots:**
```javascript
cy.screenshot('goal-created');  // Manual screenshot
// Automatic screenshot on failure
```

**Video Recording:**
- Videos saved to `cypress/videos/`
- Recorded for all test runs
- Great for debugging CI failures

## 7. Common Issues

### Storybook Won't Start

**Problem:** Port 6006 in use
```bash
# Windows
netstat -ano | findstr :6006
taskkill /F /PID <PID>

# Mac/Linux
lsof -ti:6006 | xargs kill
```

**Problem:** Module not found
```bash
cd frontend
rm -rf node_modules
npm install
npm run storybook
```

### Cypress Can't Find Elements

**Problem:** Test fails with "element not found"

**Solution:** Add data-testid attributes
```javascript
// In your components
<button data-testid="new-goal-button">New Goal</button>

// In your test
cy.get('[data-testid="new-goal-button"]').click();
```

**Problem:** Test timing issues

**Solution:** Use proper waits
```javascript
// Bad - fixed timeout
cy.wait(5000);

// Good - wait for element
cy.get('[data-testid="goal-card"]', { timeout: 10000 })
  .should('be.visible');

// Better - wait for network
cy.intercept('POST', '**/graphql').as('createGoal');
cy.wait('@createGoal');
```

## 8. Next Steps

### This Week
1. ✅ Explore Storybook - Click through TaskCard stories
2. ✅ Run Cypress test - Watch goal-creation test
3. ✅ Read documentation - Review testing plans

### Next Week
1. Create GoalCard component with stories
2. Add E2E test for task management
3. Add data-testid attributes to existing components

### This Month
1. Add stories for all components
2. Write E2E tests for critical flows
3. Integrate visual regression testing
4. Set up CI/CD with automated tests

## 9. Resources

### Documentation
- [FRONTEND_TESTING_PLAN.md](FRONTEND_TESTING_PLAN.md) - Complete testing strategy
- [TESTING_PLAN.md](TESTING_PLAN.md) - Backend testing plan
- [ENGINEERING_IMPROVEMENTS.md](ENGINEERING_IMPROVEMENTS.md) - All improvements

### External
- [Storybook Documentation](https://storybook.js.org/docs)
- [Cypress Documentation](https://docs.cypress.io)
- [Testing Library](https://testing-library.com)

## 10. Quick Demo Script

Want to see everything in action? Follow this 5-minute demo:

**1. Start Storybook (Terminal 1):**
```bash
cd frontend
npm run storybook
```
→ Opens at http://localhost:6006

**2. Explore TaskCard:**
- Click "Components" → "TaskCard"
- Click "In Progress" story
- See blue badge, progress status
- Click "Blocked" story
- See red border, blocker reason
- Use Controls to change title

**3. Start Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
```
→ Opens at http://localhost:5173

**4. Run Cypress (Terminal 3):**
```bash
cd frontend
npm run cypress:open
```
→ Opens Cypress UI

**5. Run Goal Test:**
- Click "E2E Testing"
- Select Chrome
- Click "goal-creation.cy.js"
- Watch test create goal via chat
- See screenshots taken
- Check video recording

**Done!** You've seen both testing systems in action.

## 11. Screenshot Examples

### Storybook Views

**Component Browser:**
```
├── Components
│   └── TaskCard
│       ├── Default
│       ├── In Progress
│       ├── Completed
│       ├── Blocked
│       ├── Overdue
│       └── ... (15 more)
```

**Live Preview:**
Shows TaskCard rendering in real-time with all styling.

**Controls Panel:**
- task.title (text input)
- task.status (dropdown)
- task.priority (number)
- onEdit (action logger)

### Cypress Views

**Test Runner:**
```
✓ should create a measurable goal via chat (2.5s)
✓ should update goal progress (1.8s)
✓ should create goal via form (2.1s)
```

**Command Log:**
```
VISIT    /dashboard
CLICK    [data-testid="chat-toggle"]
TYPE     I want to lose 10 pounds
CLICK    [data-testid="send-button"]
ASSERT   contains "set up your goal"
```

**Screenshots:**
- goal-creation-ai-response.png
- goal-created-in-dashboard.png
- goal-progress-updated.png

## Ready to Go!

You now have:
- ✅ Storybook running on port 6006
- ✅ 20+ TaskCard stories ready to view
- ✅ Cypress installed and configured
- ✅ Example E2E test ready to run
- ✅ Custom commands for common operations
- ✅ Complete documentation

**Start with:** `npm run storybook` and explore the TaskCard component!

**Questions?** Check [BETTER_ENGINEERING_SUMMARY.md](BETTER_ENGINEERING_SUMMARY.md) for complete details.
