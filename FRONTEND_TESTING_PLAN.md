# Frontend Testing Plan - Visual & Interactive Testing

## Overview

This document outlines the frontend testing strategy for RavenLoom, focusing on **visual component testing** and **interactive E2E testing**. The goal is to see components in isolation, test interactions visually, and ensure the UI works as expected.

## Testing Stack

### 1. Storybook - Visual Component Development & Testing

**What it does**:
- View components in isolation
- Test different states visually
- Document component variations
- Interactive playground for props
- Snapshot testing for visual regressions

**Why we need it**:
- See what components look like without running full app
- Test edge cases (loading states, errors, empty states)
- Document component API for other developers
- Catch visual regressions automatically

### 2. Cypress - E2E Testing with Visual Verification

**What it does**:
- Test full user flows in real browser
- See tests run in real-time
- Screenshot on failure
- Video recording of test runs
- Network request mocking

**Why we need it**:
- Test complete workflows (onboarding, goal creation, task management)
- Verify interactions work as expected
- Visual confirmation of UI state
- Test responsive behavior

### 3. React Testing Library - Component Unit Tests

**What it does**:
- Test component behavior
- Query elements like a user would
- Fire events and check results
- Test accessibility

**Why we need it**:
- Fast unit tests for components
- Test component logic
- Complement Storybook and Cypress

## Installation

### Storybook Setup

```bash
cd frontend
npx storybook@latest init
npm install --save-dev @storybook/addon-interactions @storybook/addon-a11y
```

### Cypress Setup

```bash
cd frontend
npm install --save-dev cypress @testing-library/cypress
npx cypress open
```

### React Testing Library (if not already installed)

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event vitest
```

## Storybook Implementation

### File Structure

```
frontend/src/
├── components/
│   ├── TaskCard/
│   │   ├── TaskCard.jsx
│   │   ├── TaskCard.stories.jsx    # Storybook stories
│   │   └── TaskCard.test.jsx        # Unit tests
│   ├── GoalCard/
│   │   ├── GoalCard.jsx
│   │   ├── GoalCard.stories.jsx
│   │   └── GoalCard.test.jsx
│   ├── ChatMessage/
│   │   ├── ChatMessage.jsx
│   │   ├── ChatMessage.stories.jsx
│   │   └── ChatMessage.test.jsx
│   └── PersonaSwitcher/
│       ├── PersonaSwitcher.jsx
│       ├── PersonaSwitcher.stories.jsx
│       └── PersonaSwitcher.test.jsx
```

### Example Stories

#### TaskCard.stories.jsx

```jsx
import TaskCard from './TaskCard';

