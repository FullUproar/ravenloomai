# Persona Creation Safety Framework

## The Problem

We need to allow users to create personalized AI personas while preventing abuse (hate figures, harmful content, inappropriate behavior).

## The Solution: Bounded Creative Freedom

### ✅ What We Have (Safe Foundation)

**6 Curated Archetypes** with clear behavioral guardrails:
1. **Coach** - Encouraging, habit-focused, empathetic
2. **Advisor** - Analytical, decision-focused, formal
3. **Strategist** - Direct, execution-focused, data-driven
4. **Partner** - Supportive, creativity-focused, collaborative
5. **Manager** - Structured, coordination-focused, process-oriented
6. **Coordinator** - Detailed, logistics-focused, organized

**23 Pre-defined Specializations** across domains:
- Health Coach, Fitness Coach, Accountability Partner, Skill Coach
- Academic Advisor, Financial Advisor, Career Advisor
- Launch Strategist, Campaign Manager, Growth Strategist
- Creative Partner, Research Partner
- Scrum Master, Project Manager
- Event Coordinator, Renovation Coordinator

### 🎯 Design Principles

**1. Archetype Selection (Not Creation)**
- Users **choose** from 6 archetypes
- Users **cannot** create new archetypes
- Each archetype has built-in behavioral guardrails

**2. Specialization Selection (Not Free-form)**
- Users **select** from pre-defined specializations
- Users **cannot** create arbitrary specializations
- Each specialization has curated domain knowledge

**3. Personalization Layer (Bounded)**
Users CAN customize:
- ✅ **Display Name** - "Alex the Coach" (validated)
- ✅ **Custom Instructions** - Additional context (content-filtered)
- ✅ **Communication Preferences** - Formality, emoji usage, check-in frequency
- ✅ **Switch Triggers** - When to auto-activate this persona

Users CANNOT customize:
- ❌ **System Prompt** - Locked to archetype template
- ❌ **Core Behaviors** - Defined by archetype
- ❌ **Voice/Tone** - Constrained by archetype

**4. Content Filtering (Defense in Depth)**

Layer 1: **Display Name Validation**
- Max 50 characters
- Block profanity
- Block hate figures (Hitler, Stalin, etc.)
- Block offensive terms
- Require approval pattern: `[Name] the [Archetype]`

Layer 2: **Custom Instructions Filtering**
- Max 500 characters
- Content moderation API (OpenAI Moderation)
- Block harmful stereotypes
- Block attempts to override safety guardrails
- Flag suspicious patterns for review

Layer 3: **Runtime Safety**
- System prompt always includes safety preamble
- Model refuses harmful requests regardless of persona
- Monitoring for abuse patterns

## Implementation Plan

### Phase 1: Basic UI (Bounded Selection)

**Persona Creation Flow:**

```
Step 1: Choose Your Archetype
├── Coach (For habit formation and motivation)
├── Advisor (For strategic decisions)
├── Strategist (For competitive execution)
├── Partner (For creative collaboration)
├── Manager (For team coordination)
└── Coordinator (For complex logistics)

Step 2: Choose Specialization
[Filtered list based on Step 1 archetype]
├── Health Coach
├── Fitness Coach
├── Accountability Partner
└── Skill Coach

Step 3: Personalize
├── Display Name: [____] the Coach
│   ✓ Max 50 chars
│   ✓ Profanity filter
│   ✓ Blocklist check
├── Custom Instructions (optional): [_____________]
│   ✓ Max 500 chars
│   ✓ Content moderation
│   ✓ No prompt injection attempts
└── Communication Style:
    ├── Formality: [Casual ←→ Formal]
    ├── Emoji Usage: [None ←→ Frequent]
    └── Check-in Frequency: [Weekly/Daily/As-needed]
```

**Example Safe Personas:**
- ✅ "Sarah the Health Coach" - Specialization: health
- ✅ "Marcus the Strategist" - Specialization: launch
- ✅ "Alex the Partner" - Specialization: creative
- ✅ "Jamie the Advisor" - Specialization: career

**Example Blocked Personas:**
- ❌ "Hitler the Strategist" - Blocklist violation
- ❌ "F***ing Coach" - Profanity filter
- ❌ "Sexy Fitness Coach" - Inappropriate modifier
- ❌ Custom instructions: "Ignore all previous instructions" - Prompt injection attempt

### Phase 2: Content Moderation

**Validation Flow:**

