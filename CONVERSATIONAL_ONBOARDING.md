# Conversational Onboarding System

## Overview

The Conversational Onboarding System eliminates form friction by letting users start chatting with the AI immediately after stating their goal. Instead of filling out forms, the AI guides them through setup conversationally, making the experience feel natural and engaging.

## The Problem (Before)

**Old Flow:**
1. User clicks "New Project"
2. Presented with a form (title, description, persona type, specialization, etc.)
3. User fills out 5+ fields
4. FINALLY gets to chat with AI
5. High friction, feels like work

**Why This Sucked:**
- Form friction kills activation
- Users don't know what to put in "description" yet
- Persona/specialization choices are abstract
- Delayed gratification - they want to START, not fill forms

## The Solution (Now)

**New Flow:**
1. User clicks "New Project"
2. Simple input: "What do you want to accomplish?"
3. User types: "I want to lose 20 lbs"
4. **IMMEDIATELY** in conversation with AI
5. AI guides them through setup naturally
6. Zero friction, feels like talking to a coach

**Why This Rocks:**
- Instant engagement
- No cognitive load ("What persona do I want?" → "How do you want me to be?" is easier)
- Natural conversation flow
- Creates "wow" moment immediately
- Higher activation rates

## How It Works

### 1. User States Their Goal

User creates a new project by typing their goal:
- "I want to lose 20 lbs"
- "I need to launch my SaaS product"
- "I'm trying to save $10,000"
- "Help me learn Python"

### 2. Project Created with Minimal Data

Backend creates project with just:
- `title`: The user's goal statement
- `user_id`: Current user
- `status`: 'active'
- `onboarding_state`: `{ "stage": "introduction", "domain": "detected_domain" }`

A default persona is assigned temporarily (neutral onboarding guide).

### 3. AI Starts Onboarding Conversation

The AI detects onboarding mode by checking:
- Message count < 3
- No custom persona configured yet
- User's message states a goal

The AI then follows a 7-stage conversational script.

## The 7-Stage Onboarding Flow

### Stage 1: Introduction & Persona Selection

**AI Says:**
> "Hi! I'm RavenLoom and I'm here to help you achieve your goal of [goal].
>
> [Domain-specific disclaimer if needed]
>
> To start, let's talk about how you'd like to work with me. I can adapt my personality to match your preferences - I can be supportive, direct, motivational, analytical, or anything else you need. How would you like me to respond to you? Try thinking of a single adjective that best describes how you want me to be."

**User Responds:**
- "Supportive"
- "Direct"
- "Motivational"
- "Professional"
- Any adjective

**AI Detects:** Personality preference and maps to persona archetype

### Stage 2: Explain Customization Options

**AI Says:**
> "Awesome, I can definitely do that and together we can achieve this goal!
>
> Next, I want to let you know some things you can configure about me. You can change these anytime by just telling me here in the chat:
> - **Verbosity**: I can be very chatty or straight and to the point
> - **Tone**: From supportive (with encouraging language) to direct (just the facts)
>
> For [goal type] goals, most users prefer [suggested defaults]. How does that sound?"

**User Responds:**
- "That sounds good"
- "I'd prefer more concise responses"
- "Actually, I want you to be more detailed"

**AI Updates:** Communication preferences based on response

### Stage 3: Define Success Criteria

**AI Says:**
> "Perfect! Now that we've got that out of the way, let's make a good plan for how you achieve your goal.
>
> The first thing we need to decide is: what does success look like? [AI suggests specific success criteria based on goal]
>
> Should we set that as our primary target?"

**Examples by Domain:**
- **Weight Loss**: "It sounds like you want to weigh [target weight] by [suggested date]. Should we set that as our target?"
- **Business**: "So success would be launching your product and getting your first 100 users?"
- **Financial**: "Your target is to save $10,000 by [date]?"

**User Responds:**
- Confirms
- Adjusts timeline or target
- Adds details

### Stage 4: Gather Current State

**AI Asks domain-specific questions:**

**Health/Fitness:**
> "Can you tell me your current weight/fitness level? Remember, this is a no-judgment zone and I won't share this with anyone."

**Business:**
> "Where are you in the process? Idea stage, building, or already launched?"

**Financial:**
> "How much have you saved so far toward this goal?"

**Learning:**
> "What's your current level? Complete beginner, some experience, or intermediate?"

**User Responds:** Provides current state information

### Stage 5: Calculate Realistic Path

**AI Calculates and suggests:**