export default {
  title: 'Components/TaskCard',
  component: TaskCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

// Default state
export const Default = {
  args: {
    task: {
      id: 1,
      title: 'Call the vendor',
      status: 'not_started',
      priority: 2,
      dueDate: '2025-01-15',
      context: '@phone',
    },
  },
};

// In Progress state
export const InProgress = {
  args: {
    task: {
      id: 2,
      title: 'Update landing page',
      status: 'in_progress',
      priority: 3,
      dueDate: '2025-01-10',
      context: '@computer',
    },
  },
};

// Completed state
export const Completed = {
  args: {
    task: {
      id: 3,
      title: 'Review metrics',
      status: 'done',
      priority: 1,
      dueDate: '2025-01-05',
      context: '@anywhere',
      completedAt: '2025-01-05T14:30:00Z',
    },
  },
};

// Blocked state
export const Blocked = {
  args: {
    task: {
      id: 4,
      title: 'Deploy to production',
      status: 'blocked',
      priority: 3,
      dueDate: '2025-01-20',
      context: '@computer',
      blockerReason: 'Waiting for API access',
    },
  },
};

// Overdue
export const Overdue = {
  args: {
    task: {
      id: 5,
      title: 'Submit quarterly report',
      status: 'not_started',
      priority: 3,
      dueDate: '2024-12-31',
      context: '@office',
    },
  },
};

// With long title
export const LongTitle = {
  args: {
    task: {
      id: 6,
      title: 'This is a very long task title that should wrap or truncate appropriately depending on the component design',
      status: 'not_started',
      priority: 2,
      context: '@computer',
    },
  },
};

// Loading state
export const Loading = {
  args: {
    task: {
      id: 7,
      title: 'Loading task...',
      status: 'not_started',
      priority: 2,
    },
    isLoading: true,
  },
};

// With interactions
export const WithInteractions = {
  args: {
    task: {
      id: 8,
      title: 'Click to complete',
      status: 'not_started',
      priority: 2,
      context: '@anywhere',
    },
    onStatusChange: (taskId, newStatus) => {
      console.log(`Task ${taskId} status changed to ${newStatus}`);
    },
    onEdit: (taskId) => {
      console.log(`Edit task ${taskId}`);
    },
    onDelete: (taskId) => {
      console.log(`Delete task ${taskId}`);
    },
  },
  play: async ({ canvasElement }) => {
    // Test interactions
    const canvas = within(canvasElement);
    const completeButton = canvas.getByRole('button', { name: /complete/i });
    await userEvent.click(completeButton);
  },
};
```

#### GoalCard.stories.jsx

```jsx
import GoalCard from './GoalCard';

export default {
  title: 'Components/GoalCard',
  component: GoalCard,
  parameters: {
    layout: 'padded',
  },
};

// Measurable goal with progress
export const MeasurableGoal = {
  args: {
    goal: {
      id: 1,
      title: 'Lose 10 pounds',
      description: 'Get healthier by summer',
      targetValue: 10,
      currentValue: 3,
      unit: 'pounds',
      status: 'active',
      priority: 3,
      targetDate: '2025-06-21',
      progress: 30, // 3/10 = 30%
    },
  },
};

// Goal without target value
export const QualitativeGoal = {
  args: {
    goal: {
      id: 2,
      title: 'Launch startup',
      description: 'Build and launch SaaS product',
      status: 'active',
      priority: 3,
      targetDate: '2025-12-31',
    },
  },
};

// Completed goal
export const CompletedGoal = {
  args: {
    goal: {
      id: 3,
      title: 'Read 12 books',
      targetValue: 12,
      currentValue: 12,
      unit: 'books',
      status: 'completed',
      priority: 2,
      targetDate: '2024-12-31',
      completedAt: '2024-12-28T10:00:00Z',
      progress: 100,
    },
  },
};

// Paused goal
export const PausedGoal = {
  args: {
    goal: {
      id: 4,
      title: 'Learn Spanish',
      description: 'Reach conversational fluency',
      status: 'paused',
      priority: 1,
      pausedReason: 'Focusing on work project',
    },
  },
};

// Overdue goal
export const OverdueGoal = {
  args: {
    goal: {
      id: 5,
      title: 'Complete certification',
      targetValue: 100,
      currentValue: 65,
      unit: '% complete',
      status: 'active',
      priority: 3,
      targetDate: '2024-12-31',
      progress: 65,
    },
  },
};
```

#### ChatMessage.stories.jsx

```jsx
import ChatMessage from './ChatMessage';

export default {
  title: 'Components/ChatMessage',
  component: ChatMessage,
};

// User message
export const UserMessage = {
  args: {
    message: {
      id: 1,
      role: 'user',
      content: 'I want to lose 10 pounds by summer',
      timestamp: '2025-01-03T10:30:00Z',
    },
  },
};

// AI message
export const AIMessage = {
  args: {
    message: {
      id: 2,
      role: 'assistant',
      content: "Perfect! I've set up your goal to lose 10 pounds by summer. What's your current weight?",
      timestamp: '2025-01-03T10:30:05Z',
    },
  },
};

// AI message with function call result
export const AIWithFunctionResult = {
  args: {
    message: {
      id: 3,
      role: 'assistant',
      content: "I've created three tasks for you:\n✓ Call the designer\n✓ Write the blog post\n✓ Review the metrics",
      timestamp: '2025-01-03T10:35:00Z',
      functionResults: [
        { function: 'createTask', result: 'Created: Call the designer' },
        { function: 'createTask', result: 'Created: Write the blog post' },
        { function: 'createTask', result: 'Created: Review the metrics' },
      ],
    },
  },
};

// Long message
export const LongMessage = {
  args: {
    message: {
      id: 4,
      role: 'assistant',
      content: `Here's a detailed breakdown of your project progress:

1. **Completed Tasks (5)**
   - Initial research
   - Market analysis
   - Competitor review
   - Tech stack selection
   - MVP planning

2. **In Progress (3)**
   - Backend development
   - Frontend design
   - Database setup

3. **Upcoming (7)**
   - API integration
   - User testing
   - Bug fixes
   - Documentation
   - Deployment preparation
   - Marketing materials
   - Launch planning

You're making great progress! The backend is 60% complete.`,
      timestamp: '2025-01-03T11:00:00Z',
    },
  },
};

// Typing indicator
export const TypingIndicator = {
  args: {
    message: {
      id: 5,
      role: 'assistant',
      content: '',
      isTyping: true,
    },
  },
};
```

#### PersonaSwitcher.stories.jsx

```jsx
import PersonaSwitcher from './PersonaSwitcher';

export default {
  title: 'Components/PersonaSwitcher',
  component: PersonaSwitcher,
};

// With multiple personas
export const MultiplePersonas = {
  args: {
    personas: [
      {
        id: 1,
        displayName: 'Alex the Coach',
        archetype: 'coach',
        role: 'primary',
        active: true,
        specialization: 'Motivation and accountability',
      },
      {
        id: 2,
        displayName: 'Sara the Strategist',
        archetype: 'strategist',
        role: 'specialist',
        active: false,
        specialization: 'Business planning and analysis',
      },
      {
        id: 3,
        displayName: 'Marcus the Mentor',
        archetype: 'mentor',
        role: 'advisor',
        active: false,
        specialization: 'Long-term wisdom and guidance',
      },
    ],
    onSwitch: (personaId) => console.log(`Switched to persona ${personaId}`),
  },
};

// Single persona (no switching)
export const SinglePersona = {
  args: {
    personas: [
      {
        id: 1,
        displayName: 'AI Assistant',
        archetype: 'partner',
        role: 'primary',
        active: true,
      },
    ],
  },
};

// With suggested switch
export const SuggestedSwitch = {
  args: {
    personas: [
      {
        id: 1,
        displayName: 'Alex the Coach',
        archetype: 'coach',
        role: 'primary',
        active: true,
      },
      {
        id: 2,
        displayName: 'Sara the Strategist',
        archetype: 'strategist',
        role: 'specialist',
        active: false,
        suggested: true,
        suggestedReason: 'Technical planning task detected',
      },
    ],
    onSwitch: (personaId) => console.log(`Switched to persona ${personaId}`),
  },
};
```

## Cypress Implementation

### File Structure

```
frontend/
├── cypress/
│   ├── e2e/
│   │   ├── onboarding.cy.js
│   │   ├── goal-creation.cy.js
│   │   ├── task-management.cy.js
│   │   ├── persona-switching.cy.js
│   │   └── conversation.cy.js
│   ├── fixtures/
│   │   ├── users.json
│   │   ├── projects.json
│   │   ├── goals.json
│   │   └── tasks.json
│   └── support/
│       ├── commands.js
│       └── e2e.js
```

### Example E2E Tests

#### onboarding.cy.js

```javascript
describe('Project Onboarding Flow', () => {
  beforeEach(() => {
    cy.login(); // Custom command
    cy.visit('/onboarding/project');
  });

  it('should complete project onboarding with all steps', () => {
    // Step 1: Project name
    cy.get('[data-testid="chat-input"]')
      .type('Launch my fitness app');
    cy.get('[data-testid="send-button"]').click();

    // Verify AI response
    cy.contains('What would you like to achieve').should('be.visible');

    // Take screenshot
    cy.screenshot('onboarding-step-1');

    // Step 2: Project description
    cy.get('[data-testid="chat-input"]')
      .type('I want to build a fitness app and get 1000 users by summer');
    cy.get('[data-testid="send-button"]').click();

    // Verify field extraction
    cy.contains('1000 users').should('be.visible');
    cy.screenshot('onboarding-step-2');

    // Step 3: Persona selection
    cy.contains('What kind of assistant').should('be.visible');
    cy.get('[data-testid="persona-coach"]').click();

    cy.screenshot('onboarding-step-3');

    // Step 4: Completion
    cy.contains('Your project is set up').should('be.visible');
    cy.get('[data-testid="complete-onboarding"]').click();

    // Verify redirect to dashboard
    cy.url().should('include', '/dashboard');
    cy.screenshot('onboarding-complete');
  });

  it('should handle extraction of multiple fields from single message', () => {
    cy.get('[data-testid="chat-input"]')
      .type('I want to lose 10 pounds by June and exercise 3 times a week');
    cy.get('[data-testid="send-button"]').click();

    // Verify extracted fields shown
    cy.contains('10 pounds').should('be.visible');
    cy.contains('June').should('be.visible');
    cy.contains('3 times a week').should('be.visible');

    cy.screenshot('multi-field-extraction');
  });

  it('should allow going back and changing answers', () => {
    // Answer first question
    cy.get('[data-testid="chat-input"]')
      .type('My fitness app');
    cy.get('[data-testid="send-button"]').click();

    // Click back button
    cy.get('[data-testid="back-button"]').click();

    // Verify can edit
    cy.get('[data-testid="chat-input"]').should('be.visible');
    cy.get('[data-testid="chat-input"]')
      .clear()
      .type('My health tracking app');
    cy.get('[data-testid="send-button"]').click();

    cy.contains('health tracking app').should('be.visible');
  });
});
```

#### goal-creation.cy.js

```javascript
describe('Goal Creation and Management', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/dashboard');
  });

  it('should create a measurable goal via chat', () => {
    // Open chat
    cy.get('[data-testid="chat-toggle"]').click();

    // Type goal
    cy.get('[data-testid="chat-input"]')
      .type('I want to lose 10 pounds by summer');
    cy.get('[data-testid="send-button"]').click();

    // Wait for AI response
    cy.contains('set up your goal', { timeout: 10000 }).should('be.visible');

    // Verify goal appears in dashboard
    cy.get('[data-testid="goals-list"]').should('contain', 'Lose 10 pounds');

    // Verify goal card shows progress
    cy.get('[data-testid="goal-card"]').within(() => {
      cy.contains('Lose 10 pounds').should('be.visible');
      cy.contains('0 / 10 pounds').should('be.visible');
      cy.contains('0%').should('be.visible');
    });

    cy.screenshot('goal-created');
  });

  it('should update goal progress', () => {
    // Create goal first
    cy.createGoal({
      title: 'Lose 10 pounds',
      targetValue: 10,
      currentValue: 0,
      unit: 'pounds',
    });

    cy.visit('/dashboard');

    // Click on goal
    cy.get('[data-testid="goal-card"]').first().click();

    // Update progress
    cy.get('[data-testid="update-progress"]').click();
    cy.get('[data-testid="current-value-input"]').clear().type('3');
    cy.get('[data-testid="save-progress"]').click();

    // Verify updated
    cy.contains('3 / 10 pounds').should('be.visible');
    cy.contains('30%').should('be.visible');

    // Verify progress bar
    cy.get('[data-testid="progress-bar"]')
      .should('have.css', 'width')
      .and('match', /30%/);

    cy.screenshot('goal-progress-updated');
  });

  it('should create goal via form', () => {
    cy.get('[data-testid="new-goal-button"]').click();

    // Fill form
    cy.get('[data-testid="goal-title"]').type('Read 12 books');
    cy.get('[data-testid="goal-target-value"]').type('12');
    cy.get('[data-testid="goal-unit"]').type('books');
    cy.get('[data-testid="goal-target-date"]').type('2025-12-31');
    cy.get('[data-testid="goal-priority"]').select('Medium');

    cy.get('[data-testid="create-goal"]').click();

    // Verify created
    cy.contains('Read 12 books').should('be.visible');
    cy.screenshot('goal-form-created');
  });
});
```

#### task-management.cy.js

```javascript
describe('Task Management', () => {
  beforeEach(() => {
    cy.login();
    cy.createProject({ title: 'Test Project' });
    cy.visit('/dashboard');
  });

  it('should create tasks from chat message', () => {
    cy.get('[data-testid="chat-toggle"]').click();

    cy.get('[data-testid="chat-input"]')
      .type('Tomorrow I need to call the vendor and update the landing page');
    cy.get('[data-testid="send-button"]').click();

    // Wait for AI to create tasks
    cy.contains('added', { timeout: 10000 }).should('be.visible');

    // Verify tasks appear
    cy.get('[data-testid="tasks-list"]').within(() => {
      cy.contains('Call the vendor').should('be.visible');
      cy.contains('Update the landing page').should('be.visible');
    });

    cy.screenshot('tasks-created-from-chat');
  });

  it('should update task status', () => {
    // Create task
    cy.createTask({
      title: 'Review metrics',
      status: 'not_started',
    });

    cy.visit('/dashboard');

    // Find task and mark in progress
    cy.get('[data-testid="task-card"]')
      .contains('Review metrics')
      .parent()
      .within(() => {
        cy.get('[data-testid="status-dropdown"]').select('in_progress');
      });

    // Verify status updated
    cy.contains('In Progress').should('be.visible');
    cy.screenshot('task-status-updated');
  });

  it('should filter tasks by status', () => {
    // Create tasks with different statuses
    cy.createTask({ title: 'Task 1', status: 'not_started' });
    cy.createTask({ title: 'Task 2', status: 'in_progress' });
    cy.createTask({ title: 'Task 3', status: 'done' });

    cy.visit('/dashboard');

    // Filter by in_progress
    cy.get('[data-testid="status-filter"]').select('in_progress');

    // Verify only in_progress tasks shown
    cy.get('[data-testid="tasks-list"]').within(() => {
      cy.contains('Task 2').should('be.visible');
      cy.contains('Task 1').should('not.exist');
      cy.contains('Task 3').should('not.exist');
    });

    cy.screenshot('tasks-filtered');
  });

  it('should mark task as done', () => {
    cy.createTask({
      title: 'Complete report',
      status: 'in_progress',
    });

    cy.visit('/dashboard');

    // Mark done
    cy.get('[data-testid="task-card"]')
      .contains('Complete report')
      .parent()
      .within(() => {
        cy.get('[data-testid="mark-done"]').click();
      });

    // Verify done
    cy.contains('Done').should('be.visible');
    cy.get('[data-testid="completed-at"]').should('be.visible');

    cy.screenshot('task-marked-done');
  });
});
```

#### persona-switching.cy.js

```javascript
describe('Persona Switching', () => {
  beforeEach(() => {
    cy.login();
    cy.createProject({ title: 'Test Project' });

    // Create multiple personas
    cy.createPersona({
      displayName: 'Alex the Coach',
      archetype: 'coach',
      role: 'primary',
      active: true,
    });
    cy.createPersona({
      displayName: 'Sara the Strategist',
      archetype: 'strategist',
      role: 'specialist',
      active: false,
    });

    cy.visit('/dashboard');
  });

  it('should show current active persona', () => {
    cy.get('[data-testid="current-persona"]')
      .should('contain', 'Alex the Coach');

    cy.screenshot('current-persona');
  });

  it('should manually switch persona', () => {
    // Open persona switcher
    cy.get('[data-testid="persona-switcher"]').click();

    // Select different persona
    cy.get('[data-testid="persona-option"]')
      .contains('Sara the Strategist')
      .click();

    // Verify switch
    cy.get('[data-testid="current-persona"]')
      .should('contain', 'Sara the Strategist');

    // Verify switch logged
    cy.get('[data-testid="chat-messages"]')
      .should('contain', 'Switched to Sara the Strategist');

    cy.screenshot('persona-switched');
  });

  it('should suggest persona based on context', () => {
    // Type technical message
    cy.get('[data-testid="chat-input"]')
      .type('I need to optimize the database queries and refactor the API');
    cy.get('[data-testid="send-button"]').click();

    // Verify suggestion appears
    cy.get('[data-testid="persona-suggestion"]', { timeout: 10000 })
      .should('be.visible')
      .and('contain', 'Sara the Strategist')
      .and('contain', 'Technical task detected');

    cy.screenshot('persona-suggested');

    // Accept suggestion
    cy.get('[data-testid="accept-suggestion"]').click();

    // Verify switched
    cy.get('[data-testid="current-persona"]')
      .should('contain', 'Sara the Strategist');
  });

  it('should show persona in chat messages', () => {
    cy.get('[data-testid="chat-input"]')
      .type('What should I focus on today?');
    cy.get('[data-testid="send-button"]').click();

    // Verify persona name shown in response
    cy.get('[data-testid="chat-message"]')
      .last()
      .within(() => {
        cy.get('[data-testid="message-persona"]')
          .should('contain', 'Alex the Coach');
      });

    cy.screenshot('persona-in-message');
  });
});
```

### Custom Cypress Commands

#### cypress/support/commands.js

```javascript
// Login command
Cypress.Commands.add('login', (email = 'test@example.com', password = 'password123') => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('[data-testid="email"]').type(email);
    cy.get('[data-testid="password"]').type(password);
    cy.get('[data-testid="login-button"]').click();
    cy.url().should('include', '/dashboard');
  });
});

