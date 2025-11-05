# RavenLoom Architecture Overview

## System Overview

RavenLoom is an AI-powered project management system with conversational onboarding, intelligent task/goal creation, and multi-persona support. The system uses a hierarchical structure: **Projects → Goals → Tasks**, where each level can exist independently or as part of the hierarchy.

## Core Concepts

### Hierarchy

```
Theme (future concept)
  └── Project
       ├── Goals (measurable objectives)
       │    ├── Tasks (action items)
       │    └── Metrics (progress tracking)
       └── Tasks (can exist without goals)
```

**Key Points:**
- Tasks can exist with or without goals
- Goals can exist with or without projects (standalone personal goals)
- Everything ties to a user and optionally to a project
- Flexible hierarchy allows for various use cases

### Multi-Persona System

Projects can have multiple AI personas with different roles:

- **Primary**: Main assistant, always available
- **Specialist**: Domain expert (e.g., fitness coach, startup advisor)
- **Advisor**: Occasional guidance for specific situations
- **Mentor**: Wisdom and long-term perspective

**Persona Switching:**
- Manual: User explicitly switches
- Automatic: Triggered by keywords, task types, time of day
- Context-aware: AI suggests best persona based on situation
- Scheduled: Personas available at specific times

## Key Features

### 1. Conversational Onboarding

**Prerequisite-Based Question Flow:**
- Questions asked only when dependencies are met
- AI extracts multiple fields from single user response
- No double-asking if user volunteers information
- Persona-adapted prompts (coach vs strategist style)

**Onboarding Types:**
- Project onboarding (includes persona selection)
- Goal onboarding (measurable objectives)
- Task onboarding (action items)

**Example Flow:**
```
User: "I want to lose 10 pounds by summer"

AI extracts:
- Goal title: "Lose 10 pounds"
- Target value: 10
- Unit: pounds
- Target date: ~June 2025
- Type: measurable goal

AI asks: "What's your current weight?" (only asks what it couldn't infer)
```

### 2. AI Function Calling

The AI can directly create and manage items through function calls:

**Available Functions:**
- `createGoal()` - Create goals from user descriptions
- `createTask()` - Auto-create tasks from action items mentioned
- `recordMetric()` - Capture progress data
- `updateGoalProgress()` - Update goal current values
- `updateTaskStatus()` - Mark tasks as done/in-progress/blocked
- `getGoals()`, `getTasks()`, `getMetrics()` - Query for context

**Example:**
```
User: "I need to call the vendor tomorrow and update the landing page"

AI calls:
1. createTask({title: "Call vendor", dueDate: "tomorrow", context: "@phone"})
2. createTask({title: "Update landing page", context: "@computer"})

AI responds: "Got it! I've added two tasks for you."
```

### 3. Goals & Metrics System

**Goals:**
- Title, description, priority, target date
- Optional: targetValue, currentValue, unit (for measurable goals)
- Status tracking (active, paused, completed, abandoned)
- Link to project (optional)

**Metrics:**
- Time-series data tracking progress
- Link to goals
- Source tracking (user_reported, device, app, ai)

## Technical Architecture

### Backend Structure

```
backend/
├── config/
│   ├── aiFunctions.js          # AI function definitions
│   ├── archetypes.js           # Persona archetypes
│   └── onboardingFlows.js      # Onboarding flow definitions
├── services/
│   ├── ConversationService.js  # Chat + AI functions
│   ├── OnboardingService.js    # Prerequisite-based onboarding
│   ├── MultiPersonaService.js  # Multi-persona management
│   ├── AIFunctionExecutor.js   # Executes AI function calls
│   └── PersonaPromptBuilder.js # Builds AI system prompts
└── graphql/resolvers/
    ├── goalResolvers.js        # Goal CRUD
    ├── taskResolvers.js        # Task CRUD
    └── conversationResolvers.js # Chat operations
```

### Database Schema

**Core Tables:**
- `projects` - Project details
- `goals` - Measurable objectives
- `tasks` - Action items
- `metrics` - Progress tracking
- `personas` - AI assistants
- `onboarding_sessions` - Active onboarding flows
- `persona_switches` - Switching history

## Implementation Status

### ✅ Completed

1. **Goals System**: Full GraphQL CRUD for goals with metrics
2. **AI Function Calling**: 8 functions for creating/updating items
3. **Conversational Onboarding**: Prerequisite-based flows for projects/goals/tasks
4. **Multi-Persona Architecture**: Role-based personas with auto-switching
5. **Database Migrations**: All tables and indexes created

### 🚧 Next Steps

1. Test AI function calling in mobile app
2. Add UI for goals and metrics tracking
3. Implement onboarding UI flows
4. Add persona switching UI
5. Build scheduled check-ins system

## Usage Examples

### Creating a Goal via Chat

```
User: "I want to lose 10 pounds by summer"

AI: *calls createGoal({
  title: "Lose 10 pounds",
  targetValue: 10,
  unit: "pounds",
  targetDate: "2025-06-21"
})*

AI: "Perfect! I've set up your goal to lose 10 pounds by summer. Want to track your weight daily?"
```

### Creating Multiple Tasks

```
User: "Tomorrow I need to call the designer, write the blog post, and review the metrics"

AI: *calls createTask() 3 times*

AI: "Added three tasks for tomorrow:
✓ Call the designer
✓ Write the blog post
✓ Review the metrics"
```

### Onboarding a New Project

```
AI: "What would you like to call this project?"
User: "Launch my startup"

AI: "Tell me about what you want to achieve. What's the vision?"
User: "I want to build a SaaS product and get to 1000 paying users in 6 months"

AI: *extracts: outcome="1000 paying users in 6 months", targetDate="June 2025"*

AI: "What kind of assistant would help you most? I'd recommend a Strategist for analytical planning, but you can choose:"
- Coach (motivational)
- Strategist (analytical)
- Mentor (wisdom)
- Partner (collaborative)
```

## Best Practices

### Onboarding Design

1. Keep prompts conversational
2. Minimize questions by inferring data
3. Respect user input - extract all info at once
4. Provide examples
5. Adapt to persona style

### Function Calling

1. Be proactive - create items automatically
2. Confirm actions naturally
3. Handle errors gracefully
4. Batch operations when appropriate

### Multi-Persona

1. Clear roles for each persona
2. Log switches for context
3. Allow manual override
4. Preserve context across switches
