/**
 * Test Utilities
 *
 * Custom render functions and test helpers
 */

import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ApolloClient, ApolloProvider, InMemoryCache } from '@apollo/client';
import { vi } from 'vitest';

// Create a mock Apollo client
export function createMockApolloClient(mocks = []) {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: {
      request: vi.fn()
    }
  });
}

// Custom render with all providers
export function renderWithProviders(ui, options = {}) {
  const {
    apolloClient = createMockApolloClient(),
    route = '/',
    ...renderOptions
  } = options;

  // Set initial route
  window.history.pushState({}, 'Test page', route);

  function Wrapper({ children }) {
    return (
      <ApolloProvider client={apolloClient}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </ApolloProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    apolloClient
  };
}

// Re-export everything from testing library
export * from '@testing-library/react';

// Export custom render
export { renderWithProviders as render };

// Test data factories
export const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
  ...overrides
});

export const createMockTeam = (overrides = {}) => ({
  id: 'team-123',
  name: 'Test Team',
  slug: 'test-team',
  createdAt: new Date().toISOString(),
  ...overrides
});

export const createMockChannel = (overrides = {}) => ({
  id: 'channel-123',
  name: 'general',
  teamId: 'team-123',
  isDefault: true,
  ...overrides
});

export const createMockTask = (overrides = {}) => ({
  id: 'task-123',
  title: 'Test Task',
  description: 'Task description',
  status: 'todo',
  priority: 'medium',
  teamId: 'team-123',
  createdAt: new Date().toISOString(),
  ...overrides
});

export const createMockProactiveSettings = (overrides = {}) => ({
  enabled: true,
  morningFocusEnabled: true,
  smartNudgesEnabled: true,
  insightsEnabled: true,
  meetingPrepEnabled: true,
  ...overrides
});

// Wait utilities
export const waitForLoadingToFinish = () =>
  new Promise(resolve => setTimeout(resolve, 0));

// Mock Apollo query response
export function createMockQueryResult(data, loading = false, error = null) {
  return {
    data,
    loading,
    error,
    refetch: vi.fn(),
  };
}

// Mock Apollo mutation response
export function createMockMutationResult(mutate, data = null, loading = false, error = null) {
  return [
    mutate,
    {
      data,
      loading,
      error,
      called: false,
    }
  ];
}
