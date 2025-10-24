# Frontend Implementation Guide

## Overview

This guide outlines the frontend implementation for the RavenLoom MVP. The focus is on creating a clean, chat-first interface where users interact with their AI persona to manage their project.

## Design Philosophy

### KISS (Keep It Simple, Stupid)
- **Chat-first interface** - Primary interaction is conversation with AI persona
- **Minimal navigation** - Dashboard → Chat → Tasks (3 main views)
- **No fancy charts** - Focus on actionable items, not metrics
- **Progressive disclosure** - Show what matters, hide complexity

### User Flow (MVP)

```
1. Login (Firebase Auth)
   ↓
2. Project Dashboard
   - See existing project OR
   - Create new project button
   ↓
3. Create Project Modal
   - Enter goal in natural language
   - System suggests persona
   - User confirms or customizes
   ↓
4. Chat Interface (Main View)
   - Conversation with AI persona
   - Task list sidebar (GTD contexts)
   - Project info header
   ↓
5. Complete Tasks
   - Check off tasks
   - Persona responds to progress
   ↓
6. Reach Outcome
   - Project marked complete
   - Success celebration
```

## Component Architecture

### Page Structure

```
App
├── AuthProvider (Firebase)
├── ApolloProvider (GraphQL)
└── Router
    ├── /login → LoginPage
    ├── /dashboard → DashboardPage
    ├── /project/:id → ProjectPage
    │   ├── ChatPanel (main)
    │   └── TasksSidebar
    └── /onboarding → OnboardingFlow
```

### Key Components

#### 1. **ChatPanel** (Most Important)
The heart of the application - where users talk to their AI persona.

**Features:**
- Message history (scrollable)
- User input field (textarea with submit)
- Persona avatar and name
- Real-time typing indicator
- Optimistic updates

**Props:**
```typescript
interface ChatPanelProps {
  projectId: number;
  personaName: string;
  personaArchetype: string;
}
```

**GraphQL:**
```graphql
# Send message
mutation SendMessage($projectId: ID!, $userId: String!, $message: String!) {
  sendMessage(projectId: $projectId, userId: $userId, message: $message) {
    message { id, content, senderName, senderType, createdAt }
    persona { displayName, archetype }
  }
}

# Load history
query GetConversation($projectId: ID!, $userId: String!) {
  getConversation(projectId: $projectId, userId: $userId) {
    messages { id, content, senderName, senderType, createdAt }
  }
}
```

#### 2. **TasksSidebar**
GTD-based task list with context filtering.

**Features:**
- Filter by context (@home, @office, @computer, @errands)
- Filter by energy level (high, medium, low)
- Quick add task
- Check off completed tasks
- Time estimates visible

**Props:**
```typescript
interface TasksSidebarProps {
  projectId: number;
  onTaskComplete: (taskId: number) => void;
}
```

**GraphQL:**
```graphql
query GetTasks($projectId: ID!, $status: String) {
  getTasks(projectId: $projectId, status: $status) {
    id, title, gtdType, context, energyLevel, timeEstimate, status
  }
}

mutation UpdateTaskStatus($taskId: ID!, $status: String!) {
  updateTaskStatus(taskId: $taskId, status: $status) {
    id, status
  }
}
```

#### 3. **ProjectDashboard**
Shows existing project or prompts to create one.

**Features:**
- Project card with outcome and progress
- "Start working" button (goes to chat)
- Create new project button (only 1 project in MVP)

**GraphQL:**
```graphql
query GetProjects($userId: String!) {
  getProjects(userId: $userId) {
    id, title, description, outcome, completionType
    persona { displayName, archetype, specialization }
    tasks { id, status }
  }
}
```

#### 4. **CreateProjectModal**
AI-powered project creation flow.

**Steps:**
1. User enters goal in natural language
2. Show suggested persona with rationale
3. Customize communication preferences (optional)
4. Create project + persona

**GraphQL:**
```graphql
# Step 1: Create project
mutation CreateProject($userId: String!, $input: ProjectInput!) {
  createProject(userId: $userId, input: $input) {
    id, title, outcome
  }
}

# Step 2: Create persona
mutation CreatePersonaFromGoal(
  $projectId: ID!
  $userId: String!
  $userGoal: String!
  $preferences: CommunicationPreferencesInput
) {
  createPersonaFromGoal(
    projectId: $projectId
    userId: $userId
    userGoal: $userGoal
    preferences: $preferences
  ) {
    id, displayName, archetype, specialization
  }
}
```

