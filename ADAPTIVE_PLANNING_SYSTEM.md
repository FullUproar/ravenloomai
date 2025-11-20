# Adaptive Planning System

## Overview

The Adaptive Planning System transforms the first interaction with a new project into a personalized, psychology-informed planning experience. Instead of a one-size-fits-all approach, the AI detects the user's personality, interaction style, and current needs, then adapts its guidance accordingly.

This system is grounded in established psychology research including:
- **Self-Determination Theory** (Autonomy vs Support needs)
- **Big Five Personality Traits** (OCEAN model)
- **Maslow's Hierarchy of Needs** (Motivation levels)
- **Growth vs Fixed Mindset** (Carol Dweck's research)

## Why This Matters

**The Problem:**
Most productivity tools treat all users the same. A confident, experienced project manager gets the same onboarding as someone feeling overwhelmed by their first big goal. This creates friction and reduces value.

**Our Solution:**
RavenLoom detects the user's style from their very first message and adapts the conversation to match their needs. Some users want to dive right in; others need gentle guidance. Some want detailed structure; others prefer flexibility. We meet each user where they are.

**Business Impact:**
- **Higher activation rates**: Users feel understood immediately
- **Better retention**: Personalized experience creates emotional connection
- **Stronger word-of-mouth**: "It gets me" moments drive recommendations
- **Differentiation**: Competitors don't do this level of personalization

## Architecture

```
┌─────────────────────────────┐
│   User's First Message      │
│  "I want to build a SaaS"   │
└──────────┬──────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  ConversationService         │
│  - Detects planning mode     │
│  - Checks: new project?      │
│  - Checks: planning message? │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  UserStyleDetector           │
│  - Analyzes message text     │
│  - Detects personality       │
│  - Applies psychology models │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐        ┌───────────────────────┐
│  Suggested Planning Pathway  │───────▶│  MediumTermMemory     │
│  - Quick Start               │        │  Stores detected style│
│  - Guided Exploration        │        └───────────────────────┘
│  - Strategic Deep Dive       │
│  - Adaptive Framework        │
│  - Balanced                  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  PersonaPromptBuilder        │
│  - Injects adaptive guidance │
│  - AI uses psychology models │
│  - Responds appropriately    │
└──────────────────────────────┘
```

## Psychology Models Applied

### 1. Self-Determination Theory (Deci & Ryan)

**Core Concept:** People have varying needs for autonomy, competence, and relatedness.

**How We Use It:**

**HIGH AUTONOMY users** (signals: "I want to", "My plan is", "I'm going to"):
- Value independence and control
- Want to feel ownership over their plans
- Prefer supportive partnership, not directive guidance

**Response Strategy:**
> "Got it - you want to [goal]. Want to jump right in, or spend 60 seconds mapping key milestones first? Your call."

**LOW AUTONOMY users** (signals: "I don't know", "Help me", "Confused"):
- Value structure and clear guidance
- Want someone to help navigate complexity
- Prefer collaborative planning with expert input

**Response Strategy:**
> "Let's figure this out together. Why is [goal] important to you? What would success look like?"

### 2. Big Five Personality Traits (OCEAN)

**Core Concept:** Five broad dimensions of personality predict behavior and preferences.

#### Conscientiousness (Structured vs Flexible)

**HIGH CONSCIENTIOUSNESS** (signals: "systematic", "organized", "steps", specific timelines):
- Want detailed plans with clear milestones
- Prefer predictability and structure
- Value thoroughness

**Response Strategy:**
> "Great! Let's build a solid plan. To help structure this, what's your timeline? And are there any major milestones you already see?"

**LOW CONSCIENTIOUSNESS** (signals: "flexible", "go with the flow", "let's see"):
- Prefer adaptive, evolving plans
- Value flexibility over rigid structure
- Comfortable with ambiguity

**Response Strategy:**
> "I like it! We can start with a light framework and adjust as we go. What feels like the natural first step to you?"

#### Openness (Big Picture vs Concrete)

**HIGH OPENNESS** (signals: asks about alternatives, explores options, "what if"):
- Want to discuss approaches and strategies
- Value creativity and novel solutions
- Prefer understanding the "why" before "how"

**Response Strategy:** Discuss multiple approaches, ask strategic questions

**LOW OPENNESS** (signals: wants direct action, "just tell me"):
- Want clear, specific next steps
- Value concrete action over exploration
- Prefer "how" over "why"

**Response Strategy:** Provide direct guidance and specific action items

### 3. Maslow's Hierarchy of Needs

**Core Concept:** Human motivation operates at different levels depending on current needs.

**SELF-ACTUALIZATION** (signals: "meaningful", "purpose", "impact", "legacy"):
- Motivated by growth, meaning, creativity
- Want to connect work to deeper values

**Response Strategy:**
> "Why does this matter to you? What impact are you hoping to create?"

**ESTEEM** (signals: "succeed", "prove", "accomplish", "achieve"):
- Motivated by achievement and recognition
- Want to feel competent and successful

**Response Strategy:**
> "This is a solid challenge. Let's map out the milestones so you can track your wins along the way."

**SAFETY** (signals: "risky", "secure", "stable", "worried about"):
- Motivated by security and predictability
- Want to mitigate risk and uncertainty

**Response Strategy:**
> "Let's build a clear plan to reduce uncertainty. What are your biggest concerns we should address?"

### 4. Growth vs Fixed Mindset (Carol Dweck)

**Core Concept:** People vary in their beliefs about ability and learning.

**GROWTH MINDSET** (signals: "I'll learn", "challenge", "improve", "develop"):
- See challenges as opportunities
- Value learning and experimentation
- Resilient to setbacks

**Response Strategy:**
> "Great mindset! This will be a learning journey. What skills do you want to develop along the way?"

**FIXED MINDSET** (signals: "I can't", "not good at", "always struggle"):
- See abilities as static
- Fear failure and judgment
- Need confidence building

**Response Strategy:**
> "Let's start small and build momentum. What's one tiny step you feel confident about?"

## Planning Pathways

Based on detected user style, the system suggests one of five pathways:

### 1. Quick Start
**When:** High autonomy + High confidence + Execution mode

**Characteristics:**
- User knows what they want
- Ready to take action
- Values speed over planning

**Example User Messages:**
- "I'm going to build a SaaS app for project management"
- "I want to launch my product in 3 months"
- "Time to finally start that side project"

**AI Response Style:**
- Acknowledge their goal clearly
- Offer choice: dive in OR quick milestone check
- Don't slow them down with excessive questions
- Support their plan, don't restructure it

### 2. Guided Exploration
**When:** Low autonomy + High uncertainty + Exploration mode

**Characteristics:**
- User is figuring things out
- Needs help clarifying goals
- Values collaborative thinking

**Example User Messages:**
- "I'm thinking about maybe starting a blog but not sure where to begin"
- "I want to do something meaningful but I don't know what"
- "Help me figure out what to focus on"

**AI Response Style:**
- Ask clarifying questions about "why"
- Help them explore options
- Build confidence incrementally
- Co-create the plan together

### 3. Strategic Deep Dive
**When:** High conscientiousness + Detail-oriented + Analytical

**Characteristics:**
- User wants comprehensive planning
- Values thoroughness and structure
- Thinks systematically

**Example User Messages:**
- "I need to organize a team offsite event next month with 20 people. I want to make sure everything is planned out systematically"
- "Help me build a detailed roadmap for launching my business"
- "I want to create a structured approach to learning Python"

**AI Response Style:**
- Provide detailed frameworks
- Ask about timelines, milestones, dependencies
- Break down into comprehensive components
- Offer systematic planning tools

### 4. Adaptive Framework
**When:** Moderate autonomy + Flexible + Moderate detail

**Characteristics:**
- User wants some structure but not rigidity
- Values adaptability
- Comfortable with iteration

**Example User Messages:**
- "I want to get better at writing but I'm flexible on approach"
- "Let's start something and see where it goes"
- "I have an idea but I'm open to evolving it"

**AI Response Style:**
- Light structure with room for evolution
- "Start here, adjust as we learn" approach
- Incremental planning
- Emphasize flexibility

### 5. Balanced (Default)
**When:** Mixed signals or unclear style

**Characteristics:**
- User shows mixed preferences
- Hard to categorize cleanly

**AI Response Style:**
- Offer choices explicitly
- "Do you want A or B?"
- Let them self-select their preference
- Adapt based on their choice

## Implementation Details

### 1. Planning Mode Detection

**ConversationService.js** detects planning mode when:
- `messageCount <= 10` (new project)
- `taskCount <= 3` (minimal activity)
- `goalCount <= 2` (minimal goals)
- User message matches planning patterns: "I want to", "I'm thinking about", "help me", etc.

### 2. User Style Analysis

**UserStyleDetector.js** analyzes the user's message for:

```javascript
{
  // Primary dimensions
  guidancePreference: 'push' | 'pull' | 'balanced',
  planningStyle: 'structured' | 'fluid' | 'balanced',
  detailLevel: 'detail' | 'summary' | 'balanced',
  currentMode: 'exploration' | 'execution' | 'mixed',
  decisionStyle: 'emotional' | 'analytical' | 'balanced',

  // Personality (Big Five approximation)
  personalityTraits: {
    conscientiousness: 'high' | 'low' | 'moderate',
    openness: 'high' | 'low' | 'moderate',
    // ...
  },

  // Motivation (Maslow)
  motivationLevel: 'self_actualization' | 'esteem' | 'belonging' | 'safety' | 'physiological',

  // Confidence (Dweck)
  confidenceLevel: 'growth' | 'fixed' | 'moderate',

  // Meta
  energyLevel: 'high' | 'low' | 'moderate',
  uncertainty: 'high' | 'low' | 'moderate'
}
```

### 3. Pathway Suggestion

**UserStyleDetector.suggestPlanningPathway()** returns:

```javascript
{
  pathway: 'quick_start' | 'guided_exploration' | 'strategic_deep_dive' | 'adaptive_framework' | 'balanced',
  confidence: 0.0 - 1.0,
  reasoning: 'Explanation of why this pathway was chosen'
}
```

### 4. Memory Persistence

Detected user style is saved to **MediumTermMemory** as:

```javascript
{
  type: 'user_style',
  value: {
    detectedAt: '2025-01-20T...',
    userMessage: 'Original message that triggered detection',
    detectedStyle: { /* full UserStyleDetector output */ },
    suggestedPathway: 'quick_start',
    confidence: 0.85
  }
}
```

This allows the AI to reference the user's style in future conversations.

### 5. System Prompt Integration

**PersonaPromptBuilder.js** includes detailed guidance for the AI on:
- How to detect user style signals
- When to use each psychology model
- What response patterns to use for each pathway
- Examples of good vs bad responses

The AI doesn't need explicit instructions on what pathway to follow - it reads the system prompt and adapts naturally based on the user's message.

## Testing Strategy

### Manual Testing

Create new projects and send different first messages to test each pathway:

**Quick Start:**
```
"I'm going to build a Chrome extension for tracking time"
```

**Guided Exploration:**
```
"I'm thinking about maybe starting a side project but I'm not sure what or if I even have time"
```

**Strategic Deep Dive:**
```
"I need to plan a comprehensive content marketing strategy for Q1. I want to map out topics, publishing schedule, and promotion tactics systematically."
```

**Adaptive Framework:**
```
"I want to get better at public speaking. Not sure the best approach but open to experimenting."
```

**Growth Mindset:**
```
"I want to learn machine learning even though I'm not great at math. I'm willing to put in the work to improve."
```

**Fixed Mindset:**
```
"I need to do more networking but I'm terrible at small talk and always have been."
```

### Automated Testing

Create Playwright tests that:
1. Create new projects
2. Send various first messages
3. Verify AI detects style correctly (check logs)
4. Verify AI response matches expected pathway
5. Verify user style is saved to medium-term memory

## Monitoring & Analytics

Track in production:
- **Detection accuracy**: How often does detected pathway match user satisfaction?
- **Pathway distribution**: Which pathways are most common?
- **Conversion by pathway**: Do certain pathways lead to higher activation?
- **User feedback**: Add subtle feedback mechanism: "Was this helpful?" after planning

## Future Enhancements

### Phase 1 (Current)
- ✅ Psychology-based user style detection
- ✅ Pathway suggestion
- ✅ System prompt with adaptive guidance
- ✅ Memory persistence

### Phase 2 (Next)
- 🔄 **Explicit pathway confirmation**: "You seem ready to dive in. Want to jump right in, or would you prefer to map things out first?"
- 🔄 **Visual planning interfaces**: Different UI flows for different pathways
- 🔄 **Machine learning refinement**: Learn from user behavior to improve detection

### Phase 3 (Future)
- 🔮 **Multi-session planning**: Continue planning flow across multiple messages
- 🔮 **Planning templates**: Pre-built templates for common project types
- 🔮 **Collaborative planning**: Share planning process with accountability partners
- 🔮 **Progress-based adaptation**: Adjust style as user gains confidence

## Research References

1. **Self-Determination Theory**
   - Deci, E. L., & Ryan, R. M. (2000). "The 'what' and 'why' of goal pursuits: Human needs and the self-determination of behavior." *Psychological Inquiry, 11*(4), 227-268.

2. **Big Five Personality Traits**
   - McCrae, R. R., & Costa, P. T. (1987). "Validation of the five-factor model of personality across instruments and observers." *Journal of Personality and Social Psychology, 52*(1), 81-90.

3. **Maslow's Hierarchy of Needs**
   - Maslow, A. H. (1943). "A theory of human motivation." *Psychological Review, 50*(4), 370-396.

4. **Growth Mindset**
   - Dweck, C. S. (2006). *Mindset: The new psychology of success.* New York: Random House.

5. **Implementation Intentions**
   - Gollwitzer, P. M. (1999). "Implementation intentions: Strong effects of simple plans." *American Psychologist, 54*(7), 493-503.

## Support

For questions or issues:
- Review logs for planning mode detection: `grep "PLANNING MODE DETECTED" logs/backend.log`
- Check medium-term memory: Query for `type = 'user_style'`
- Verify system prompt: Read `PersonaPromptBuilder.js` base prompt

**Key Files:**
- `backend/services/UserStyleDetector.js` - Psychology-based detection
- `backend/services/AdaptivePlanningService.js` - Pathway logic
- `backend/services/PersonaPromptBuilder.js` - System prompt with guidance
- `backend/services/ConversationService.js` - Integration point
- `ADAPTIVE_PLANNING_SYSTEM.md` - This documentation
