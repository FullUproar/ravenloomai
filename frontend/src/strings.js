/**
 * Centralized string management for RavenLoom
 *
 * This module provides a single source of truth for all UI strings,
 * making it easier to maintain consistency and prepare for future
 * internationalization (i18n) support.
 *
 * TODO: Replace with i18n library (e.g., react-i18next) when adding
 * multi-language support.
 */

export const strings = {
  // App branding
  app: {
    name: 'RavenLoom',
    tagline: 'Making productivity more human with AI',
    description: 'Making productivity more human with AI. AI-powered project management with personalized AI coaches.',
  },

  // Company info
  company: {
    name: 'Full Uproar Games, Inc.',
    supportEmail: 'support@ravenloom.ai',
  },

  // Footer
  footer: {
    copyright: (year) => `© ${year} Full Uproar Games, Inc. Making productivity more human with AI.`,
    privacyLink: 'Privacy',
    termsLink: 'Terms',
  },

  // Authentication
  auth: {
    login: 'Log In',
    signup: 'Sign Up',
    signupPrompt: 'Create Account',
    loginPrompt: 'Log In',
    googleSignIn: 'Continue with Google',
    testLogin: '🧪 Continue as Test User',
    testLoginSubtext: 'Skip authentication for testing',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    signupQuestion: 'Need to create one?',
    loginQuestion: 'Already have an account?',
    orDivider: 'or',

    // Error messages
    errors: {
      popupBlocked: 'Popup was blocked. Please allow popups for this site and try again.',
      signInCancelled: 'Sign-in was cancelled.',
      unauthorizedDomain: 'Domain not authorized. Please check Firebase Console settings.',
      redirectBlocked: 'Sign-in failed. The redirect to Google may have been blocked.',
    },
  },

  // Projects
  projects: {
    title: 'Projects',
    createNew: 'Create New Project',
    noProjects: 'No projects yet',
    noProjectsSubtext: 'Get started by creating your first project',
    loading: 'Loading projects...',
    errorLoading: 'Error loading projects',
  },

  // Tasks
  tasks: {
    title: 'Tasks',
    createNew: 'Create New Task',
    noTasks: 'No tasks yet',
    loading: 'Loading tasks...',
    errorLoading: 'Error loading tasks',
  },

  // Common UI elements
  common: {
    loading: 'Loading...',
    error: 'Error',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    submit: 'Submit',
    back: 'Back',
    next: 'Next',
    logout: 'Log Out',
  },
};

/**
 * Helper function to get a nested string value
 * Example: getString('auth.errors.popupBlocked')
 */
export function getString(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], strings);
}

/**
 * Helper function to format strings with parameters
 * Example: formatString(strings.footer.copyright, 2025)
 */
export function formatString(template, ...args) {
  if (typeof template === 'function') {
    return template(...args);
  }
  return template;
}

export default strings;
