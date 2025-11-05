# RavenLoom Testing Plan

## Overview

This document outlines the testing strategy for the RavenLoom backend. Our goal is to achieve **80%+ code coverage** with comprehensive unit, integration, and end-to-end tests.

## Testing Stack

- **Test Framework**: Jest (recommended) or Mocha + Chai
- **Mocking**: Jest mocks or Sinon.js
- **Coverage**: Jest coverage or nyc
- **Database**: Test database or in-memory PostgreSQL
- **API Testing**: Supertest for GraphQL endpoints

## Priority Levels

### P0 - Critical (Must Have)
- Core AI function execution
- Database operations
- Authentication and authorization
- Data integrity

### P1 - High (Should Have)
- Input validation
- Error handling paths
- Business logic
- GraphQL resolvers

### P2 - Medium (Nice to Have)
- Edge cases
- Performance tests
- Integration tests

### P3 - Low (Future)
- Load testing
- Security testing
- UI testing

---

## Unit Tests

### AI Function Executor (P0)

**File**: `tests/services/AIFunctionExecutor.test.js`

**Coverage Goal**: 100%

Test Cases:
```javascript
describe('AIFunctionExecutor', () => {
  describe('createGoal', () => {
    it('should create a goal with valid inputs');
    it('should throw ValidationError for missing title');
    it('should throw ValidationError for title too short');
    it('should throw ValidationError for title too long');
    it('should handle optional fields correctly');
    it('should default priority to MEDIUM');
    it('should default status to ACTIVE');
    it('should handle database errors gracefully');
    it('should log goal creation');
  });

  describe('createTask', () => {
    it('should create a task with valid inputs');
    it('should throw ValidationError for missing title');
    it('should validate context enum');
    it('should validate energy level enum');
    it('should validate time estimate range');
    it('should link task to goal when goalId provided');
    it('should handle missing goalId');
    it('should default values correctly');
  });

  describe('recordMetric', () => {
    it('should record a metric with valid inputs');
    it('should throw ValidationError for missing name');
    it('should throw ValidationError for non-numeric value');
    it('should default source to user_reported');
    it('should validate source enum');
  });

  describe('updateGoalProgress', () => {
    it('should update goal progress with valid inputs');
    it('should throw ValidationError for missing goalId');
    it('should throw ValidationError for non-numeric currentValue');
    it('should throw Error when goal not found');
  });

  describe('updateTaskStatus', () => {
    it('should update task status with valid inputs');
    it('should set completed_at when status is done');
    it('should not set completed_at for other statuses');
    it('should validate status enum');
    it('should throw Error when task not found');
  });

  describe('getGoals', () => {
    it('should return all goals for project');
    it('should return empty array when no goals');
    it('should order by priority DESC, created_at DESC');
  });

  describe('getTasks', () => {
    it('should return all tasks for project');
    it('should filter by status when provided');
    it('should return empty array when no tasks');
  });

  describe('getMetrics', () => {
    it('should return metrics for project');
    it('should filter by goalId when provided');
    it('should limit results to specified count');
    it('should default limit to 10');
  });
});
```

### Validation Utilities (P0)

**File**: `tests/utils/validation.test.js`

Test Cases:
```javascript
describe('Validation Utils', () => {
  describe('validateString', () => {
    it('should pass for valid string');
    it('should throw for null');
    it('should throw for undefined');
    it('should throw for empty string');
    it('should throw for non-string');
    it('should throw for string too short');
    it('should throw for string too long');
    it('should trim whitespace');
  });

  describe('validateNumber', () => {
    it('should pass for valid number');
    it('should throw for null');
    it('should throw for NaN');
    it('should throw for below min');
    it('should throw for above max');
    it('should validate integer when required');
    it('should convert string numbers');
  });

  describe('validateEnum', () => {
    it('should pass for valid enum value');
    it('should throw for invalid value');
  });

  // ... more validation functions
});
```

### Database Utilities (P0)

**File**: `tests/utils/database.test.js`

Test Cases:
```javascript
describe('Database Utils', () => {
  describe('queryOne', () => {
    it('should return single row');
    it('should throw when no rows found');
    it('should throw on database error');
  });

  describe('insertOne', () => {
    it('should insert and return row');
    it('should throw on unique violation');
    it('should throw on foreign key violation');
    it('should throw on not null violation');
  });

  describe('transaction', () => {
    it('should commit on success');
    it('should rollback on error');
    it('should release client');
  });
});
```

