# Structured Chat Elements Guide

## Overview

The RavenLoom chat interface supports **structured elements** that allow the AI persona to present tasks, milestones, metrics, and progress in a formatted, actionable way - while keeping the conversation natural.

## Why Structured Elements?

You're right that we need a way to express tasks, metrics, and milestones with "a minimum of formality" in the chat. These structured elements solve that problem by:

1. **Staying Conversational** - The AI can talk naturally AND suggest actionable items
2. **One-Click Actions** - Users can accept suggestions with a button click
3. **Visual Clarity** - Important items stand out from regular conversation
4. **GTD Integration** - Tasks automatically get context, energy level, etc.

## Syntax for AI Personas

When the AI wants to suggest structured elements, it includes special markers in its response:

### Task Suggestions

```
[TASK: title | description | context:@home | energy:low | time:15]
```

**Parameters:**
- `title` (required) - Task title
- `description` (optional) - Details
- `context` (optional) - @home, @office, @computer, @errands, @phone, @anywhere
- `energy` (optional) - low, medium, high
- `time` (optional) - Estimated minutes

**Example AI Response:**
```
Great! Let's start with tracking your calories. This will give us a baseline.

[TASK: Track daily calories for one week | Use MyFitnessPal to log all meals | context:@home | energy:low | time:10]

Once you've done that for a week, we can analyze your patterns and make adjustments. What do you think?
```

**User Sees:**
- Natural conversation text
- A formatted purple card with the task details
- "Add to Tasks" and "Dismiss" buttons

### Milestones

```
[MILESTONE: title | description | date:2024-12-31]
```

**Parameters:**
- `title` (required) - Milestone name
- `description` (optional) - What it means
- `date` (optional) - Target date

**Example AI Response:**
```
To reach your goal, let's set some milestones along the way.

[MILESTONE: Lose first 5 pounds | This shows we're on the right track | date:2024-11-30]

This gives us checkpoints to celebrate progress and adjust if needed.
```

**User Sees:**
- Yellow-bordered card with milestone details
- "Set Milestone" and "Dismiss" buttons

### Metrics

```
[METRIC: name | value | unit | change]
```

**Parameters:**
- `name` (required) - Metric name
- `value` (required) - Current value
- `unit` (optional) - Unit (lbs, minutes, etc.)
- `change` (optional) - Change from last measurement (+/- number)

**Example AI Response:**
```
Looking at your progress:

[METRIC: Current Weight | 185 | lbs | -3]

You've lost 3 pounds! That's excellent progress. How are you feeling?
```

**User Sees:**
- Chart icon with large number display
- Green/red indicator for positive/negative change

### Progress Bars

```
[PROGRESS: title | current | target | unit]
```

**Parameters:**
- `title` (required) - What we're tracking
- `current` (required) - Current value
- `target` (required) - Target value
- `unit` (optional) - Unit label

**Example AI Response:**
```
Here's your weekly progress:

[PROGRESS: Workouts This Week | 3 | 5 | sessions]

You're at 60%! Two more to go. Can you fit them in tomorrow and Friday?
```

**User Sees:**
- Progress bar with percentage
- Purple gradient filling based on completion

## Example Conversation Flow

**User:** "What should I focus on first?"

**AI Response:**
```
Let's start with three key habits that will have the biggest impact:

1. **Nutrition Tracking** - Understanding what you eat is foundational

[TASK: Track calories daily | Use MyFitnessPal or similar app | context:@home | energy:low | time:10]

2. **Movement** - Start small and build consistency

[TASK: Walk 30 minutes 3x this week | Morning or evening, your choice | context:@anywhere | energy:medium | time:30]

3. **Hydration** - Often overlooked but crucial

[TASK: Drink 64oz water daily | Keep water bottle with you | context:@anywhere | energy:low | time:5]

Which of these feels most achievable to start with today?
```

**User Sees:**
- Natural conversational text with bold formatting
- Three separate task cards, each with "Add to Tasks" button
- Can accept one, all, or none

## Benefits

