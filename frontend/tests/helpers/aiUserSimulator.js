/**
 * AI User Simulator
 *
 * Uses OpenAI to generate realistic user responses during testing
 * based on persona traits, conversation context, and goals.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate a contextual user response based on persona and conversation
 *
 * @param {Object} persona - User persona from testPersonas.js
 * @param {string} aiQuestion - What the AI assistant just asked
 * @param {Array} conversationHistory - Previous messages in conversation
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Simulated user response
 */
export async function generateUserResponse(
  persona,
  aiQuestion,
  conversationHistory = [],
  options = {}
) {
  const {
    mood = 'normal', // normal, frustrated, motivated, distracted
    brevity = 'medium', // short, medium, detailed
    includeUncertainty = false // Sometimes users are unsure
  } = options;

  const systemPrompt = `You are simulating a real user named ${persona.name}, a ${persona.age}-year-old ${persona.role}.

## User Profile
Goal: ${persona.goal}
Challenges: ${persona.challenges.join(', ')}
Communication Style: ${persona.personalityTraits.communicationStyle}
Current Mood: ${mood}

## Instructions
- Respond as this user would respond to the AI assistant's question
- Be authentic and natural - real people don't give perfect answers
- ${brevity === 'short' ? 'Keep it brief (1-2 sentences)' : brevity === 'detailed' ? 'Provide detailed context' : 'Keep it conversational (2-4 sentences)'}
- ${includeUncertainty ? 'It\'s okay to be uncertain or ask clarifying questions' : 'Be direct but natural'}
- Match the user's personality traits and current mood
- ${mood === 'frustrated' ? 'Show some frustration with the situation' : ''}
- ${mood === 'motivated' ? 'Show enthusiasm and eagerness' : ''}
- ${mood === 'distracted' ? 'Be slightly unfocused or mention competing priorities' : ''}

## Typical Responses
${Object.entries(persona.typicalResponses || {}).map(([situation, response]) =>
  `${situation}: "${response}"`
).join('\n')}

Respond naturally as ${persona.name} would to this question. ONLY provide the response text, nothing else.`;

  const conversationContext = conversationHistory.length > 0
    ? `\n\nPrevious conversation:\n${conversationHistory.map(m =>
        `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`
      ).join('\n')}`
    : '';

  const userPrompt = `${aiQuestion}${conversationContext}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8, // Higher temperature for more natural variation
      max_tokens: 200
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('[AI Simulator] Error generating response:', error);
    // Fallback to typical response if AI fails
    return persona.typicalResponses?.whenAskedAboutGoal || `I want to ${persona.goal}`;
  }
}

/**
 * Generate a user's initial goal statement
 */
export async function generateInitialGoal(persona) {
  return await generateUserResponse(
    persona,
    'What do you want to accomplish?',
    [],
    { mood: 'motivated', brevity: 'medium' }
  );
}

/**
 * Simulate user deciding on work session
 *
 * @param {Object} persona
 * @param {string} currentContext - What they're working on
 * @returns {Promise<{shouldStart: boolean, duration: number|null, reason: string}>}
 */
export async function simulateWorkSessionDecision(persona, currentContext) {
  // Use simpler logic for work session simulation
  // 70% chance to start a session
  const shouldStart = Math.random() < 0.7;

  if (!shouldStart) {
    return {
      shouldStart: false,
      duration: null,
      reason: persona.challenges[Math.floor(Math.random() * persona.challenges.length)]
    };
  }

  // Generate session duration based on persona
  const baseDuration = persona.role.includes('Student') || persona.role.includes('Engineer') ? 45 : 30;
  const duration = baseDuration + Math.floor(Math.random() * 30); // Add 0-30 min variation

  return {
    shouldStart: true,
    duration,
    reason: 'Ready to focus'
  };
}

/**
 * Simulate completing a task
 *
 * @returns {Promise<{completed: boolean, notes: string}>}
 */
export async function simulateTaskCompletion(persona, taskTitle) {
  const completed = Math.random() < 0.8; // 80% completion rate

  if (completed) {
    const notes = [
      'Done!',
      'Finished this',
      'Got it done',
      'Completed',
      `Knocked out ${taskTitle}`
    ];
    return {
      completed: true,
      notes: notes[Math.floor(Math.random() * notes.length)]
    };
  }

  return {
    completed: false,
    notes: 'Need more time on this'
  };
}

/**
 * Generate realistic conversation flow responses
 *
 * This simulates how a real user would respond throughout onboarding
 */
export async function simulateOnboardingFlow(persona, conversationSoFar = []) {
  // Common onboarding questions and how to handle them
  const lastMessage = conversationSoFar[conversationSoFar.length - 1];
  if (!lastMessage) return null;

  const question = lastMessage.content.toLowerCase();

  // Success condition / outcome
  if (question.includes('success') || question.includes('achieve') || question.includes('outcome')) {
    const project = persona.projects[0];
    return await generateUserResponse(
      persona,
      lastMessage.content,
      conversationSoFar,
      { brevity: 'medium' }
    );
  }

  // Working style / preferences
  if (question.includes('work') && (question.includes('style') || question.includes('prefer') || question.includes('help'))) {
    return await generateUserResponse(
      persona,
      lastMessage.content,
      conversationSoFar,
      { brevity: 'medium' }
    );
  }

  // Challenges / obstacles
  if (question.includes('challenge') || question.includes('struggle') || question.includes('difficult')) {
    return await generateUserResponse(
      persona,
      lastMessage.content,
      conversationSoFar,
      { mood: 'frustrated', brevity: 'detailed' }
    );
  }

  // Assistant style preference
  if (question.includes('assistant') || question.includes('coach') || question.includes('tone')) {
    return persona.personalityTraits.preferredTone;
  }

  // Default - generate contextual response
  return await generateUserResponse(
    persona,
    lastMessage.content,
    conversationSoFar
  );
}

export default {
  generateUserResponse,
  generateInitialGoal,
  simulateWorkSessionDecision,
  simulateTaskCompletion,
  simulateOnboardingFlow
};
