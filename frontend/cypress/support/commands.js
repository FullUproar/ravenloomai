/**
 * Custom Cypress Commands
 *
 * Reusable commands for testing RavenLoom frontend.
 */

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

// Create project via API
Cypress.Commands.add('createProject', (projectData) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation CreateProject($title: String!, $description: String) {
          createProject(title: $title, description: $description) {
            id
            title
            description
          }
        }
      `,
      variables: projectData,
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.createProject;
  });
});

// Create goal via API
Cypress.Commands.add('createGoal', (goalData) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation CreateGoal($input: GoalInput!) {
          createGoal(input: $input) {
            id
            title
            targetValue
            currentValue
            unit
            status
          }
        }
      `,
      variables: { input: goalData },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.createGoal;
  });
});

// Create task via API
Cypress.Commands.add('createTask', (taskData) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation CreateTask($input: TaskInput!) {
          createTask(input: $input) {
            id
            title
            status
            priority
            dueDate
            context
          }
        }
      `,
      variables: { input: taskData },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.createTask;
  });
});

// Create persona via API
Cypress.Commands.add('createPersona', (personaData) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation CreatePersona($input: PersonaInput!) {
          createPersona(input: $input) {
            id
            displayName
            archetype
            role
            active
          }
        }
      `,
      variables: { input: personaData },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.createPersona;
  });
});

// Update task status
Cypress.Commands.add('updateTaskStatus', (taskId, newStatus) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation UpdateTaskStatus($taskId: ID!, $status: String!) {
          updateTaskStatus(taskId: $taskId, status: $status) {
            id
            status
          }
        }
      `,
      variables: { taskId, status: newStatus },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.updateTaskStatus;
  });
});

// Update goal progress
Cypress.Commands.add('updateGoalProgress', (goalId, currentValue) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation UpdateGoalProgress($goalId: ID!, $currentValue: Float!) {
          updateGoalProgress(goalId: $goalId, currentValue: $currentValue) {
            id
            currentValue
          }
        }
      `,
      variables: { goalId, currentValue },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.updateGoalProgress;
  });
});

// Record metric
Cypress.Commands.add('recordMetric', (metricData) => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation RecordMetric($input: MetricInput!) {
          recordMetric(input: $input) {
            id
            value
            recordedAt
          }
        }
      `,
      variables: { input: metricData },
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
    return response.body.data.recordMetric;
  });
});

// Wait for chat response
Cypress.Commands.add('waitForChatResponse', (timeout = 10000) => {
  cy.get('[data-testid="chat-messages"]', { timeout })
    .children()
    .last()
    .should('have.attr', 'data-role', 'assistant');
});

// Type in chat and send
Cypress.Commands.add('sendChatMessage', (message) => {
  cy.get('[data-testid="chat-input"]')
    .clear()
    .type(message);
  cy.get('[data-testid="send-button"]').click();
  cy.waitForChatResponse();
});

// Clear all test data
Cypress.Commands.add('clearTestData', () => {
  cy.request({
    method: 'POST',
    url: '/api/graphql',
    body: {
      query: `
        mutation ClearTestData {
          clearTestData {
            success
          }
        }
      `,
    },
  });
});

// Mock LLM responses
Cypress.Commands.add('mockLLMResponse', (response) => {
  cy.intercept('POST', '**/api/llm', {
    statusCode: 200,
    body: response,
  }).as('llmResponse');
});

// Take screenshot with timestamp
Cypress.Commands.add('screenshotWithTimestamp', (name) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  cy.screenshot(`${name}-${timestamp}`);
});