// Create project
Cypress.Commands.add('createProject', (projectData) => {
  cy.request('POST', '/api/graphql', {
    query: `
      mutation CreateProject($title: String!) {
        createProject(title: $title) {
          id
          title
        }
      }
    `,
    variables: projectData,
  });
});

// Create goal
Cypress.Commands.add('createGoal', (goalData) => {
  cy.request('POST', '/api/graphql', {
    query: `
      mutation CreateGoal($input: GoalInput!) {
        createGoal(input: $input) {
          id
          title
        }
      }
    `,
    variables: { input: goalData },
  });
});

// Create task
Cypress.Commands.add('createTask', (taskData) => {
  cy.request('POST', '/api/graphql', {
    query: `
      mutation CreateTask($input: TaskInput!) {
        createTask(input: $input) {
          id
          title
        }
      }
    `,
    variables: { input: taskData },
  });
});

// Create persona
Cypress.Commands.add('createPersona', (personaData) => {
  cy.request('POST', '/api/graphql', {
    query: `
      mutation CreatePersona($input: PersonaInput!) {
        createPersona(input: $input) {
          id
          displayName
        }
      }
    `,
    variables: { input: personaData },
  });
});
```

## Visual Regression Testing

### Storybook + Chromatic

For automated visual regression testing, integrate Chromatic:

```bash
npm install --save-dev chromatic
npx chromatic --project-token=<your-token>
```

**Benefits**:
- Automatic screenshot comparison
- Catch unintended visual changes
- Review changes in UI before merging
- CI/CD integration

### Cypress + Percy

For E2E visual testing:

```bash
npm install --save-dev @percy/cli @percy/cypress
```

Add to cypress tests:
```javascript
cy.percySnapshot('Goal Creation - Step 1');
```

## Testing Checklist

### Component Testing (Storybook)

- [ ] TaskCard
  - [ ] All status states
  - [ ] Priority levels
  - [ ] Context badges
  - [ ] Overdue state
  - [ ] Loading state
  - [ ] Long title handling
  - [ ] Interactions (complete, edit, delete)

- [ ] GoalCard
  - [ ] Measurable goal with progress
  - [ ] Qualitative goal
  - [ ] Completed state
  - [ ] Paused state
  - [ ] Overdue state
  - [ ] Progress bar accuracy

- [ ] ChatMessage
  - [ ] User message
  - [ ] AI message
  - [ ] Function result display
  - [ ] Typing indicator
  - [ ] Timestamp formatting
  - [ ] Long message handling

- [ ] PersonaSwitcher
  - [ ] Multiple personas
  - [ ] Single persona
  - [ ] Active persona indicator
  - [ ] Suggestion badge
  - [ ] Switch interaction

### E2E Testing (Cypress)

- [ ] Onboarding Flow
  - [ ] Complete project onboarding
  - [ ] Complete goal onboarding
  - [ ] Complete task onboarding
  - [ ] Field extraction works
  - [ ] Can go back and edit
  - [ ] Error handling

- [ ] Goal Management
  - [ ] Create via chat
  - [ ] Create via form
  - [ ] Update progress
  - [ ] Mark complete
  - [ ] Pause goal
  - [ ] View goal details

- [ ] Task Management
  - [ ] Create via chat
  - [ ] Create via form
  - [ ] Update status
  - [ ] Mark done
  - [ ] Filter by status
  - [ ] Sort by priority/due date

- [ ] Persona Switching
  - [ ] Manual switch
  - [ ] Auto-switch suggestion
  - [ ] Accept suggestion
  - [ ] Dismiss suggestion
  - [ ] Persona in messages

- [ ] Conversation
  - [ ] Send message
  - [ ] Receive response
  - [ ] Function calls executed
  - [ ] Error handling
  - [ ] Message history
  - [ ] Typing indicator

## Running Tests

### Storybook

```bash
# Start Storybook
npm run storybook

