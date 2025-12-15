/**
 * UXPreferencesContext
 *
 * Provides AI-controlled UX preferences throughout the app.
 * Team defaults merged with user overrides.
 * All changes made through Raven commands, not UI controls.
 */

import { createContext, useContext, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';

// GraphQL query for UX preferences
const GET_MY_UX_PREFERENCES = gql`
  query GetMyUXPreferences($teamId: ID!) {
    getMyUXPreferences(teamId: $teamId) {
      navOrder
      navHidden
      navCollapsed
      cardDensity
      defaultView
      sidebarWidth
      animationsEnabled
      showBadges
      showAISummaries
    }
  }
`;

// Default preferences (used while loading or if query fails)
const DEFAULT_PREFERENCES = {
  navOrder: ['digest', 'raven', 'channels', 'tasks', 'goals', 'projects', 'calendar', 'insights', 'team', 'knowledge'],
  navHidden: [],
  navCollapsed: ['tasks', 'goals', 'projects', 'team', 'knowledge'],
  cardDensity: 'comfortable',
  defaultView: 'digest',
  sidebarWidth: 'normal',
  animationsEnabled: true,
  showBadges: true,
  showAISummaries: true
};

// Create context
const UXPreferencesContext = createContext(DEFAULT_PREFERENCES);

/**
 * Provider component - wraps app to provide UX preferences
 */
export function UXPreferencesProvider({ teamId, children }) {
  const { data, loading, error, refetch } = useQuery(GET_MY_UX_PREFERENCES, {
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network'
  });

  // Merge with defaults (in case any fields are missing)
  const preferences = useMemo(() => {
    if (!data?.getMyUXPreferences) {
      return DEFAULT_PREFERENCES;
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...data.getMyUXPreferences
    };
  }, [data]);

  const value = useMemo(() => ({
    ...preferences,
    loading,
    error,
    refetch
  }), [preferences, loading, error, refetch]);

  return (
    <UXPreferencesContext.Provider value={value}>
      {children}
    </UXPreferencesContext.Provider>
  );
}

/**
 * Hook to access UX preferences
 */
export function useUXPreferences() {
  return useContext(UXPreferencesContext);
}

/**
 * Helper hook to check if a nav item should be visible
 */
export function useNavItemVisible(itemKey) {
  const { navHidden } = useUXPreferences();
  return !navHidden.includes(itemKey);
}

/**
 * Helper hook to get ordered visible nav items
 */
export function useVisibleNavItems() {
  const { navOrder, navHidden } = useUXPreferences();
  return navOrder.filter(item => !navHidden.includes(item));
}

/**
 * Helper hook to check if a nav section should be collapsed by default
 */
export function useNavSectionCollapsed(sectionKey) {
  const { navCollapsed } = useUXPreferences();
  return navCollapsed.includes(sectionKey);
}

/**
 * CSS class helpers based on preferences
 */
export function useUXClasses() {
  const { cardDensity, sidebarWidth, animationsEnabled } = useUXPreferences();

  return {
    densityClass: `density-${cardDensity}`,
    sidebarClass: `sidebar-${sidebarWidth}`,
    animationClass: animationsEnabled ? 'animations-enabled' : 'animations-disabled'
  };
}

export default UXPreferencesContext;
