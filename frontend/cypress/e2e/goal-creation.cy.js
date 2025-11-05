/**
 * Goal Creation E2E Tests
 *
 * Tests the complete goal creation flow from chat interaction
 * to goal display in the dashboard.
 */

describe('Goal Creation and Management', () => {
  beforeEach(() => {
    // Login (assumes custom command exists)
    cy.visit('/');
    // TODO: Add actual login flow when authentication is implemented
  });

  it('should create a measurable goal via chat', () => {
    // Navigate to dashboard
    cy.visit('/dashboard');

    // Open chat interface
    cy.get('[data-testid="chat-toggle"]').click();

    // Type goal message
    cy.get('[data-testid="chat-input"]')
      .should('be.visible')
      .type('I want to lose 10 pounds by summer');

    // Send message
    cy.get('[data-testid="send-button"]').click();

    // Wait for AI response
    cy.contains('set up your goal', { timeout: 10000 })
      .should('be.visible');

    // Take screenshot of AI response
    cy.screenshot('goal-creation-ai-response');

    // Verify goal appears in dashboard
    cy.get('[data-testid="goals-list"]', { timeout: 5000 })
      .should('contain', 'Lose 10 pounds');

    // Verify goal card shows correct details
    cy.get('[data-testid="goal-card"]').first().within(() => {
      cy.contains('Lose 10 pounds').should('be.visible');
      cy.contains('0 / 10 pounds').should('be.visible');
      cy.contains('0%').should('be.visible');
    });

    // Take screenshot of created goal
    cy.screenshot('goal-created-in-dashboard');
  });

  it('should update goal progress', () => {
    // Visit dashboard
    cy.visit('/dashboard');

    // Assume goal exists - click on first goal
    cy.get('[data-testid="goal-card"]').first().click();

    // Update progress button
    cy.get('[data-testid="update-progress"]').click();

    // Enter new current value
    cy.get('[data-testid="current-value-input"]')
      .clear()
      .type('3');

    // Save progress
    cy.get('[data-testid="save-progress"]').click();

    // Verify updated progress shown
    cy.contains('3 / 10 pounds').should('be.visible');
    cy.contains('30%').should('be.visible');

    // Verify progress bar updated
    cy.get('[data-testid="progress-bar"]')
      .should('have.attr', 'aria-valuenow', '30');

    // Take screenshot
    cy.screenshot('goal-progress-updated');
  });

  it('should create goal via form', () => {
    cy.visit('/dashboard');

    // Click new goal button
    cy.get('[data-testid="new-goal-button"]').click();

    // Fill form fields
    cy.get('[data-testid="goal-title"]')
      .type('Read 12 books');

    cy.get('[data-testid="goal-description"]')
      .type('Read one book per month to expand knowledge');

    cy.get('[data-testid="goal-target-value"]')
      .type('12');

    cy.get('[data-testid="goal-unit"]')
      .type('books');

    cy.get('[data-testid="goal-target-date"]')
      .type('2025-12-31');

    cy.get('[data-testid="goal-priority"]')
      .select('Medium');

    // Submit form
    cy.get('[data-testid="create-goal"]').click();

    // Verify goal created
    cy.contains('Read 12 books').should('be.visible');
    cy.contains('0 / 12 books').should('be.visible');

    // Take screenshot
    cy.screenshot('goal-form-created');
  });

  it('should mark goal as completed', () => {
    cy.visit('/dashboard');

    // Click on goal card
    cy.get('[data-testid="goal-card"]')
      .contains('Read 12 books')
      .parent('[data-testid="goal-card"]')
      .click();

    // Mark as complete button
    cy.get('[data-testid="mark-complete"]').click();

    // Confirm completion
    cy.get('[data-testid="confirm-complete"]').click();

    // Verify status changed
    cy.get('[data-testid="goal-status"]')
      .should('contain', 'Completed');

    // Verify completion badge
    cy.get('[data-testid="completed-badge"]')
      .should('be.visible');

    // Take screenshot
    cy.screenshot('goal-marked-complete');
  });

  it('should filter goals by status', () => {
    cy.visit('/dashboard');

    // Select active filter
    cy.get('[data-testid="status-filter"]')
      .select('active');

    // Verify only active goals shown
    cy.get('[data-testid="goal-card"]').each(($card) => {
      cy.wrap($card)
        .find('[data-testid="goal-status"]')
        .should('contain', 'Active');
    });

    // Select completed filter
    cy.get('[data-testid="status-filter"]')
      .select('completed');

    // Verify only completed goals shown
    cy.get('[data-testid="goal-card"]').each(($card) => {
      cy.wrap($card)
        .find('[data-testid="goal-status"]')
        .should('contain', 'Completed');
    });

    // Take screenshot
    cy.screenshot('goals-filtered');
  });

  it('should record metric for goal', () => {
    cy.visit('/dashboard');

    // Click on goal
    cy.get('[data-testid="goal-card"]').first().click();

    // Click record metric
    cy.get('[data-testid="record-metric"]').click();

    // Enter metric value
    cy.get('[data-testid="metric-value"]')
      .type('185');

    // Add note
    cy.get('[data-testid="metric-note"]')
      .type('Morning weigh-in');

    // Submit
    cy.get('[data-testid="save-metric"]').click();

    // Verify metric appears in history
    cy.get('[data-testid="metrics-list"]')
      .should('contain', '185');

    cy.get('[data-testid="metrics-list"]')
      .should('contain', 'Morning weigh-in');

    // Take screenshot
    cy.screenshot('metric-recorded');
  });

  it('should handle AI function call errors gracefully', () => {
    cy.visit('/dashboard');

    // Intercept GraphQL call and force error
    cy.intercept('POST', '**/graphql', (req) => {
      if (req.body.query.includes('createGoal')) {
        req.reply({
          statusCode: 500,
          body: {
            errors: [{ message: 'Failed to create goal' }],
          },
        });
      }
    }).as('createGoalError');

    // Open chat
    cy.get('[data-testid="chat-toggle"]').click();

    // Try to create goal
    cy.get('[data-testid="chat-input"]')
      .type('I want to run a marathon');

    cy.get('[data-testid="send-button"]').click();

    // Wait for error
    cy.wait('@createGoalError');

    // Verify error message shown
    cy.contains('Failed to create goal', { timeout: 5000 })
      .should('be.visible');

    // Take screenshot
    cy.screenshot('goal-creation-error');
  });
});
