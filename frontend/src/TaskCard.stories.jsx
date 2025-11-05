/**
 * TaskCard Component Stories
 *
 * Visual testing and documentation for TaskCard component.
 * Run Storybook: npm run storybook
 */

import TaskCard from './TaskCard';

export default {
  title: 'Components/TaskCard',
  component: TaskCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onStatusChange: { action: 'status changed' },
    onEdit: { action: 'edit clicked' },
    onDelete: { action: 'delete clicked' },
  },
};

// Default state - not started
export const Default = {
  args: {
    task: {
      id: 1,
      title: 'Call the vendor',
      status: 'not_started',
      priority: 2,
      dueDate: '2025-01-15',
      context: '@phone',
      description: 'Follow up on the contract terms',
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
      description: 'Refresh the hero section and add testimonials',
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
      blockerReason: 'Waiting for API access credentials',
    },
  },
};

// Cancelled state
export const Cancelled = {
  args: {
    task: {
      id: 5,
      title: 'Old feature request',
      status: 'cancelled',
      priority: 1,
      context: '@anywhere',
      cancelledReason: 'No longer needed',
    },
  },
};

// High Priority
export const HighPriority = {
  args: {
    task: {
      id: 6,
      title: 'Fix critical bug in payment flow',
      status: 'not_started',
      priority: 3,
      dueDate: '2025-01-04',
      context: '@computer',
    },
  },
};

// Low Priority
export const LowPriority = {
  args: {
    task: {
      id: 7,
      title: 'Update documentation',
      status: 'not_started',
      priority: 1,
      dueDate: '2025-02-01',
      context: '@computer',
    },
  },
};

// Overdue task
export const Overdue = {
  args: {
    task: {
      id: 8,
      title: 'Submit quarterly report',
      status: 'not_started',
      priority: 3,
      dueDate: '2024-12-31',
      context: '@office',
    },
  },
};

// Task with long title
export const LongTitle = {
  args: {
    task: {
      id: 9,
      title: 'This is a very long task title that should wrap or truncate appropriately depending on the component design and layout constraints',
      status: 'not_started',
      priority: 2,
      context: '@computer',
    },
  },
};

// Task with long description
export const LongDescription = {
  args: {
    task: {
      id: 10,
      title: 'Research competitors',
      status: 'in_progress',
      priority: 2,
      context: '@anywhere',
      description: 'Conduct comprehensive research on top 10 competitors in the market. Analyze their pricing models, feature sets, target audience, marketing strategies, and customer reviews. Create a detailed comparison matrix and identify opportunities for differentiation.',
    },
  },
};

// Task without due date
export const NoDueDate = {
  args: {
    task: {
      id: 11,
      title: 'Brainstorm new features',
      status: 'not_started',
      priority: 1,
      context: '@anywhere',
    },
  },
};

// Task without context
export const NoContext = {
  args: {
    task: {
      id: 12,
      title: 'Review team feedback',
      status: 'not_started',
      priority: 2,
      dueDate: '2025-01-10',
    },
  },
};

// Minimal task (only required fields)
export const Minimal = {
  args: {
    task: {
      id: 13,
      title: 'Minimal task example',
      status: 'not_started',
      priority: 2,
    },
  },
};

// Loading state
export const Loading = {
  args: {
    task: {
      id: 14,
      title: 'Loading task...',
      status: 'not_started',
      priority: 2,
    },
    isLoading: true,
  },
};

// Error state
export const Error = {
  args: {
    task: {
      id: 15,
      title: 'Failed to load task',
      status: 'not_started',
      priority: 2,
    },
    hasError: true,
    errorMessage: 'Failed to load task details. Please try again.',
  },
};

// With all interactions
export const Interactive = {
  args: {
    task: {
      id: 16,
      title: 'Interactive task card',
      status: 'not_started',
      priority: 2,
      dueDate: '2025-01-15',
      context: '@computer',
      description: 'Test all interactions: status change, edit, delete',
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
};

// Different contexts
export const PhoneContext = {
  args: {
    task: {
      id: 17,
      title: 'Call client',
      status: 'not_started',
      priority: 2,
      context: '@phone',
    },
  },
};

export const HomeContext = {
  args: {
    task: {
      id: 18,
      title: 'Organize workspace',
      status: 'not_started',
      priority: 1,
      context: '@home',
    },
  },
};

export const OfficeContext = {
  args: {
    task: {
      id: 19,
      title: 'Team meeting',
      status: 'not_started',
      priority: 2,
      context: '@office',
    },
  },
};

export const ErrandsContext = {
  args: {
    task: {
      id: 20,
      title: 'Pick up supplies',
      status: 'not_started',
      priority: 1,
      context: '@errands',
    },
  },
};
