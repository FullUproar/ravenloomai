# AI-Powered User Journey Testing

This directory contains comprehensive end-to-end tests that simulate realistic user behavior using AI-generated responses.

## Overview

Instead of hardcoded test scripts, these tests use OpenAI to generate natural, contextual responses based on user personas. This creates more realistic testing scenarios that better represent actual user behavior.

## Test Personas

We've created 6 realistic user personas based on research into common productivity challenges:

1. **Overwhelmed Startup Founder** (Sarah Chen)
   - Juggling product launch, fundraising, team management
   - High anxiety, constant context switching
   - Needs strategic, actionable guidance

2. **Fitness Struggler** (Mike Rodriguez)
   - Wants to lose 30 pounds
   - Starts strong then quits - all-or-nothing thinking
   - Needs supportive, non-judgmental approach

3. **Career Changer** (Lisa Park)
   - Transitioning from teaching to UX design
   - Learning while working full-time
   - Needs realistic encouragement and structure

4. **Distracted Remote Worker** (James Wilson)
   - Launching marketing campaign
   - Constant Slack interruptions, procrastination
   - Needs focused blocks and accountability

5. **Stressed Student** (Emma Thompson)
   - Finishing master's thesis
   - Perfectionism and analysis paralysis
   - Needs calm structure and clear milestones

6. **Side Hustler** (David Kim)
   - Building indie app while working full-time
   - Limited time (10-15 hrs/week)
   - Needs quick wins and clear priorities

## How It Works

### 1. Persona Definition (`testPersonas.js`)
Each persona includes:
- Demographics and role
- Goals and challenges
- Personality traits and communication style
- Typical responses to common questions
- Project templates

### 2. AI Response Generation (`aiUserSimulator.js`)
Uses OpenAI to generate contextual responses:
- Takes persona traits as input
- Considers conversation history
- Adapts to mood (frustrated, motivated, distracted)
- Generates natural, varied responses

### 3. Test Scenarios (`ai-powered-user-journeys.spec.js`)
Comprehensive journeys that simulate:
- Project creation with conversational onboarding
- Goal setting
- Task management
- Work sessions
- Progress tracking

### 4. Cleanup Utilities (`testCleanup.js`)
Periodic cleanup to prevent database bloat:
- Delete test projects after tests
- Reset user state
- Configurable cleanup timing

## Running the Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Set OpenAI API key
export OPENAI_API_KEY=your_key_here
```

### Run Tests
```bash
# Run AI-powered journeys (headless)
npm run test:playwright:ai-journeys

# Run with browser visible
npm run test:playwright:ai-journeys:headed

# Run specific persona
npx playwright test -g "Overwhelmed Startup Founder"

# Run multi-persona stress test
npx playwright test -g "Multi-Persona Stress Test"
```

### Configuration
Environment variables:
- `OPENAI_API_KEY` - Required for AI response generation
- `BASE_URL` - App URL (default: http://localhost:5173)
- `CLEANUP_AFTER_EACH` - Clean after each test (default: false)
- `CLEANUP_AFTER_ALL` - Clean after all tests (default: true)

## Test Output

Tests provide detailed console output:
```
🎭 Testing as: Sarah Chen (Startup Founder)
📝 Step 1: Creating project...
   User says: "I need to launch my SaaS product in 4 months..."
💬 Step 2: Conversational onboarding...
   AI: What does success look like for this project?
   User: First paying customers, product-market fit, 1000 users...
✅ Step 3: Verifying project creation...
   ✓ Project "Launch SaaS MVP" created
⏱️ Step 4: Starting work session...
   ✓ Work session started
📊 Step 5: Checking progress...
✨ Sarah Chen's journey complete!
```

## Extending the Tests

### Add New Persona
1. Add to `testPersonas.js`:
```javascript
export const TEST_PERSONAS = {
  yourPersona: {
    name: 'Your Name',
    role: 'Your Role',
    goal: 'Your Goal',
    challenges: [...],
    personalityTraits: {...},
    typicalResponses: {...},
    projects: [...]
  }
};
```

2. Create test in `ai-powered-user-journeys.spec.js`:
```javascript
test('Your Persona - Journey', async ({ page }) => {
  const persona = getPersona('yourPersona');
  // Test implementation
});
```

### Customize AI Behavior
Modify `aiUserSimulator.js`:
- Adjust `temperature` for response variation
- Change `brevity` for response length
- Add new `mood` options
- Customize prompts

### Add New Test Scenarios
Common patterns:
```javascript
// Generate user response
const response = await generateUserResponse(
  persona,
  aiQuestion,
  conversationHistory,
  { mood: 'frustrated', brevity: 'detailed' }
);

// Simulate work session
const decision = await simulateWorkSessionDecision(persona, context);

// Simulate task completion
const result = await simulateTaskCompletion(persona, taskTitle);
```

## Best Practices

1. **Use Realistic Personas** - Base on actual user research
2. **Vary Behavior** - Users aren't consistent; add randomness
3. **Test Edge Cases** - Frustrated users, skipped tasks, abandoned sessions
4. **Monitor Token Usage** - AI calls cost money; cache when possible
5. **Clean Up Regularly** - Don't let test data accumulate

## Troubleshooting

### AI responses are too generic
- Enhance persona profiles with more specific traits
- Add more context to `systemPrompt` in `aiUserSimulator.js`
- Increase `temperature` for more varied responses

### Tests are flaky
- Increase timeouts for AI response generation
- Add retry logic for network requests
- Use more explicit waits instead of fixed delays

### High OpenAI costs
- Reduce number of personas in stress tests
- Cache common responses
- Use cheaper model (gpt-3.5-turbo) for non-critical responses

## Future Enhancements

- [ ] Add more personas (entrepreneur, parent, retiree)
- [ ] Implement response caching to reduce API calls
- [ ] Add performance benchmarking
- [ ] Create visual reports of user journeys
- [ ] Simulate realistic timing (days/weeks between sessions)
- [ ] Add A/B testing of onboarding flows
- [ ] Implement sentiment analysis of user responses

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [User Persona Best Practices](https://www.nngroup.com/articles/persona/)