### JSON Utilities (P1)

**File**: `tests/utils/json.test.js`

Test Cases:
```javascript
describe('JSON Utils', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON string');
    it('should return fallback for invalid JSON');
    it('should return fallback for null');
    it('should return object as-is');
  });

  describe('parseJsonArray', () => {
    it('should parse JSON array');
    it('should return empty array for invalid input');
  });
});
```

### Conversation Service (P0)

**File**: `tests/services/ConversationService.test.js`

Test Cases:
```javascript
describe('ConversationService', () => {
  describe('generatePersonaResponse', () => {
    it('should generate response for user message');
    it('should execute AI function calls');
    it('should handle multiple function calls');
    it('should handle function call errors gracefully');
    it('should store user message');
    it('should store AI response');
    it('should track executed functions in metadata');
    it('should integrate with memory system');
  });

  describe('addUserMessage', () => {
    it('should store user message');
    it('should update conversation timestamp');
  });

  describe('addPersonaMessage', () => {
    it('should store persona message');
    it('should store metadata');
    it('should update conversation timestamp');
  });
});
```

### Onboarding Service (P1)

**File**: `tests/services/OnboardingService.test.js`

Test Cases:
```javascript
describe('OnboardingService', () => {
  describe('startOnboarding', () => {
    it('should create onboarding session');
    it('should extract initial data from message');
    it('should return first question');
    it('should require projectId when needed');
  });

  describe('processResponse', () => {
    it('should extract data from user response');
    it('should ask next question');
    it('should complete when all required fields collected');
    it('should execute completion actions');
    it('should handle field dependencies');
  });

  describe('_getNextQuestion', () => {
    it('should skip collected fields');
    it('should check dependencies');
    it('should check showIf conditions');
    it('should return null when complete');
  });
});
```

### Multi-Persona Service (P1)

**File**: `tests/services/MultiPersonaService.test.js`

Test Cases:
```javascript
describe('MultiPersonaService', () => {
  describe('switchPersona', () => {
    it('should deactivate current persona');
    it('should activate new persona');
    it('should log switch event');
    it('should handle no current persona');
  });

  describe('checkAutoSwitch', () => {
    it('should trigger on keyword match');
    it('should trigger on task type');
    it('should trigger on time of day');
    it('should return null when no triggers match');
  });

  describe('_evaluateTrigger', () => {
    it('should match keywords case-insensitive');
    it('should match time ranges');
    it('should match days of week');
  });
});
```

---

## Integration Tests

### Goal Creation Flow (P0)

**File**: `tests/integration/goalFlow.test.js`

Test Cases:
```javascript
describe('Goal Creation Flow', () => {
  it('should create goal via AI chat');
  it('should create goal via GraphQL mutation');
  it('should record metrics for goal');
  it('should update goal progress');
  it('should link tasks to goal');
});
```

### Task Management Flow (P0)

**File**: `tests/integration/taskFlow.test.js`

Test Cases:
```javascript
describe('Task Management Flow', () => {
  it('should create task via AI chat');
  it('should update task status');
  it('should mark task as complete');
  it('should handle recurring tasks');
});
```

### Onboarding Flow (P1)

**File**: `tests/integration/onboardingFlow.test.js`

Test Cases:
```javascript
describe('Onboarding Flow', () => {
  it('should complete project onboarding');
  it('should complete goal onboarding');
  it('should complete task onboarding');
  it('should handle prerequisite dependencies');
  it('should extract multiple fields from one response');
});
```

### Persona Switching (P1)

**File**: `tests/integration/personaFlow.test.js`

Test Cases:
```javascript
describe('Persona Switching', () => {
  it('should switch personas manually');
  it('should auto-switch on keyword trigger');
  it('should preserve conversation context');
});
```

---

## GraphQL Tests

### Goal Resolvers (P0)

**File**: `tests/graphql/goalResolvers.test.js`