## Apollo Client Setup

```javascript
// src/lib/apollo.js
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({
  uri: process.env.REACT_APP_GRAPHQL_URL || 'http://localhost:4013/graphql',
});

// Add Firebase auth token to requests
const authLink = setContext(async (_, { headers }) => {
  const token = await firebase.auth().currentUser?.getIdToken();
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  };
});

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({
    typePolicies: {
      Conversation: {
        fields: {
          messages: {
            merge(existing = [], incoming) {
              return incoming; // Replace old messages
            }
          }
        }
      }
    }
  }),
});
```

## UI/UX Guidelines

### Chat Interface Design

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [< Back] Lose 20 pounds          Health Coach 🏃    │ Header
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Persona Avatar]                                   │
│  Health Coach                                       │
│  Welcome! Let's start by...                         │
│                                                     │
│                              You                    │
│                              What should I focus on?│
│                                      [Avatar] 👤    │
│                                                     │
│  [Persona Avatar]                                   │
│  Health Coach                                       │
│  Start by tracking your daily calories...           │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Type a message...                           [Send]  │ Input
└─────────────────────────────────────────────────────┘
```

**Styling:**
- Persona messages: Left-aligned, light blue background
- User messages: Right-aligned, gray background
- Timestamp subtle (small, gray)
- Avatar: Circle, 40px
- Font: Clean sans-serif (Inter, System UI)

### Task Sidebar Design

**Layout:**
```
┌─────────────────────────┐
│ Tasks                   │
├─────────────────────────┤
│ Filter: [All] [@home]   │
│         [@office] [etc] │
├─────────────────────────┤
│                         │
│ ☐ Track daily calories  │
│   @home · 10 min · Low  │
│                         │
│ ☐ Buy gym membership    │
│   @errands · 30m · Med  │
│                         │
│ + Add task              │
│                         │
└─────────────────────────┘
```

**Styling:**
- Unchecked: Gray checkbox
- Checked: Green checkbox with strikethrough
- Context tags: Small pills with icons
- Energy level: Color-coded (red=high, yellow=med, green=low)

### Project Dashboard Design

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ RavenLoom                            [User Menu]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  My Project                                         │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ Lose 20 pounds                    Health Coach│ │
│  │                                                │ │
│  │ Outcome: Reach 180 lbs and maintain for 2 wks │ │
│  │                                                │ │
│  │ Progress: 3 of 12 tasks complete               │ │
│  │ [▓▓▓▓░░░░░░░░] 25%                            │ │
│  │                                                │ │
│  │                     [Continue Working →]       │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Recommended Libraries

### Essential
- **@apollo/client** - GraphQL client (already chosen)
- **react-router-dom** - Routing
- **firebase** - Authentication
- **tailwindcss** - Styling (already configured)

### Nice-to-Have
- **react-hook-form** - Form handling
- **date-fns** - Date formatting
- **react-hot-toast** - Notifications
- **framer-motion** - Animations (subtle)

## Implementation Order

### Phase 1: Foundation (Day 1-2)
1. Set up Apollo Client with auth
2. Create AuthProvider with Firebase
3. Build LoginPage with Firebase UI
4. Create basic routing structure

### Phase 2: Core UI (Day 3-5)
5. Build ProjectDashboard
6. Build CreateProjectModal
7. Build ChatPanel (basic)
8. Build MessageBubble component

### Phase 3: Functionality (Day 6-8)
9. Implement sendMessage mutation with optimistic updates
10. Build TasksSidebar
11. Implement task filtering
12. Add task completion

### Phase 4: Polish (Day 9-10)
13. Add loading states
14. Add error handling
15. Add success animations
16. Mobile responsive testing

## Code Examples

### ChatPanel Component

```jsx
// src/components/ChatPanel.jsx
import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { SEND_MESSAGE, GET_CONVERSATION } from '../graphql/queries';

