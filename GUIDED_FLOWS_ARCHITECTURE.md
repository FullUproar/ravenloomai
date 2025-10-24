# RavenLoom Guided Flows Architecture

## Overview

Structured conversation flows that guide users through critical project moments while maintaining the natural chat experience. Think of these as "conversation scripts" that the AI persona follows.

## Design Philosophy

1. **Conversational, Not Forms** - Still feels like chatting, not filling out a questionnaire
2. **Progressive Disclosure** - Ask one question at a time, build context
3. **Exit Anytime** - User can break out of flow to ask questions
4. **Resume Gracefully** - Can pick up where they left off
5. **Persona-Adapted** - Each archetype runs flows differently (Coach vs Strategist)

---

## Core Flow Types

### 1. Project Onboarding
**When:** User creates new project
**Purpose:** Understand goal, constraints, success criteria
**Duration:** 5-10 messages

### 2. Status Check-In
**When:** Weekly/milestone-based trigger
**Purpose:** Review progress, identify blockers, adjust plans
**Duration:** 3-5 messages

### 3. Pivot Review
**When:** User indicates major change or stuck
**Purpose:** Re-evaluate approach, propose alternatives
**Duration:** 5-8 messages

### 4. Milestone Retrospective
**When:** Milestone completed or missed
**Purpose:** Learn from experience, celebrate/analyze
**Duration:** 3-5 messages

### 5. Sprint Planning
**When:** Start of new sprint/week
**Purpose:** Set goals, break down tasks, commit to work
**Duration:** 4-6 messages

### 6. Blocker Resolution
**When:** User mentions being blocked
**Purpose:** Diagnose issue, suggest solutions
**Duration:** 3-5 messages

---

## Implementation Architecture

### Database Schema

```sql
-- Flow definitions (templates)
CREATE TABLE flow_templates (
  id SERIAL PRIMARY KEY,
  flow_type VARCHAR(50) NOT NULL, -- 'onboarding', 'status_checkin', 'pivot_review', etc.
  name VARCHAR(255) NOT NULL,
  description TEXT,
  archetype VARCHAR(50), -- NULL = works for all archetypes, or specific to one
  steps JSONB NOT NULL, -- Array of step definitions
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(flow_type, archetype)
);

-- Active flow instances
CREATE TABLE flow_instances (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  flow_template_id INTEGER REFERENCES flow_templates(id),
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'completed', 'abandoned'
  current_step INTEGER DEFAULT 0,
  collected_data JSONB DEFAULT '{}', -- Answers/data collected so far
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  paused_at TIMESTAMP,

  UNIQUE(conversation_id, flow_template_id) DEFERRABLE INITIALLY DEFERRED
);

-- Flow triggers (when to automatically start flows)
CREATE TABLE flow_triggers (
  id SERIAL PRIMARY KEY,
  flow_template_id INTEGER REFERENCES flow_templates(id),
  trigger_type VARCHAR(50) NOT NULL, -- 'time_based', 'event_based', 'milestone_based'
  trigger_config JSONB NOT NULL, -- Configuration for trigger
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flow_instances_active ON flow_instances(project_id, status) WHERE status = 'active';
```

### Flow Template Structure

```javascript
const flowTemplate = {
  flow_type: 'onboarding',
  name: 'Project Onboarding',
  archetype: 'coach', // or null for all archetypes
  steps: [
    {
      step_id: 1,
      type: 'question', // 'question', 'validation', 'suggestion', 'summary'
      prompt: "What are you hoping to achieve with this project?",
      follow_up: "Tell me more - what does success look like?",
      validation: {
        min_length: 20,
        requires_specificity: true
      },
      extract: ['goal', 'success_criteria'], // What data to extract
      next_step: 2
    },
    {
      step_id: 2,
      type: 'question',
      prompt: "What timeline are you working with?",
      conditional: true, // Only ask if previous answer suggests urgency
      extract: ['deadline', 'timeline_type'],
      next_step: 3
    },
    {
      step_id: 3,
      type: 'question',
      prompt: "What challenges do you anticipate?",
      extract: ['anticipated_blockers'],
      next_step: 4
    },
    {
      step_id: 4,
      type: 'suggestion',
      prompt: "Based on what you've told me, here's how I suggest we approach this...",
      action: 'generate_initial_plan', // Function to call
      next_step: 5
    },
    {
      step_id: 5,
      type: 'summary',
      prompt: "Let me summarize what we've covered...",
      action: 'store_project_context',
      complete: true
    }
  ]
};
```