# Build static Storybook
npm run build-storybook

# Run interaction tests
npm run test-storybook
```

### Cypress

```bash
# Open Cypress UI
npm run cypress:open

# Run headless
npm run cypress:run

# Run specific test
npm run cypress:run -- --spec "cypress/e2e/onboarding.cy.js"

# Run with specific browser
npm run cypress:run -- --browser chrome
```

### React Testing Library

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Frontend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Run unit tests
        run: |
          cd frontend
          npm run test:coverage

      - name: Build Storybook
        run: |
          cd frontend
          npm run build-storybook

      - name: Run Cypress tests
        uses: cypress-io/github-action@v5
        with:
          working-directory: frontend
          start: npm start
          wait-on: 'http://localhost:5173'
          browser: chrome

      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: cypress-screenshots
          path: frontend/cypress/screenshots

      - name: Upload videos
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: cypress-videos
          path: frontend/cypress/videos
```

## Benefits Summary

### Storybook Benefits
- ✅ **Visual Development**: See components in isolation
- ✅ **Documentation**: Auto-generated component docs
- ✅ **Edge Cases**: Test loading, error, empty states
- ✅ **Accessibility**: Built-in a11y addon
- ✅ **Designer Collaboration**: Share component library

### Cypress Benefits
- ✅ **Visual Debugging**: See tests run in real browser
- ✅ **Time Travel**: Go back to any point in test
- ✅ **Screenshots**: Automatic screenshots on failure
- ✅ **Video Recording**: Full test run recording
- ✅ **Network Mocking**: Test without backend

### Overall Benefits
- ✅ **Confidence**: See what you're testing
- ✅ **Documentation**: Tests serve as examples
- ✅ **Regression Prevention**: Catch visual bugs
- ✅ **Faster Development**: Iterate without full app
- ✅ **Better UX**: Test actual user interactions

## Next Steps

1. **Install Storybook** and create first stories for TaskCard
2. **Install Cypress** and write onboarding E2E test
3. **Add data-testid attributes** to components
4. **Set up CI/CD** with automated test runs
5. **Add visual regression testing** with Chromatic or Percy