Test Cases:
```javascript
describe('Goal Resolvers', () => {
  describe('Query.getGoals', () => {
    it('should return goals for project');
    it('should return empty array for project with no goals');
  });

  describe('Mutation.createGoal', () => {
    it('should create goal with valid input');
    it('should validate required fields');
  });

  describe('Mutation.updateGoal', () => {
    it('should update goal');
    it('should throw when goal not found');
  });

  describe('Mutation.deleteGoal', () => {
    it('should delete goal');
    it('should return false when goal not found');
  });
});
```

---

## Test Database Setup

### Option 1: Test Database

```javascript
// tests/setup.js
import db from '../backend/db.js';

beforeAll(async () => {
  // Run migrations on test database
  await db.query('CREATE DATABASE ravenloom_test');
  // Run migrations
});

afterAll(async () => {
  // Clean up test database
  await db.end();
});

beforeEach(async () => {
  // Clear tables before each test
  await db.query('TRUNCATE TABLE goals, tasks, metrics CASCADE');
});
```

### Option 2: In-Memory PostgreSQL

```javascript
import { PostgreSqlContainer } from 'testcontainers';

let container;
let db;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  db = new Database(container.getConnectionUri());
  await runMigrations(db);
});

afterAll(async () => {
  await container.stop();
});
```

---

## Mock Patterns

### Mocking Database

```javascript
jest.mock('../backend/db.js', () => ({
  query: jest.fn()
}));

import db from '../backend/db.js';

test('should handle database error', async () => {
  db.query.mockRejectedValueOnce(new Error('Connection failed'));

  await expect(service.createGoal()).rejects.toThrow('Connection failed');
});
```

### Mocking OpenAI API

```javascript
jest.mock('../backend/utils/llm.js', () => ({
  generateChatCompletionWithFunctions: jest.fn()
}));

import { generateChatCompletionWithFunctions } from '../backend/utils/llm.js';

test('should execute function calls', async () => {
  generateChatCompletionWithFunctions.mockResolvedValueOnce({
    content: 'I\'ve created that goal for you',
    toolCalls: [{
      function: {
        name: 'createGoal',
        arguments: { title: 'Test Goal' }
      }
    }]
  });

  const result = await service.generateResponse('I want to test something');
  expect(result.functionsExecuted).toHaveLength(1);
});
```

---

## Coverage Goals

| Component | Target | Priority |
|-----------|--------|----------|
| AIFunctionExecutor | 100% | P0 |
| Validation Utils | 100% | P0 |
| Database Utils | 95% | P0 |
| ConversationService | 90% | P0 |
| OnboardingService | 85% | P1 |
| MultiPersonaService | 85% | P1 |
| Goal Resolvers | 90% | P0 |
| Task Resolvers | 90% | P0 |
| Overall | 80%+ | - |

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- AIFunctionExecutor.test.js

# Run in watch mode
npm test -- --watch

# Run integration tests only
npm test -- --testPathPattern=integration
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'

      - run: npm install
      - run: npm run test:coverage

      - uses: codecov/codecov-action@v2
        with:
          files: ./coverage/coverage-final.json
```

---

## TODO: Tests to Write

### Immediate (Week 1)
- [ ] AIFunctionExecutor unit tests
- [ ] Validation utils tests
- [ ] Database utils tests
- [ ] JSON utils tests

### Short Term (Weeks 2-4)
- [ ] ConversationService tests
- [ ] Goal resolvers tests
- [ ] Task resolvers tests
- [ ] Integration tests for goal creation
- [ ] Integration tests for task management

### Medium Term (Month 2)
- [ ] OnboardingService tests
- [ ] MultiPersonaService tests
- [ ] Memory system tests
- [ ] Persona switching integration tests

---

## Best Practices

1. **Test Behavior, Not Implementation**: Test what functions do, not how they do it
2. **One Assertion Per Test**: Keep tests focused and easy to debug
3. **Use Descriptive Names**: Test names should explain what is being tested
4. **Arrange-Act-Assert**: Structure tests consistently
5. **Mock External Dependencies**: Database, APIs, file system
6. **Test Error Cases**: Don't just test the happy path
7. **Keep Tests Fast**: Unit tests should run in milliseconds
8. **Independent Tests**: Each test should be able to run alone
9. **Clean Up**: Reset state after each test
10. **Document Complex Tests**: Add comments for non-obvious test logic