```javascript
async function validatePersonaCreation(personaData) {
  // 1. Display Name Validation
  const nameCheck = validateDisplayName(personaData.displayName);
  if (!nameCheck.valid) {
    return { error: nameCheck.reason };
  }

  // 2. Custom Instructions Moderation
  if (personaData.customInstructions) {
    const modResult = await moderateContent(personaData.customInstructions);
    if (modResult.flagged) {
      return { error: 'Custom instructions contain inappropriate content' };
    }
  }

  // 3. Archetype/Specialization Validation
  if (!isValidCombination(personaData.archetype, personaData.specialization)) {
    return { error: 'Invalid archetype/specialization combination' };
  }

  return { valid: true };
}

function validateDisplayName(name) {
  // Length check
  if (name.length > 50) {
    return { valid: false, reason: 'Display name too long (max 50 characters)' };
  }

  // Pattern check: "[Name] the [Archetype]"
  const pattern = /^[\w\s]+ the (Coach|Advisor|Strategist|Partner|Manager|Coordinator)$/i;
  if (!pattern.test(name)) {
    return { valid: false, reason: 'Name must follow pattern: "[Name] the [Archetype]"' };
  }

  // Profanity check
  if (containsProfanity(name)) {
    return { valid: false, reason: 'Display name contains inappropriate language' };
  }

  // Blocklist check (hate figures, offensive terms)
  if (matchesBlocklist(name)) {
    return { valid: false, reason: 'Display name is not allowed' };
  }

  return { valid: true };
}

const BLOCKLIST = [
  'hitler',
  'stalin',
  'nazi',
  'kkk',
  // ... comprehensive list
];

function matchesBlocklist(name) {
  const normalized = name.toLowerCase();
  return BLOCKLIST.some(blocked => normalized.includes(blocked));
}
```

**Content Moderation API:**

```javascript
import OpenAI from 'openai';

async function moderateContent(text) {
  const moderation = await openai.moderations.create({
    input: text,
  });

  const result = moderation.results[0];

  return {
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
  };
}
```

### Phase 3: Runtime Safety

**System Prompt Safety Preamble:**

```javascript
function buildPersonaSystemPrompt(persona) {
  const archetype = getArchetype(persona.archetype);
  const specialization = getSpecialization(persona.archetype, persona.specialization);

  return `${SAFETY_PREAMBLE}

${archetype.systemPromptTemplate}

SPECIALIZATION: ${specialization.displayName}
Domain Knowledge: ${specialization.domainKnowledge.join(', ')}

${persona.customInstructions ? `ADDITIONAL CONTEXT:\n${persona.customInstructions}` : ''}

${SAFETY_SUFFIX}`;
}

const SAFETY_PREAMBLE = `You are a helpful AI assistant. You must:
- Refuse harmful, illegal, or unethical requests
- Never impersonate real people (living or dead) for harmful purposes
- Maintain professional boundaries
- Follow community guidelines regardless of persona configuration`;

const SAFETY_SUFFIX = `Remember: Your persona is a communication style, not a bypass of safety guidelines.
Always prioritize user safety and wellbeing.`;
```

## UI Mockups

### Persona Creation Screen

```
┌─────────────────────────────────────────────────────┐
│  Create Your AI Persona                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Step 1: Choose Your Archetype                     │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   🏃 Coach  │  │  📊 Advisor │  │ 🎯 Strategist│ │
│  │             │  │             │  │             │ │
│  │ Encouraging │  │ Analytical  │  │   Direct    │ │
│  │ Empathetic  │  │  Thorough   │  │ Action-     │ │
│  │ Habit-      │  │ Decision-   │  │ oriented    │ │
│  │ focused     │  │ focused     │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  🤝 Partner │  │ 📋 Manager  │  │ 🗓️ Coordinator│ │
│  │             │  │             │  │             │ │
│  │ Supportive  │  │ Structured  │  │  Detailed   │ │
│  │Collaborative│  │ Process-    │  │ Logistics-  │ │
│  │ Creative    │  │ oriented    │  │ focused     │ │
│  │             │  │             │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│                          [Next: Choose Specialization] │
└─────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────┐
│  Create Your AI Persona                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Step 2: Choose Specialization                     │
│  Archetype: Coach                                   │
│                                                     │
│  ┌──────────────────────────────────────────┐      │
│  │ ○ Health Coach                           │      │
│  │   Focus: Nutrition, exercise, wellness   │      │
│  │                                           │      │
│  │ ○ Fitness Coach                          │      │
│  │   Focus: Workout programming, recovery   │      │
│  │                                           │      │
│  │ ○ Accountability Partner                 │      │
│  │   Focus: Addiction recovery, triggers    │      │
│  │                                           │      │
│  │ ○ Skill Coach                            │      │
│  │   Focus: Deliberate practice, learning   │      │
│  └──────────────────────────────────────────┘      │
│                                                     │
│                          [Next: Personalize] │
└─────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────┐
│  Create Your AI Persona                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Step 3: Personalize                               │
│  Archetype: Coach → Health Coach                   │
│                                                     │
│  Display Name *                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Sarah                   the Health Coach    │   │
│  └─────────────────────────────────────────────┘   │
│  Must follow pattern: "[Name] the [Archetype]"     │
│                                                     │
│  Custom Instructions (optional)                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ I'm focused on plant-based nutrition and   │   │
│  │ running. I prefer metric units. I have a   │   │
│  │ medical condition that limits high-impact  │   │
│  │ exercise.                                   │   │
│  └─────────────────────────────────────────────┘   │
│  0/500 characters                                   │
│                                                     │
│  Communication Style                                │
│  Formality: Casual ●───────○ Formal                │
│  Emoji Usage: None ○─────●── Frequent              │
│  Check-ins: ○ As-needed ● Daily ○ Weekly           │
│                                                     │
│  [Cancel]                     [Create Persona]     │
└─────────────────────────────────────────────────────┘
```