export function ChatPanel({ projectId, userId }) {
  const [message, setMessage] = useState('');

  const { data, loading } = useQuery(GET_CONVERSATION, {
    variables: { projectId, userId },
    pollInterval: 3000, // Refresh every 3s
  });

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    refetchQueries: ['GetConversation'],
    optimisticResponse: {
      sendMessage: {
        message: {
          id: 'temp-id',
          content: message,
          senderName: 'You',
          senderType: 'user',
          createdAt: new Date().toISOString(),
        }
      }
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    await sendMessage({
      variables: { projectId, userId, message }
    });

    setMessage('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {data?.getConversation?.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

### CreateProjectModal Component

```jsx
// src/components/CreateProjectModal.jsx
import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { CREATE_PROJECT, CREATE_PERSONA_FROM_GOAL } from '../graphql/queries';

export function CreateProjectModal({ userId, onClose }) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('');
  const [projectId, setProjectId] = useState(null);

  const [createProject] = useMutation(CREATE_PROJECT);
  const [createPersona] = useMutation(CREATE_PERSONA_FROM_GOAL);

  const handleCreateProject = async () => {
    // Parse goal into title/description/outcome
    const title = goal.split('.')[0]; // First sentence

    const result = await createProject({
      variables: {
        userId,
        input: {
          title,
          description: goal,
          completionType: 'milestone',
          outcome: 'To be refined with AI persona',
        }
      }
    });

    setProjectId(result.data.createProject.id);
    setStep(2);
  };

  const handleCreatePersona = async () => {
    await createPersona({
      variables: {
        projectId,
        userId,
        userGoal: goal,
        preferences: {
          tone: 'friendly',
          verbosity: 'balanced',
          emoji: true,
          platitudes: false,
        }
      }
    });

    onClose();
    // Navigate to project chat
    window.location.href = `/project/${projectId}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
        {step === 1 && (
          <>
            <h2 className="text-2xl font-bold mb-4">What do you want to achieve?</h2>
            <p className="text-gray-600 mb-6">
              Describe your goal in your own words. Our AI will help you create a plan.
            </p>

            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Example: I want to lose 20 pounds by eating healthier and exercising regularly..."
              className="w-full h-32 px-4 py-2 border rounded-lg mb-4"
            />

            <div className="flex justify-end gap-4">
              <button onClick={onClose} className="px-6 py-2 border rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!goal.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-2xl font-bold mb-4">Creating your AI coach...</h2>
            <p className="text-gray-600 mb-6">
              We're analyzing your goal and selecting the best AI persona to help you succeed.
            </p>

            <button
              onClick={handleCreatePersona}
              className="w-full px-6 py-2 bg-blue-500 text-white rounded-lg"
            >
              Start Chatting
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

## Testing Strategy

### Manual Testing Checklist
- [ ] User can log in with Firebase
- [ ] User can create a project
- [ ] AI persona is created automatically
- [ ] User can send chat messages
- [ ] AI persona responds within 3 seconds
- [ ] Messages persist after refresh
- [ ] User can create tasks
- [ ] User can complete tasks
- [ ] Task filters work correctly
- [ ] Mobile layout is usable

### Key User Flows to Test
1. **First-time user:** Login → Create project → Chat → Create task → Complete task
2. **Returning user:** Login → See project → Continue chatting
3. **Task management:** View tasks by context → Complete task → See in chat

## Performance Considerations

### Optimization Tips
1. **Lazy load** non-critical components
2. **Debounce** message sending (prevent spam)
3. **Paginate** message history (load last 50, then load more)
4. **Cache** persona data (rarely changes)
5. **Optimistic updates** for instant feedback

### Bundle Size Goals
- Initial bundle: < 250KB gzipped
- Time to interactive: < 3 seconds
- Chat message send: < 500ms perceived latency

## Accessibility

### Requirements
- Keyboard navigation for all interactions
- ARIA labels for screen readers
- Focus management in modals
- Color contrast ratio > 4.5:1
- Error messages announced to screen readers

## Mobile Considerations

### Responsive Breakpoints
- Mobile: < 768px (single column, chat full-screen)
- Tablet: 768px - 1024px (sidebar collapsible)
- Desktop: > 1024px (sidebar always visible)

### Mobile-Specific Features
- Swipe to show/hide task sidebar
- Fixed input at bottom (no keyboard covering)
- Larger tap targets (48px minimum)
- Pull to refresh conversation

## Next Steps

1. **Review this guide** with your team
2. **Set up development environment** (React + Apollo + Firebase)
3. **Start with Phase 1** (foundation)
4. **Build incrementally** and test each component
5. **Deploy MVP** once chat + tasks are working

The backend is ready and waiting. Time to build the frontend! 🚀
