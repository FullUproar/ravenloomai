/**
 * Onboarding Flow Definitions
 *
 * Defines conversational onboarding flows for creating projects, goals, and tasks.
 * Uses prerequisite-based questions that adapt based on what information is already provided.
 */

/**
 * Onboarding Flow Structure:
 * - id: Unique identifier for the flow
 * - name: Display name
 * - description: What this flow creates
 * - fields: Array of required fields with prerequisites
 * - personaAdaptations: How different persona archetypes should modify the flow
 * - completionActions: Functions to call when onboarding is complete
 */

export const ONBOARDING_FLOWS = {
  /**
   * PROJECT ONBOARDING
   * Creates a new project with persona selection
   */
  project: {
    id: 'project',
    name: 'Project Setup',
    description: 'Create a new project and choose your AI assistant',
    hierarchy: 1,

    fields: [
      {
        key: 'title',
        label: 'Project Name',
        type: 'string',
        required: true,
        prompt: 'What would you like to call this project?',
        validation: {
          minLength: 3,
          maxLength: 100
        },
        examples: [
          'Launch my startup',
          'Get healthy',
          'Learn to code',
          'Plan my wedding'
        ]
      },
      {
        key: 'description',
        label: 'Description',
        type: 'text',
        required: false,
        prompt: 'Tell me more about what you want to achieve. What\'s the vision?',
        dependsOn: ['title'],
        validation: {
          maxLength: 500
        }
      },
      {
        key: 'outcome',
        label: 'Desired Outcome',
        type: 'string',
        required: true,
        prompt: 'What does success look like? How will you know when you\'ve achieved this?',
        dependsOn: ['title'],
        validation: {
          minLength: 10,
          maxLength: 200
        },
        examples: [
          'App launched with 1000 users',
          'Lost 20 pounds and running 5k',
          'Built 3 working apps',
          'Successfully married with amazing memories'
        ]
      },
      {
        key: 'completionType',
        label: 'Project Type',
        type: 'enum',
        required: true,
        prompt: 'What type of project is this?',
        options: [
          { value: 'milestone', label: 'Milestone-based (specific end goal)' },
          { value: 'habit_formation', label: 'Habit formation (build lasting habits)' },
          { value: 'ongoing', label: 'Ongoing (continuous improvement)' }
        ],
        default: 'milestone'
      },
      {
        key: 'personaArchetype',
        label: 'Assistant Style',
        type: 'enum',
        required: true,
        prompt: 'What kind of assistant would help you most?',
        dependsOn: ['outcome'],
        options: [
          { value: 'coach', label: 'Coach - Motivational and supportive' },
          { value: 'strategist', label: 'Strategist - Analytical and planning-focused' },
          { value: 'mentor', label: 'Mentor - Wise and guiding' },
          { value: 'partner', label: 'Partner - Collaborative and balanced' }
        ],
        personaPrompt: 'Based on your goal, I\'d recommend a {suggested} style assistant, but you can choose what works best for you.'
      },
      {
        key: 'personaSpecialization',
        label: 'Domain Expertise',
        type: 'enum',
        required: false,
        prompt: 'Would you like your assistant to have specialized knowledge?',
        dependsOn: ['personaArchetype'],
        optionsDynamic: true, // Options depend on archetype chosen
        examples: [
          'Startup & Business',
          'Health & Fitness',
          'Creative Projects',
          'Learning & Education',
          'General Purpose'
        ]
      }
    ],

    personaAdaptations: {
      coach: {
        tone: 'enthusiastic',
        promptModifiers: {
          outcome: 'Let\'s get specific! What\'s your big goal here?',
          completionType: 'How do you want to measure your wins?'
        }
      },
      strategist: {
        tone: 'analytical',
        promptModifiers: {
          outcome: 'What are the key success metrics for this project?',
          completionType: 'What\'s the optimal project structure?'
        }
      },
      mentor: {
        tone: 'wise',
        promptModifiers: {
          outcome: 'What transformation are you seeking?',
          completionType: 'What approach will serve you best?'
        }
      }
    },

    completionActions: ['createProject', 'createPersona', 'suggestInitialGoals']
  },

  /**
   * GOAL ONBOARDING
   * Creates a new goal within a project
   */
  goal: {
    id: 'goal',
    name: 'Goal Setup',
    description: 'Define a new goal to work toward',
    hierarchy: 2,
    requiresParent: 'project',

    fields: [
      {
        key: 'title',
        label: 'Goal Title',
        type: 'string',
        required: true,
        prompt: 'What do you want to achieve?',
        validation: {
          minLength: 5,
          maxLength: 100
        },
        examples: [
          'Lose 10 pounds',
          'Launch MVP',
          'Learn React',
          'Run a 5K'
        ]
      },
      {
        key: 'description',
        label: 'Details',
        type: 'text',
        required: false,
        prompt: 'Want to add any details about this goal?',
        dependsOn: ['title']
      },
      {
        key: 'measurable',
        label: 'Is Measurable',
        type: 'boolean',
        required: true,
        prompt: 'Can you measure progress on this goal with numbers?',
        inferredFrom: ['title'], // AI can infer from title
        default: true
      },
      {
        key: 'targetValue',
        label: 'Target',
        type: 'number',
        required: false,
        prompt: 'What\'s your target number?',
        dependsOn: ['measurable'],
        showIf: { measurable: true },
        examples: ['10', '1000', '50000']
      },
      {
        key: 'unit',
        label: 'Unit',
        type: 'string',
        required: false,
        prompt: 'What unit are you measuring? (pounds, users, dollars, etc.)',
        dependsOn: ['targetValue'],
        showIf: { measurable: true },
        inferredFrom: ['title', 'targetValue'],
        examples: ['pounds', 'users', 'dollars', 'kilometers']
      },
      {
        key: 'currentValue',
        label: 'Current Progress',
        type: 'number',
        required: false,
        prompt: 'Where are you starting from?',
        dependsOn: ['targetValue', 'unit'],
        showIf: { measurable: true },
        default: 0
      },
      {
        key: 'targetDate',
        label: 'Target Date',
        type: 'date',
        required: false,
        prompt: 'When do you want to achieve this by?',
        dependsOn: ['title'],
        examples: ['End of the month', 'In 3 months', 'By summer']
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'enum',
        required: true,
        prompt: 'How important is this goal?',
        options: [
          { value: 3, label: 'High - Top priority' },
          { value: 2, label: 'Medium - Important but not urgent' },
          { value: 1, label: 'Low - Nice to have' }
        ],
        default: 2,
        inferredFrom: ['title', 'targetDate'] // AI can infer urgency
      }
    ],

    personaAdaptations: {
      coach: {
        promptModifiers: {
          title: 'What\'s the goal that\'s going to feel amazing to crush?',
          targetDate: 'When are we celebrating this win?'
        }
      },
      strategist: {
        promptModifiers: {
          title: 'What\'s the specific, measurable objective?',
          priority: 'How does this rank against your other goals?'
        }
      }
    },

    completionActions: ['createGoal', 'askAboutTasks', 'suggestMetrics']
  },

  /**
   * TASK ONBOARDING
   * Creates a new task
   */
  task: {
    id: 'task',
    name: 'Task Setup',
    description: 'Add a task to your list',
    hierarchy: 3,
    requiresParent: false, // Can exist without goal/project

    fields: [
      {
        key: 'title',
        label: 'Task Name',
        type: 'string',
        required: true,
        prompt: 'What needs to be done?',
        validation: {
          minLength: 3,
          maxLength: 200
        },
        examples: [
          'Call the designer',
          'Write landing page copy',
          'Go to the gym',
          'Research competitors'
        ]
      },
      {
        key: 'description',
        label: 'Details',
        type: 'text',
        required: false,
        prompt: 'Any details on how to do this?',
        dependsOn: ['title']
      },
      {
        key: 'goalId',
        label: 'Related Goal',
        type: 'reference',
        required: false,
        prompt: 'Does this task contribute to a specific goal?',
        referenceType: 'goal',
        showExisting: true
      },
      {
        key: 'dueDate',
        label: 'Due Date',
        type: 'datetime',
        required: false,
        prompt: 'When does this need to be done?',
        dependsOn: ['title'],
        examples: ['Tomorrow', 'By Friday', 'End of week', 'Next Monday 2pm']
      },
      {
        key: 'context',
        label: 'Context',
        type: 'enum',
        required: true,
        prompt: 'Where or how can you do this?',
        options: [
          { value: '@anywhere', label: 'Anywhere' },
          { value: '@home', label: 'At home' },
          { value: '@office', label: 'At office' },
          { value: '@computer', label: 'On computer' },
          { value: '@phone', label: 'Phone call' },
          { value: '@errands', label: 'While out' }
        ],
        default: '@anywhere',
        inferredFrom: ['title']
      },
      {
        key: 'energyLevel',
        label: 'Energy Required',
        type: 'enum',
        required: true,
        prompt: 'How much energy does this need?',
        options: [
          { value: 'low', label: 'Low - Easy, quick task' },
          { value: 'medium', label: 'Medium - Moderate effort' },
          { value: 'high', label: 'High - Demanding work' }
        ],
        default: 'medium',
        inferredFrom: ['title', 'description']
      },
      {
        key: 'timeEstimate',
        label: 'Time Estimate',
        type: 'number',
        required: false,
        prompt: 'About how many minutes will this take?',
        dependsOn: ['title'],
        unit: 'minutes',
        inferredFrom: ['title', 'energyLevel'],
        examples: ['15', '30', '60', '120']
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'enum',
        required: true,
        prompt: 'How important is this?',
        options: [
          { value: 3, label: 'High - Do this first' },
          { value: 2, label: 'Medium - Normal priority' },
          { value: 1, label: 'Low - When you have time' }
        ],
        default: 2,
        inferredFrom: ['title', 'dueDate']
      }
    ],

    personaAdaptations: {
      coach: {
        promptModifiers: {
          title: 'What action are you committing to?',
          dueDate: 'When are you going to make this happen?'
        }
      },
      strategist: {
        promptModifiers: {
          context: 'What\'s the optimal context for executing this?',
          timeEstimate: 'How long should we allocate for this task?'
        }
      }
    },

    completionActions: ['createTask', 'suggestRelatedTasks']
  }
};

/**
 * Get onboarding flow by ID
 */
export function getOnboardingFlow(flowId) {
  return ONBOARDING_FLOWS[flowId];
}

/**
 * Get all available flows
 */
export function getAllOnboardingFlows() {
  return Object.values(ONBOARDING_FLOWS);
}

/**
 * Get flows by hierarchy level
 */
export function getFlowsByHierarchy() {
  return Object.values(ONBOARDING_FLOWS).sort((a, b) => a.hierarchy - b.hierarchy);
}

export default ONBOARDING_FLOWS;