### Service: `GuidedFlowService.js`

```javascript
class GuidedFlowService {
  // Start a new flow
  async startFlow(projectId, conversationId, flowType) {
    // Get appropriate flow template for this persona
    const persona = await PersonaService.getActivePersona(projectId);
    const template = await this._getFlowTemplate(flowType, persona.archetype);

    // Create flow instance
    const result = await db.query(`
      INSERT INTO flow_instances (project_id, conversation_id, flow_template_id, current_step)
      VALUES ($1, $2, $3, 0)
      RETURNING id
    `, [projectId, conversationId, template.id]);

    return result.rows[0].id;
  }

  // Get next step in flow
  async getNextStep(flowInstanceId) {
    const instance = await this._getFlowInstance(flowInstanceId);
    const template = await this._getFlowTemplate(instance.flow_template_id);

    const currentStepIndex = instance.current_step;
    const nextStep = template.steps[currentStepIndex];

    if (!nextStep) {
      // Flow complete
      await this._completeFlow(flowInstanceId);
      return null;
    }

    // Check conditionals
    if (nextStep.conditional && !this._evaluateCondition(nextStep, instance.collected_data)) {
      // Skip this step
      await this._advanceStep(flowInstanceId);
      return this.getNextStep(flowInstanceId); // Recursively get next valid step
    }

    return nextStep;
  }

  // Process user response to current step
  async processResponse(flowInstanceId, userMessage) {
    const instance = await this._getFlowInstance(flowInstanceId);
    const template = await this._getFlowTemplate(instance.flow_template_id);
    const currentStep = template.steps[instance.current_step];

    // Extract data from user response
    const extractedData = await this._extractData(userMessage, currentStep.extract);

    // Validate if needed
    if (currentStep.validation) {
      const isValid = await this._validate(extractedData, currentStep.validation);
      if (!isValid) {
        // Return clarification prompt
        return {
          type: 'clarification',
          prompt: currentStep.follow_up || "Could you provide a bit more detail?"
        };
      }
    }

    // Store collected data
    await this._storeData(flowInstanceId, extractedData);

    // Execute action if this is an action step
    if (currentStep.action) {
      await this._executeAction(currentStep.action, instance, extractedData);
    }

    // Advance to next step
    await this._advanceStep(flowInstanceId);

    // Check if flow is complete
    if (currentStep.complete) {
      await this._completeFlow(flowInstanceId);
      return { type: 'complete', summary: await this._generateSummary(instance) };
    }

    // Get next prompt
    const nextStep = await this.getNextStep(flowInstanceId);
    return {
      type: 'continue',
      prompt: nextStep.prompt,
      step_id: nextStep.step_id
    };
  }

  // Pause flow (user wants to break out)
  async pauseFlow(flowInstanceId) {
    await db.query(`
      UPDATE flow_instances
      SET status = 'paused', paused_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [flowInstanceId]);
  }

  // Resume flow
  async resumeFlow(flowInstanceId) {
    await db.query(`
      UPDATE flow_instances
      SET status = 'active', paused_at = NULL
      WHERE id = $1
    `, [flowInstanceId]);

    return this.getNextStep(flowInstanceId);
  }

  // Extract structured data from user response
  async _extractData(userMessage, extractFields) {
    if (!extractFields || extractFields.length === 0) return {};

    const prompt = `Extract the following information from the user's message:
    ${extractFields.map(field => `- ${field}`).join('\n')}

    Return as JSON object with those keys.`;

    return await generateStructuredOutput([
      { role: 'system', content: prompt },
      { role: 'user', content: userMessage }
    ]);
  }

  // Execute flow actions
  async _executeAction(action, instance, data) {
    switch (action) {
      case 'generate_initial_plan':
        return this._generateInitialPlan(instance.project_id, instance.collected_data);

      case 'store_project_context':
        return this._storeProjectContext(instance.project_id, instance.collected_data);

      case 'create_milestones':
        return this._createMilestones(instance.project_id, data);

      case 'analyze_blocker':
        return this._analyzeBlocker(instance.project_id, data);

      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  // Generate initial project plan
  async _generateInitialPlan(projectId, collectedData) {
    // Use LLM to create initial plan based on collected data
    const prompt = `Based on this project information:
    ${JSON.stringify(collectedData, null, 2)}

    Create an initial project plan with:
    1. First milestone
    2. 3-5 initial tasks
    3. Key success metrics

    Use structured format: [MILESTONE:...] and [TASK:...]`;

    const plan = await generateChatCompletion([
      { role: 'system', content: prompt }
    ]);

    // Store in medium-term memory
    await MediumTermMemory.remember(projectId, 'initial_plan', plan, {
      type: 'decision',
      importance: 10
    });

    return plan;
  }
}
```

### Integration with Chat

```javascript
// In ConversationService.js

async generatePersonaResponse(projectId, userId, userMessage) {
  // Check if there's an active flow
  const activeFlow = await GuidedFlowService.getActiveFlow(projectId);

  if (activeFlow) {
    // User is in a guided flow
    const flowResponse = await GuidedFlowService.processResponse(activeFlow.id, userMessage);

    if (flowResponse.type === 'complete') {
      // Flow finished, return summary and go back to normal chat
      return {
        content: flowResponse.summary,
        flow_completed: true
      };
    }

    // Return next step prompt
    return {
      content: flowResponse.prompt,
      in_flow: true,
      flow_step: flowResponse.step_id
    };
  }

  // Detect if user wants to start a flow
  const flowIntent = await this._detectFlowIntent(userMessage);
  if (flowIntent) {
    const flowId = await GuidedFlowService.startFlow(projectId, conversationId, flowIntent.type);
    const firstStep = await GuidedFlowService.getNextStep(flowId);

    return {
      content: firstStep.prompt,
      in_flow: true,
      flow_started: flowIntent.type
    };
  }

  // Normal conversation (no flow)
  return await this._generateNormalResponse(projectId, userId, userMessage);
}

// Detect flow intent from user message
async _detectFlowIntent(userMessage) {
  // Simple keyword matching (could use LLM for better detection)
  const intents = {
    onboarding: ['getting started', 'where do I begin', 'help me start'],
    status_checkin: ['how am I doing', 'progress check', 'status update'],
    pivot_review: ['not working', 'change approach', 'stuck', 'pivot'],
    blocker_resolution: ['blocked', "can't", 'problem with', 'issue with'],
    sprint_planning: ['this week', 'plan sprint', 'what should I work on']
  };

  for (const [flowType, keywords] of Object.entries(intents)) {
    if (keywords.some(kw => userMessage.toLowerCase().includes(kw))) {
      return { type: flowType };
    }
  }

  return null;
}
```

---

## Flow Definitions

### 1. Project Onboarding Flow

**Archetype Variations:**

**Coach Version:**
```javascript
{
  steps: [
    {
      prompt: "I'm excited to work with you! What's the main goal you want to achieve?",
      extract: ['goal'],
    },
    {
      prompt: "That's great! What does success look like for you personally?",
      extract: ['success_criteria', 'motivation'],
    },
    {
      prompt: "What obstacles do you think might get in your way?",
      extract: ['anticipated_blockers'],
    },
    {
      prompt: "Let's start with one small win. What's something you could do this week?",
      action: 'generate_first_task',
    }
  ]
}
```

**Strategist Version:**
```javascript
{
  steps: [
    {
      prompt: "What's the strategic objective for this initiative?",
      extract: ['objective', 'strategic_alignment'],
    },
    {
      prompt: "What's the timeframe and key milestones?",
      extract: ['timeline', 'milestones'],
    },
    {
      prompt: "What resources and constraints are we working with?",
      extract: ['resources', 'constraints'],
    },
    {
      prompt: "Based on this, here's the strategic roadmap I propose...",
      action: 'generate_strategic_plan',
    }
  ]
}
```

### 2. Weekly Status Check-In Flow

```javascript
{
  flow_type: 'status_checkin',
  steps: [
    {
      prompt: "Hey! Let's do a quick check-in. What did you accomplish this week?",
      extract: ['accomplishments'],
    },
    {
      prompt: "Nice! What's still on your plate?",
      extract: ['pending_items'],
    },
    {
      prompt: "Any blockers or challenges?",
      extract: ['blockers'],
      conditional: true, // Only if they mention struggles
    },
    {
      prompt: "Here's your progress:\n\n[PROGRESS: Tasks Completed | X | Y | tasks]\n\nFor next week, I suggest focusing on...",
      action: 'generate_next_week_plan',
    }
  ]
}
```

### 3. Pivot Review Flow

```javascript
{
  flow_type: 'pivot_review',
  steps: [
    {
      prompt: "I hear you're thinking about changing direction. Tell me what's not working.",
      extract: ['current_issues', 'pain_points'],
    },
    {
      prompt: "What have you tried so far?",
      extract: ['attempted_solutions'],
    },
    {
      prompt: "What would success look like if we pivoted?",
      extract: ['new_success_criteria'],
    },
    {
      prompt: "Let me analyze this and suggest some options...",
      action: 'generate_pivot_options',
    },
    {
      prompt: "Here are 3 possible directions:\n\n1. [Option 1]\n2. [Option 2]\n3. [Option 3]\n\nWhich resonates with you?",
      extract: ['chosen_option', 'reasoning'],
    },
    {
      prompt: "Great choice. Here's how we'll transition...",
      action: 'create_pivot_plan',
    }
  ]
}
```

### 4. Blocker Resolution Flow

```javascript
{
  flow_type: 'blocker_resolution',
  steps: [
    {
      prompt: "What exactly is blocking you?",
      extract: ['blocker_description', 'blocker_type'],
    },
    {
      prompt: "Have you tried anything to resolve it?",
      extract: ['attempted_solutions'],
    },
    {
      prompt: "Let me think through some options...",
      action: 'analyze_blocker',
    },
    {
      prompt: "Here are a few approaches:\n\n1. [Solution 1]\n2. [Solution 2]\n3. [Escalation option]\n\nWhich makes most sense?",
      extract: ['chosen_solution'],
    },
    {
      prompt: "Okay, here's the action plan:\n\n[TASK: ...]\n\nLet me know if you need help with this.",
      action: 'create_resolution_tasks',
    }
  ]
}
```

### 5. Sprint Planning Flow

```javascript
{
  flow_type: 'sprint_planning',
  steps: [
    {
      prompt: "Planning time! What's your main focus this sprint?",
      extract: ['sprint_goal'],
    },
    {
      prompt: "How much time can you commit this week?",
      extract: ['available_hours', 'available_days'],
    },
    {
      prompt: "Any known constraints or time off?",
      extract: ['constraints'],
      conditional: true,
    },
    {
      prompt: "Based on your capacity and goals, here's what I suggest:\n\n[TASK: ...]\n[TASK: ...]\n[TASK: ...]\n\nDoes this feel achievable?",
      action: 'generate_sprint_tasks',
      extract: ['commitment_level'],
    },
    {
      prompt: "Perfect! Let's commit to that. I'll check in with you mid-week.",
      action: 'schedule_midweek_checkin',
    }
  ]
}
```

---

## Flow Triggers

### Time-Based Triggers

```javascript
const timeTriggers = [
  {
    flow_type: 'status_checkin',
    schedule: 'weekly', // Every Monday 9am
    condition: 'project_active'
  },
  {
    flow_type: 'sprint_planning',
    schedule: 'weekly', // Every Sunday 6pm
    condition: 'project_active && uses_sprints'
  }
];
```

### Event-Based Triggers

```javascript
const eventTriggers = [
  {
    flow_type: 'pivot_review',
    event: 'task_failure_rate_high', // >50% tasks incomplete for 2 weeks
  },
  {
    flow_type: 'blocker_resolution',
    event: 'keyword_detected', // User says "stuck", "blocked", "can't"
  },
  {
    flow_type: 'milestone_retrospective',
    event: 'milestone_completed',
  }
];
```

### Milestone-Based Triggers

```javascript
const milestoneTriggers = [
  {
    flow_type: 'milestone_retrospective',
    milestone_event: 'completed',
  },
  {
    flow_type: 'pivot_review',
    milestone_event: 'missed_by_2_weeks',
  }
];
```

---

## UI Indicators

### In Chat

When a flow is active, show a subtle indicator:

```jsx
{activeFlow && (
  <div style={{
    background: '#2D2D40',
    padding: '0.75rem',
    borderRadius: '8px',
    margin: '1rem 0',
    borderLeft: '4px solid #5D4B8C'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ color: '#9D8BCC', fontSize: '0.85rem', fontWeight: '600' }}>
          {activeFlow.name}
        </div>
        <div style={{ color: '#888', fontSize: '0.8rem' }}>
          Step {activeFlow.current_step} of {activeFlow.total_steps}
        </div>
      </div>
      <button
        onClick={() => pauseFlow()}
        style={{
          background: 'transparent',
          border: '1px solid #666',
          color: '#aaa',
          padding: '0.4rem 0.75rem',
          borderRadius: '6px',
          fontSize: '0.8rem',
          cursor: 'pointer'
        }}
      >
        Pause Flow
      </button>
    </div>
    <div style={{
      marginTop: '0.5rem',
      height: '4px',
      background: '#1A1A1A',
      borderRadius: '2px',
      overflow: 'hidden'
    }}>
      <div style={{
        width: `${(activeFlow.current_step / activeFlow.total_steps) * 100}%`,
        height: '100%',
        background: '#5D4B8C',
        transition: 'width 0.3s ease'
      }} />
    </div>
  </div>
)}
```

### Resume Prompt

When user has paused flow:

```jsx
{pausedFlow && (
  <div style={{
    background: '#1A1A1A',
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid #5D4B8C',
    marginBottom: '1rem'
  }}>
    <div style={{ color: '#9D8BCC', marginBottom: '0.5rem' }}>
      You have a paused {pausedFlow.name}
    </div>
    <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
      Want to continue where you left off?
    </div>
    <button
      onClick={() => resumeFlow()}
      style={{
        background: '#5D4B8C',
        color: '#fff',
        border: 'none',
        padding: '0.5rem 1rem',
        borderRadius: '6px',
        cursor: 'pointer',
        marginRight: '0.5rem'
      }}
    >
      Resume
    </button>
    <button
      onClick={() => abandonFlow()}
      style={{
        background: 'transparent',
        border: '1px solid #666',
        color: '#aaa',
        padding: '0.5rem 1rem',
        borderRadius: '6px',
        cursor: 'pointer'
      }}
    >
      Abandon
    </button>
  </div>
)}
```

---

## Benefits

### For Users
- ✅ **Structured Guidance** at critical moments (onboarding, stuck, planning)
- ✅ **Conversational** - doesn't feel like filling out forms
- ✅ **Progressive** - one question at a time, not overwhelming
- ✅ **Flexible** - can pause and resume anytime

### For AI Personas
- ✅ **Consistent Process** - ensures key questions are asked
- ✅ **Data Collection** - gathers information systematically
- ✅ **Context Building** - feeds into memory tiers
- ✅ **Personalized** - different flows per archetype

### For System
- ✅ **Structured Data** - collects clean, parseable information
- ✅ **Better Memory** - feeds Tier 2 and Tier 3 with quality data
- ✅ **Trigger Points** - knows when to intervene proactively
- ✅ **Completion Tracking** - can measure flow success rates

---

## Implementation Priority

### Phase 1 (This Week)
1. 🔨 Database schema for flows
2. 🔨 GuidedFlowService basic implementation
3. 🔨 Project Onboarding flow template (Coach archetype)
4. 🔨 Integration with ConversationService
5. 🔨 UI indicator for active flows

### Phase 2 (Next Week)
6. Status Check-In flow
7. Blocker Resolution flow
8. Flow pause/resume functionality
9. Time-based triggers (weekly check-ins)

### Phase 3 (Later)
10. Pivot Review flow
11. Sprint Planning flow
12. Milestone Retrospective flow
13. Event-based triggers
14. Flow analytics and optimization

---

## Example: Full Onboarding Flow

**User creates project: "Get fit"**

**AI (Coach):**
> "Hey! I'm excited to be your health coach. Let's get to know each other. First question: what's your main fitness goal?"

**User:**
> "I want to lose 20 pounds and feel more energetic"

**AI:**
> "Love it! So success for you means losing 20 lbs AND having more energy - not just the number on the scale. What timeline are you thinking?"

**User:**
> "I'd like to hit this by March, so about 4 months"

**AI:**
> "That's a healthy pace - about 1.5 lbs per week. Now, what do you think might get in your way?"

**User:**
> "My work schedule is crazy and I tend to stress eat"

**AI:**
> "Okay, so we need to work WITH your schedule, not against it. And we'll definitely address stress management.
>
> Based on what you've shared, here's how I suggest we start:
>
> [MILESTONE: Lose first 5 lbs | Build initial momentum | date:2025-01-15]
>
> [TASK: Track food for 3 days | Use MyFitnessPal, just observe patterns | context:@home | energy:low | time:10]
>
> [TASK: Find 3 time slots for walks | 15-20 min windows in your schedule | context:@anywhere | energy:low | time:15]
>
> We'll start small and build from there. How does that feel?"

**User:**
> "That seems doable!"

**AI:**
> "Perfect! Let's do this. I'll check in with you in 3 days to see how the food tracking is going. Any questions before we get started?"

*[Flow Complete - Data stored in Tier 2 memory: goal, timeline, constraints, initial_tasks]*

---

This guided flows system gives structure to critical moments while keeping the experience conversational and persona-driven!