**Weight Loss Example:**
> "So it sounds like our primary target is 330 lbs by June 22. That's 30 weeks away, so what do you think about trying to set a 1lb per week goal? That would give us some wiggle room in case some weeks don't go as well as others. What do you think?"

**Business Example:**
> "So you want to launch in 3 months. That gives us about 12 weeks. Typical SaaS launch involves: MVP development (6-8 weeks), beta testing (2 weeks), and launch prep (2 weeks). Does that timeline feel realistic?"

**User Responds:**
- Agrees
- Adjusts timeline
- Asks questions

### Stage 6: Identify Blockers

**AI Asks:**
> "That's a great question - that leads me to the next important thing we need to know. What's currently blocking you? If you had to guess, what's the biggest thing standing in your way of [achieving goal] right now?"

**User Responds:**
- "I don't have time to exercise"
- "I don't know how to code"
- "I keep spending money on unnecessary things"
- "I get distracted easily"

**AI Acknowledges:** Validates the blocker and suggests approach

### Stage 7: Begin Planning

**AI Says:**
> "Thanks for sharing that. [Acknowledges blocker]. Let's break this down into manageable steps. [Creates initial goals/tasks]"

**AI Creates:**
- Primary goal (numeric target or milestone-based)
- 2-3 initial tasks to get started
- Suggests work session to begin

**Onboarding Complete!**

User is now in normal operation mode with:
- Configured persona matching their preference
- Communication style set
- Clear success criteria
- Initial goals and tasks
- Understanding of blockers

## Domain-Specific Adaptations

### Health & Fitness

**Detection**: Keywords like "lose weight", "fitness", "exercise", "diet", "lbs", "kg"

**Disclaimer (ALWAYS INCLUDE):**
> "Important: I'm here to help you stay on track with your goals, but I'm not a medical professional. Always consult with a doctor before starting any new diet or exercise program."

**Guardrails:**
- Maximum healthy weight loss: 2 lbs/week
- If user suggests >2 lbs/week, redirect: "That's pretty aggressive. Most health professionals recommend 1-2 lbs/week for sustainable, healthy weight loss."
- Don't give specific diet or exercise advice - focus on tracking and accountability

### Financial

**Detection**: Keywords like "save money", "budget", "invest", "debt", "dollars", "financial"

**Disclaimer (ALWAYS INCLUDE):**
> "I can help you track your financial goals, but I'm not a financial advisor. For investment advice, please consult with a licensed financial professional."

**Guardrails:**
- Don't provide investment recommendations
- Focus on saving habits and tracking

### Business & Entrepreneurship

**Detection**: Keywords like "start a business", "launch", "startup", "saas", "product", "customers"

**No Disclaimers Needed**

**Specializations Suggested:**
- Business strategist
- Product manager
- Startup advisor

### Creative & Technical

**Detection**: Keywords like "write", "code", "build", "create", "app", "game", "website", "book"

**No Disclaimers Needed**

**Specializations Suggested:**
- Project manager
- Technical advisor
- Creative coach

### Learning & Education

**Detection**: Keywords like "learn", "study", "master", "course", "skill", "language"

**No Disclaimers Needed**

**Success Metric**: Habit formation (practice X hours/week)

### Personal Development

**Detection**: Keywords like "better person", "improve myself", "confidence", "meditation", "relationships"

**No Disclaimers Needed**

**Success Metric**: Habit formation or milestone-based

## Returning Users

If the user has created projects before, the AI checks their previous persona preferences and offers to reuse them:

> "I notice in your other projects you tend to prefer a supportive and concise approach. Would you like me to use the same style here, or try something different?"

**Benefits:**
- Faster onboarding for returning users
- Consistency across projects if desired
- Still offers flexibility

**Implementation:**
- Query database for user's previous personas
- Identify most common archetype and communication preferences
- Suggest in Stage 2

## Database Schema