### For Users
- ✅ **Quick Actions** - Accept tasks without typing
- ✅ **Visual Clarity** - Important items stand out
- ✅ **GTD Integration** - Tasks auto-populate sidebar with proper context
- ✅ **Stay in Flow** - No need to leave chat to create tasks

### For AI Personas
- ✅ **Stay Conversational** - Can suggest formally without being stiff
- ✅ **Multiple Suggestions** - Offer options, user chooses
- ✅ **Show Progress** - Visualize metrics and completion
- ✅ **Celebrate Wins** - Metrics can show positive change

## Technical Implementation

### Frontend Parsing
The `ChatElements.jsx` component includes a `parseMessageElements()` function that:
1. Finds special markers in message content
2. Extracts structured data
3. Removes markers from displayed text
4. Renders appropriate UI components

### Automatic Cleanup
- Markers are **automatically removed** from the displayed message
- Only the clean conversational text is shown
- Structured elements appear below the message bubble

### User Actions
When user clicks "Add to Tasks":
1. Frontend sends GraphQL mutation to create task
2. Task appears in sidebar immediately
3. All GTD properties are preserved (context, energy, time)
4. No need for user to manually fill in details

## Persona Prompt Examples

### For Health Coach
```
When suggesting tasks, use this format:
[TASK: title | description | context:@home | energy:low | time:15]

Example: [TASK: Track calories for 3 days | Use MyFitnessPal | context:@home | energy:low | time:10]

Keep suggestions specific and actionable.
```

### For Progress Updates
```
When showing progress, use:
[PROGRESS: title | current | target | unit]

Example: [PROGRESS: Weight Loss Journey | 5 | 20 | lbs]

This helps visualize how far we've come.
```

## Design Principles

1. **Conversation First** - Structured elements enhance, don't replace, natural language
2. **Optional** - AI can chat normally without any markers
3. **Minimal Formality** - Syntax is simple and obvious
4. **User Control** - Users can dismiss suggestions they don't want
5. **Visual Hierarchy** - Different types have different colors/icons

## Future Enhancements

### Phase 2
- [ ] Edit task details before accepting
- [ ] Schedule tasks directly from chat
- [ ] Link tasks to milestones
- [ ] Custom metrics tracking
- [ ] Streak visualization for habits
- [ ] Multiple personas suggesting different tasks

### Phase 3
- [ ] Voice input/output
- [ ] Smart notifications based on context
- [ ] Auto-suggest tasks based on progress
- [ ] Collaborative task assignment
- [ ] Integration with calendar

## Examples by Use Case

### Weight Loss Project
```
AI: "Let's break this down into weekly goals:

[MILESTONE: Lose 5 lbs | First major checkpoint | date:2024-12-01]

To get there, here's your week 1 focus:

[TASK: Meal prep 5 healthy lunches | Sunday afternoon batch cooking | context:@home | energy:medium | time:90]

[TASK: Track all meals in app | Every day without exception | context:@home | energy:low | time:10]

[PROGRESS: Days Tracked | 0 | 7 | days]

Ready to commit to this week?"
```

### Software Project
```
AI: "For the MVP, let's set these milestones:

[MILESTONE: Complete user authentication | Firebase setup + login flow | date:2024-11-15]

First task:

[TASK: Set up Firebase project | Create project in Firebase console | context:@computer | energy:low | time:20]

Then we'll tackle the UI components. Sound good?"
```

### Learning Goal
```
AI: "Here's your progress this week:

[PROGRESS: React Tutorials Completed | 8 | 12 | lessons]

Excellent! You're at 67%. Here's what's next:

[TASK: Complete hooks tutorial | Focus on useState and useEffect | context:@computer | energy:high | time:45]

[METRIC: Hours Studied This Week | 6.5 | hours | +2]

You're building great momentum!"
```

## Summary

Structured chat elements give you the best of both worlds:
- **Natural conversation** with your AI persona
- **Actionable items** that integrate with GTD workflow
- **Visual progress** tracking
- **One-click acceptance** of suggestions

The AI can suggest, you can accept or dismiss, and everything stays organized in your task sidebar. It's conversational project management with just enough formality to keep you productive!