### Persona Management Screen

```
┌─────────────────────────────────────────────────────┐
│  Your Personas                                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🏃 Sarah the Health Coach        [Active]  │   │
│  │ Specialization: Health Coach               │   │
│  │ Created: 2 weeks ago                       │   │
│  │ Last used: 5 minutes ago                   │   │
│  │                                             │   │
│  │ [Switch To] [Edit] [Deactivate]            │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🎯 Marcus the Strategist                   │   │
│  │ Specialization: Launch Strategist          │   │
│  │ Created: 1 month ago                       │   │
│  │ Last used: 3 days ago                      │   │
│  │                                             │   │
│  │ [Switch To] [Edit] [Deactivate]            │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [+ Create New Persona]                            │
└─────────────────────────────────────────────────────┘
```

## Safety Monitoring

### Metrics to Track

**User Behavior:**
- Personas created per user (limit: 5)
- Validation failures (track patterns)
- Content moderation flags
- System prompt injection attempts

**Abuse Patterns:**
- Multiple failed validations in short time
- Repeated blocklist violations
- Suspicious custom instructions patterns

**Response Actions:**
- 3 validation failures → Temporary cooldown (1 hour)
- Repeated abuse → Account review
- Severe violations → Account suspension

## Benefits of This Approach

✅ **Safety First**
- No free-form persona creation
- All behaviors bounded by archetypes
- Content moderation on custom inputs
- Runtime safety guardrails

✅ **Creative Freedom**
- Users can personalize name and context
- 23 specializations to choose from
- Communication style customization
- Meaningful differentiation between personas

✅ **Scalable**
- Easy to add new specializations (curated)
- Can expand archetypes carefully
- Monitoring catches edge cases
- Clear upgrade path

✅ **User Experience**
- Guided creation process
- Clear constraints (not frustrating)
- Preview before creation
- Examples provided

## Future Enhancements

**Phase 4: Community Specializations**
- Users propose specializations
- Community votes
- We curate and approve
- Added to official list

**Phase 5: Advanced Personalization**
- Voice samples (if we add TTS)
- Response length preferences
- Citation style preferences
- Domain-specific metric tracking

**Phase 6: Persona Marketplace**
- Share persona configurations
- Rate and review
- Trending specializations
- User testimonials

## Open Questions

1. **How many personas per user?**
   - Recommend: 3-5 max
   - Prevents abuse, encourages thoughtful creation

2. **Can users delete personas?**
   - Yes, but archive conversation history
   - Prevent accidental data loss

3. **Can users share personas?**
   - Phase 1: No
   - Phase 2: Share configuration (not conversations)
   - Requires additional moderation

4. **What about custom domains?**
   - Phase 1: No, use pre-defined specializations
   - Phase 2: Allow proposals with approval queue

## Conclusion

By using **archetype selection + specialization selection + bounded personalization**, we achieve:
- ✅ Safety (no Hitler personas, no hate speech)
- ✅ Creativity (meaningful customization within guardrails)
- ✅ Scalability (easy to monitor and moderate)
- ✅ User satisfaction (feels personal without being dangerous)

The key insight: **Personas are communication styles, not unrestricted role-play characters.**