### Projects Table

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS onboarding_state JSONB DEFAULT NULL;
```

**Onboarding State Structure:**
```json
{
  "stage": "persona_selection" | "customization_preferences" | "success_criteria" | "current_state_gathering" | "blocker_identification" | "planning_begins" | "onboarding_complete",
  "domain": "health_fitness" | "business_entrepreneurship" | "financial" | "creative_technical" | "learning_education" | "personal_development" | "general",
  "collected": {
    "personaPreference": "supportive",
    "verbosity": "balanced",
    "currentWeight": 350,
    "targetWeight": 330,
    "targetDate": "2025-06-22",
    "blocker": "Don't have time to exercise"
  },
  "userIsReturning": false,
  "previousPreferences": {
    "archetype": "accountability_partner",
    "tone": "supportive"
  }
}
```

## Frontend Changes Needed

### Current Project Creation Flow (TO BE REMOVED)
- Multi-field form with title, description, persona dropdown, etc.

### New Project Creation Flow (TO BE BUILT)

**1. New Project Button**
```jsx
<button onClick={handleNewProject}>+ New Project</button>
```

**2. Simple Input Modal**
```jsx
<Modal>
  <h2>What do you want to accomplish?</h2>
  <textarea
    placeholder="Example: I want to lose 20 lbs, or I need to launch my SaaS product, or I'm trying to save $10,000..."
    value={goalInput}
    onChange={(e) => setGoalInput(e.target.value)}
  />
  <button onClick={createProjectAndStartChat}>Start</button>
</Modal>
```

**3. Create Project API Call**
```javascript
const createProjectAndStartChat = async () => {
  // Create project with minimal data
  const project = await createProject({
    title: goalInput, // User's goal statement
    onboarding_state: {
      stage: "introduction",
      domain: detectDomain(goalInput) // Client-side domain detection
    }
  });

  // Navigate immediately to chat view
  navigate(`/project/${project.id}/chat`);

  // Send user's goal as first message
  await sendMessage(project.id, goalInput);
};
```

**4. AI Response Triggers Onboarding**
The AI detects it's in onboarding mode and starts the conversation script.

## Testing the Onboarding Flow

### Manual Testing

Test each domain:

**1. Health & Fitness**
```
Input: "I want to lose 20 lbs"
Expected: Medical disclaimer + persona selection prompt
```

**2. Business**
```
Input: "I want to launch a SaaS product"
Expected: No disclaimer + persona selection with business-focused options
```

**3. Financial**
```
Input: "I need to save $10,000 for a down payment"
Expected: Financial disclaimer + persona selection
```

**4. Learning**
```
Input: "I want to learn Python programming"
Expected: No disclaimer + habit formation suggestions
```

**5. Personal Development**
```
Input: "I want to be more confident in social situations"
Expected: Empathetic tone + habit/milestone hybrid approach
```

### Automated Testing (To Be Built)

Create Playwright tests for:
- Each domain's onboarding flow
- Disclaimer verification for health/financial domains
- Persona preference mapping
- Success criteria collection
- Blocker identification
- Goal/task creation

## Benefits

### For Users

1. **Zero friction**: No forms to fill out
2. **Instant gratification**: Start conversing immediately
3. **Natural interaction**: Feels like talking to a coach, not filling a database
4. **Personalized**: AI adapts to their style from the start
5. **Educational**: Learn what's possible as they go

### For Business

1. **Higher activation**: More users complete setup
2. **Better data quality**: AI extracts better information through conversation than users fill in forms
3. **Stronger engagement**: Conversation creates connection
4. **Lower drop-off**: No opportunity to abandon during lengthy form
5. **Competitive differentiation**: Nobody else does onboarding like this

## Implementation Checklist

**Backend:**
- [x] Add `onboarding_state` column to projects table
- [x] Add conversational onboarding script to PersonaPromptBuilder
- [ ] Add domain detection to ConversationService
- [ ] Create persona from user's adjective preference
- [ ] Save onboarding state as conversation progresses

**Frontend:**
- [ ] Remove current project creation form
- [ ] Build simple "What do you want to accomplish?" input
- [ ] Create project with minimal data (just title)
- [ ] Navigate immediately to chat view
- [ ] Send user's goal as first message

**Testing:**
- [ ] Manual testing for each domain
- [ ] Playwright tests for onboarding flows
- [ ] Verify disclaimers appear correctly
- [ ] Test returning user preference reuse

## Future Enhancements

- **Voice input**: "I want to..." via speech recognition
- **Suggested goals**: "Popular goals: Lose weight, Save money, Learn a skill..."
- **Visual progress**: Show onboarding stages (1 of 7) with progress bar
- **Onboarding analytics**: Track drop-off at each stage
- **A/B testing**: Test different conversation styles

## Support

For questions or issues:
- Review onboarding script in `PersonaPromptBuilder.js`
- Check project's `onboarding_state` JSON column
- Monitor conversation flow in chat logs

**Key Files:**
- `backend/services/PersonaPromptBuilder.js` - Conversation script (lines 169-295)
- `backend/migrations/add_onboarding_state.sql` - Database schema
- `CONVERSATIONAL_ONBOARDING.md` - This documentation
