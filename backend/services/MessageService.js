/**
 * MessageService - Handles channel messages and AI interactions
 */

import db from '../db.js';
import AIService from './AIService.js';
import KnowledgeService from './KnowledgeService.js';
import AlertService from './AlertService.js';
import TaskService from './TaskService.js';
import DiscussionService from './DiscussionService.js';
import * as CalendarService from './CalendarService.js';
import * as KnowledgeGraphService from './KnowledgeGraphService.js';
import * as DeepResearchService from './DeepResearchService.js';
import * as WorkContextService from './WorkContextService.js';
import * as PriorityService from './PriorityService.js';
import * as GoalService from './GoalService.js';
import * as UXPreferencesService from './UXPreferencesService.js';

/**
 * Get a message by ID
 */
async function getMessageById(messageId) {
  const result = await db.query(
    `SELECT m.*, u.display_name, u.email, u.avatar_url
     FROM messages m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.id = $1`,
    [messageId]
  );
  return result.rows[0] ? mapMessage(result.rows[0]) : null;
}

/**
 * Send a message to a channel and process any AI commands
 */
export async function sendMessage(channelId, userId, content, options = {}) {
  const { replyToMessageId } = options;

  // Get channel info for team context
  const channelResult = await db.query(
    'SELECT * FROM channels WHERE id = $1',
    [channelId]
  );

  if (channelResult.rows.length === 0) {
    throw new Error('Channel not found');
  }

  const channel = channelResult.rows[0];
  const teamId = channel.team_id;

  // Check if message mentions @raven explicitly OR is Raven DM OR is Calendar Chat
  const isRavenDM = channel.channel_type === 'raven_dm';
  const isCalendarChat = channel.channel_type === 'calendar_chat';
  let mentionsAi = content.toLowerCase().includes('@raven') || isRavenDM || isCalendarChat;
  let replyContext = null;

  // If replying to a message, check if it's a Raven message
  if (replyToMessageId) {
    const originalMessage = await getMessageById(replyToMessageId);
    if (originalMessage) {
      // If replying to Raven's message, auto-trigger AI processing
      if (originalMessage.isAi && !mentionsAi) {
        mentionsAi = true;
        // Store context from the original message for AI processing
        replyContext = {
          originalMessage: originalMessage.content,
          originalMetadata: originalMessage.metadata
        };
      }
    }
  }

  // Parse command - in Raven DM or Calendar Chat, parse without @raven prefix
  let command = null;
  if (mentionsAi) {
    if ((isRavenDM || isCalendarChat) && !content.toLowerCase().includes('@raven')) {
      // In Raven DM or Calendar Chat without explicit @raven, prepend it for parsing
      command = AIService.parseRavenCommand('@raven ' + content);
    } else {
      command = AIService.parseRavenCommand(content);
    }
  }

  // Save the user's message
  const messageResult = await db.query(
    `INSERT INTO messages (channel_id, user_id, content, is_ai, mentions_ai, ai_command)
     VALUES ($1, $2, $3, false, $4, $5)
     RETURNING *`,
    [channelId, userId, content, mentionsAi, command?.type || null]
  );

  const userMessage = mapMessage(messageResult.rows[0]);

  // If no AI mention, check for learning mode and active discussions
  if (!mentionsAi) {
    // Check if channel is in learning mode
    if (channel.ai_mode === 'active') {
      // Extract facts from message in background (don't wait)
      extractAndSaveFactsFromMessage(content, teamId, userId).catch(err => {
        console.error('Background fact extraction error:', err);
      });
    }

    // Check for active discussion - Raven may proactively respond
    const activeDiscussion = await DiscussionService.getActiveDiscussion(channelId);
    if (activeDiscussion) {
      // Trigger proactive discussion response in background (don't block user message)
      handleProactiveDiscussionResponse(channelId, teamId, activeDiscussion).catch(err => {
        console.error('Proactive discussion response error:', err);
      });
    }

    return {
      message: userMessage,
      factsCreated: [],
      alertsCreated: [],
      tasksCreated: []
    };
  }

  // Process the AI command (with reply context if available)
  const aiResponse = await processAICommand(command, teamId, channelId, userId, replyContext, { isCalendarChat });

  // Save the AI response message
  const aiMessageResult = await db.query(
    `INSERT INTO messages (channel_id, user_id, content, is_ai, mentions_ai, metadata)
     VALUES ($1, NULL, $2, true, false, $3)
     RETURNING *`,
    [channelId, aiResponse.responseText, JSON.stringify(aiResponse.metadata || {})]
  );

  return {
    message: mapMessage(aiMessageResult.rows[0]),
    factsCreated: aiResponse.factsCreated || [],
    alertsCreated: aiResponse.alertsCreated || [],
    tasksCreated: aiResponse.tasksCreated || []
  };
}

/**
 * Process an AI command and return the response
 */
async function processAICommand(command, teamId, channelId, userId, replyContext = null, options = {}) {
  const { isCalendarChat } = options;

  // If no explicit command but we have reply context, treat as a query
  if (!command && replyContext) {
    return handleQuery('', teamId, channelId, replyContext, userId, { isCalendarChat });
  }

  if (!command) {
    // Default response differs for calendar chat
    if (isCalendarChat) {
      return {
        responseText: `I'm your calendar assistant! I can help you:
• View upcoming events - "What's on my calendar this week?"
• Add events - "Add meeting tomorrow at 2pm"
• Check due dates - "What's due soon?"
• Schedule reminders - "Remind me about the report on Friday"

Just type naturally and I'll help manage your schedule!`
      };
    }
    return {
      responseText: `I'm here! Commands I understand:
• \`@raven remember [fact]\` - Save information
• \`@raven forget [fact]\` - Remove information
• \`@raven remind [when] [what]\` - Set a reminder
• \`@raven task [description]\` - Create a task
• \`@raven tasks\` - List your tasks
• \`@raven calendar\` - Show upcoming events & due dates
• \`@raven add event [details]\` - Add a calendar event
• \`@raven what's due\` - Show task deadlines
• Or just ask me a question!

💡 Tip: In the #calendar channel, you can talk to me without @raven!`
    };
  }

  switch (command.type) {
    case 'remember':
      return handleRemember(command.content, teamId, channelId, userId);

    case 'remind':
      return handleRemind(command.content, teamId, channelId, userId);

    case 'task':
      return handleTask(command.content, teamId, channelId, userId);

    case 'decision':
      return handleDecision(command.content, teamId, userId);

    case 'forget':
      return handleForget(command.content, teamId, userId);

    case 'correct':
      return handleCorrect(command.content, teamId, userId);

    case 'start_learning':
      return handleStartLearning(channelId);

    case 'stop_learning':
      return handleStopLearning(channelId);

    case 'list_tasks':
      return handleListTasks(teamId, userId);

    case 'list_knowledge':
      return handleListKnowledge(teamId);

    case 'list_reminders':
      return handleListReminders(teamId);

    case 'confirm_update':
      return handleConfirmUpdate(teamId, channelId, userId);

    case 'save_anyway':
      return handleSaveAnyway(teamId, channelId, userId);

    case 'cancel_action':
      return handleCancelAction(channelId);

    case 'discuss':
      return handleStartDiscussion(command.topic, teamId, channelId, userId);

    case 'end_discussion':
      return handleEndDiscussion(teamId, channelId);

    case 'continue_discussion':
      return handleContinueDiscussion(teamId, channelId);

    case 'calendar_query':
      return handleCalendarQuery(teamId);

    case 'add_event':
      return handleAddEvent(command.content, teamId, userId);

    case 'due_dates_query':
      return handleDueDatesQuery(teamId);

    case 'deep_research':
      return handleDeepResearch(command.content, teamId, userId);

    // ============================================================================
    // WORK CONTEXT COMMANDS (AI-first productivity)
    // ============================================================================

    case 'work_status':
      return handleWorkStatus(command.content, teamId, userId);

    case 'prioritize':
      return handlePrioritize(teamId, userId);

    case 'priority_queue':
      return handlePriorityQueue(teamId, userId);

    case 'show_blockers':
      return handleShowBlockers(command.content, teamId, userId);

    case 'goal_health':
      return handleGoalHealth(command.content, teamId);

    case 'priority_conflicts':
      return handlePriorityConflicts(teamId);

    case 'link_knowledge':
      return handleLinkKnowledge(command.content, teamId, userId);

    case 'research_for':
      return handleResearchFor(command.content, teamId, userId);

    // ============================================================================
    // UX PREFERENCES COMMANDS (AI-controlled personalization)
    // ============================================================================

    case 'ux_hide':
      return handleUXHide(command.content, teamId, userId);

    case 'ux_show':
      return handleUXShow(command.content, teamId, userId);

    case 'ux_move':
      return handleUXMove(command.content, teamId, userId);

    case 'ux_density':
      return handleUXDensity(command.content, teamId, userId);

    case 'ux_animations':
      return handleUXAnimations(command.content, teamId, userId);

    case 'ux_badges':
      return handleUXBadges(command.content, teamId, userId);

    case 'ux_ai_summaries':
      return handleUXAISummaries(command.content, teamId, userId);

    case 'ux_simplify':
      return handleUXSimplify(teamId, userId);

    case 'ux_reset':
      return handleUXReset(teamId, userId);

    case 'ux_list_hidden':
      return handleUXListHidden(teamId, userId);

    case 'query':
    default:
      return handleQuery(command.query, teamId, channelId, replyContext, userId, { isCalendarChat });
  }
}

/**
 * Handle "remember" command with smart conflict detection
 */
async function handleRemember(content, teamId, channelId, userId) {
  try {
    // First, check if this is a personal user fact (e.g., "call me Shawn")
    const userFact = await AIService.extractUserFact(content);
    if (userFact) {
      // Store as a user fact linked to the sender
      await KnowledgeGraphService.storeUserFact(
        teamId,
        userId,
        userFact.factType,
        userFact.key,
        userFact.value,
        `Said in channel: ${content}`
      );

      // Also ensure user has a node in the KG
      await KnowledgeGraphService.getOrCreateUserNode(teamId, userId);

      // Personalized response based on fact type
      let responseText;
      if (userFact.factType === 'nickname' && userFact.key === 'preferred_name') {
        responseText = `Got it, ${userFact.value}! I'll remember to call you that.`;
      } else if (userFact.factType === 'role') {
        responseText = `Noted! I'll remember you're ${userFact.value}.`;
      } else {
        responseText = `Saved your preference: ${userFact.key} = ${userFact.value}`;
      }

      return {
        responseText,
        metadata: { command: 'remember', type: 'user_fact', factType: userFact.factType, key: userFact.key }
      };
    }

    // Extract structured fact from content with rich metadata
    const extracted = await AIService.extractFact(content);

    // Use semantic search to find potentially related facts (much more accurate than scanning all)
    // This finds facts about the same entity/topic even if worded differently
    const relatedFacts = await KnowledgeService.searchFacts(teamId, extracted.content, 10);

    // Check for conflicts/duplicates with the semantically related facts
    const conflictCheck = await AIService.checkFactConflict(
      { ...extracted, originalContent: content },
      relatedFacts
    );

    // Handle based on conflict check result
    if (conflictCheck.action === 'ask_confirmation') {
      // There's a potential conflict - ask user to confirm
      const relatedFact = relatedFacts.find(f => f.id === conflictCheck.relatedFactId);
      return {
        responseText: `I noticed something similar already stored:\n> "${relatedFact?.content || conflictCheck.relatedFactContent}"\n\nDid you want to update this? Reply with:\n• \`@raven yes, update\` to replace the old fact\n• \`@raven save anyway\` to keep both\n• \`@raven nevermind\` to cancel`,
        metadata: {
          command: 'remember',
          pendingAction: 'confirm_update',
          newFact: extracted,
          relatedFactId: conflictCheck.relatedFactId,
          conflictType: conflictCheck.conflictType
        }
      };
    }

    if (conflictCheck.action === 'update' && conflictCheck.relatedFactId) {
      // Explicit update - replace the old fact
      const oldFact = relatedFacts.find(f => f.id === conflictCheck.relatedFactId);

      // Create new fact
      const newFact = await KnowledgeService.createFact(teamId, {
        content: extracted.content,
        category: extracted.category,
        sourceType: 'conversation',
        createdBy: userId,
        metadata: extracted.metadata
      });

      // Mark old fact as superseded
      await KnowledgeService.invalidateFact(conflictCheck.relatedFactId, newFact.id);

      return {
        responseText: `Updated: "${oldFact?.content}" → "${extracted.content}"`,
        factsCreated: [newFact],
        metadata: {
          command: 'remember',
          action: 'updated',
          oldFactId: conflictCheck.relatedFactId,
          newFactId: newFact.id
        }
      };
    }

    // Default: Save as new fact
    const fact = await KnowledgeService.createFact(teamId, {
      content: extracted.content,
      category: extracted.category,
      sourceType: 'conversation',
      createdBy: userId,
      metadata: extracted.metadata
    });

    // Build response showing what was captured
    let responseText = `Got it. Saved: "${extracted.content}" [${extracted.category}]`;
    if (extracted.metadata?.urls?.length > 0) {
      responseText += `\n📎 Links: ${extracted.metadata.urls.length}`;
    }
    if (extracted.metadata?.entities?.length > 0) {
      responseText += `\n🏷️ ${extracted.metadata.entities.join(', ')}`;
    }

    return {
      responseText,
      factsCreated: [fact],
      metadata: { command: 'remember', factId: fact.id }
    };
  } catch (error) {
    console.error('Remember error:', error);
    return {
      responseText: `I had trouble saving that. Error: ${error.message}`
    };
  }
}

/**
 * Get the pending action from the last AI message in the channel
 */
async function getPendingAction(channelId) {
  const result = await db.query(
    `SELECT metadata FROM messages
     WHERE channel_id = $1 AND is_ai = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [channelId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const metadata = result.rows[0].metadata;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  return metadata;
}

/**
 * Handle "yes, update" - confirm replacing an old fact
 */
async function handleConfirmUpdate(teamId, channelId, userId) {
  try {
    const pendingAction = await getPendingAction(channelId);

    if (!pendingAction || pendingAction.pendingAction !== 'confirm_update') {
      return {
        responseText: "I don't have a pending update to confirm. What would you like me to remember?"
      };
    }

    const { newFact, relatedFactId } = pendingAction;

    // Get the old fact content for the response
    const existingFacts = await KnowledgeService.getFacts(teamId, { limit: 100 });
    const oldFact = existingFacts.find(f => f.id === relatedFactId);

    // Create the new fact
    const fact = await KnowledgeService.createFact(teamId, {
      content: newFact.content,
      category: newFact.category,
      sourceType: 'conversation',
      createdBy: userId,
      metadata: newFact.metadata
    });

    // Mark old fact as superseded
    await KnowledgeService.invalidateFact(relatedFactId, fact.id);

    return {
      responseText: `Updated: "${oldFact?.content}" → "${newFact.content}"`,
      factsCreated: [fact],
      metadata: {
        command: 'confirm_update',
        action: 'updated',
        oldFactId: relatedFactId,
        newFactId: fact.id
      }
    };
  } catch (error) {
    console.error('Confirm update error:', error);
    return {
      responseText: `Error updating: ${error.message}`
    };
  }
}

/**
 * Handle "save anyway" - keep both old and new fact
 */
async function handleSaveAnyway(teamId, channelId, userId) {
  try {
    const pendingAction = await getPendingAction(channelId);

    if (!pendingAction || pendingAction.pendingAction !== 'confirm_update') {
      return {
        responseText: "I don't have a pending fact to save. What would you like me to remember?"
      };
    }

    const { newFact } = pendingAction;

    // Save the new fact without invalidating the old one
    const fact = await KnowledgeService.createFact(teamId, {
      content: newFact.content,
      category: newFact.category,
      sourceType: 'conversation',
      createdBy: userId,
      metadata: newFact.metadata
    });

    return {
      responseText: `Saved as additional fact: "${newFact.content}" [${newFact.category}]`,
      factsCreated: [fact],
      metadata: {
        command: 'save_anyway',
        action: 'saved_both',
        newFactId: fact.id
      }
    };
  } catch (error) {
    console.error('Save anyway error:', error);
    return {
      responseText: `Error saving: ${error.message}`
    };
  }
}

/**
 * Handle "nevermind" / "cancel" - abandon the pending action
 */
async function handleCancelAction(channelId) {
  const pendingAction = await getPendingAction(channelId);

  if (!pendingAction || !pendingAction.pendingAction) {
    return {
      responseText: "No problem. Let me know if you need anything else."
    };
  }

  return {
    responseText: "Okay, cancelled. The original fact remains unchanged.",
    metadata: {
      command: 'cancel_action',
      action: 'cancelled'
    }
  };
}

/**
 * Handle "remind" command
 */
async function handleRemind(content, teamId, channelId, userId) {
  try {
    // Extract alert details
    const extracted = await AIService.extractAlert(content);

    // Create the alert
    const alert = await AlertService.createAlert(teamId, {
      channelId,
      triggerType: extracted.triggerType,
      triggerAt: extracted.triggerAt,
      recurrenceRule: extracted.recurrenceRule,
      message: extracted.message,
      createdBy: userId
    });

    const dateStr = extracted.triggerAt
      ? new Date(extracted.triggerAt).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      : 'as scheduled';

    return {
      responseText: `Reminder set for ${dateStr}: "${extracted.message}"`,
      alertsCreated: [alert],
      metadata: { command: 'remind', alertId: alert.id }
    };
  } catch (error) {
    console.error('Remind error:', error);
    return {
      responseText: `I couldn't set that reminder. Try: "@raven remind [date] about [what]"\nError: ${error.message}`
    };
  }
}

/**
 * Handle "task" command
 */
async function handleTask(content, teamId, channelId, userId) {
  try {
    // Extract task details
    const extracted = await AIService.extractTask(content);

    // Create the task
    const task = await TaskService.createTask(teamId, {
      title: extracted.title,
      description: extracted.description,
      priority: extracted.priority,
      dueAt: extracted.dueAt,
      channelId,
      createdBy: userId
    });

    let responseText = `Task created: "${extracted.title}"`;
    if (extracted.priority === 'high' || extracted.priority === 'urgent') {
      responseText += ` [${extracted.priority.toUpperCase()}]`;
    }
    if (extracted.dueAt) {
      responseText += ` (due ${new Date(extracted.dueAt).toLocaleDateString()})`;
    }

    return {
      responseText,
      tasksCreated: [task],
      metadata: { command: 'task', taskId: task.id }
    };
  } catch (error) {
    console.error('Task error:', error);
    return {
      responseText: `I couldn't create that task. Error: ${error.message}`
    };
  }
}

/**
 * Handle "decision" command
 */
async function handleDecision(content, teamId, userId) {
  try {
    // Extract decision details
    const extracted = await AIService.extractDecision(content);

    // Save the decision
    const decision = await KnowledgeService.createDecision(teamId, {
      what: extracted.what,
      why: extracted.why,
      alternatives: extracted.alternatives,
      madeBy: userId,
      sourceType: 'conversation'
    });

    let responseText = `Decision recorded: "${extracted.what}"`;
    if (extracted.why) {
      responseText += `\nReason: ${extracted.why}`;
    }

    return {
      responseText,
      metadata: { command: 'decision', decisionId: decision.id }
    };
  } catch (error) {
    console.error('Decision error:', error);
    return {
      responseText: `I couldn't record that decision. Error: ${error.message}`
    };
  }
}

/**
 * Handle query (question)
 */
async function handleQuery(query, teamId, channelId, replyContext = null, userId = null, options = {}) {
  const { isCalendarChat } = options;

  try {
    // Get relevant knowledge
    const knowledge = await KnowledgeService.getKnowledgeContext(teamId, query);

    // Get user context if userId provided
    let userContext = null;
    if (userId) {
      userContext = await KnowledgeGraphService.getUserContext(teamId, userId);
    }

    // Get recent conversation history for context
    const historyResult = await db.query(
      `SELECT * FROM messages
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [channelId]
    );
    const history = historyResult.rows.reverse().map(mapMessage);

    // Build enhanced query with context
    let enhancedQuery = query;

    // Add calendar context if this is a calendar chat
    if (isCalendarChat) {
      const calendarContext = await getCalendarContext(teamId);
      if (calendarContext) {
        enhancedQuery = `[CALENDAR CONTEXT - You are acting as a calendar assistant. Use this information to answer the user's question:\n${calendarContext}]\n\n${query}`;
      }
    }

    // Add user context if available
    if (userContext) {
      const userInfo = [];
      if (userContext.preferredName) {
        userInfo.push(`The user's name is ${userContext.preferredName}`);
      } else if (userContext.displayName && userContext.displayName !== 'Unknown') {
        userInfo.push(`The user is ${userContext.displayName}`);
      }
      if (userContext.facts?.role?.job_title) {
        userInfo.push(`Their role is ${userContext.facts.role.job_title}`);
      }
      if (userInfo.length > 0) {
        enhancedQuery = `[User context: ${userInfo.join('. ')}]\n\n${enhancedQuery}`;
      }
    }

    // If this is a reply to a Raven message, include that context
    if (replyContext?.originalMessage) {
      // Prepend the context of what Raven said to help understand the user's response
      enhancedQuery = `[Context: You previously said: "${replyContext.originalMessage}"]\n\n${enhancedQuery || '(User replied without additional text)'}`;
    }

    // Generate AI response
    const response = await AIService.generateResponse(enhancedQuery, knowledge, history);

    return {
      responseText: response,
      metadata: {
        command: 'query',
        factsUsed: knowledge.facts.length,
        decisionsUsed: knowledge.decisions.length,
        isReply: !!replyContext,
        isCalendarChat
      }
    };
  } catch (error) {
    console.error('Query error:', error);
    return {
      responseText: `I had trouble answering that. Error: ${error.message}`
    };
  }
}

/**
 * Get calendar context for AI queries in calendar chat
 */
async function getCalendarContext(teamId) {
  try {
    const now = new Date();
    const nextTwoWeeks = new Date(now);
    nextTwoWeeks.setDate(nextTwoWeeks.getDate() + 14);

    // Get upcoming events
    const events = await CalendarService.getEvents(teamId, {
      startDate: now.toISOString(),
      endDate: nextTwoWeeks.toISOString()
    });

    // Get tasks with due dates
    const allTasks = await TaskService.getTasks(teamId, {});
    const tasksDue = allTasks.filter(t => t.dueAt).sort((a, b) =>
      new Date(a.dueAt) - new Date(b.dueAt)
    ).slice(0, 15);

    let context = `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.\n\n`;

    if (events.length > 0) {
      context += `UPCOMING EVENTS (next 2 weeks):\n`;
      events.forEach(event => {
        const start = new Date(event.startAt);
        const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = event.isAllDay ? 'All day' : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        context += `• ${dateStr} ${timeStr}: ${event.title}${event.location ? ` @ ${event.location}` : ''}\n`;
      });
      context += '\n';
    } else {
      context += `No upcoming events in the next 2 weeks.\n\n`;
    }

    if (tasksDue.length > 0) {
      context += `TASKS WITH DUE DATES:\n`;
      tasksDue.forEach(task => {
        const due = new Date(task.dueAt);
        const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const overdue = due < now ? ' (OVERDUE)' : '';
        context += `• ${dueStr}: ${task.title} [${task.status}]${overdue}\n`;
      });
    } else {
      context += `No tasks with due dates.`;
    }

    return context;
  } catch (error) {
    console.error('Error getting calendar context:', error);
    return null;
  }
}

/**
 * Handle "forget" command - remove/invalidate a fact
 */
async function handleForget(content, teamId, userId) {
  try {
    // Get existing facts to search through
    const facts = await KnowledgeService.getFacts(teamId, { limit: 100 });

    if (facts.length === 0) {
      return { responseText: "I don't have any stored facts to forget." };
    }

    // Use AI to find which fact to forget
    const result = await AIService.findFactToForget(content, facts);

    if (!result || !result.factId) {
      return {
        responseText: `I couldn't find a fact matching "${content}". Use \`@raven facts\` to see what I know.`
      };
    }

    // Invalidate the fact
    await KnowledgeService.invalidateFact(result.factId);

    const forgottenFact = facts.find(f => f.id === result.factId);
    return {
      responseText: `Forgotten: "${forgottenFact?.content || 'fact'}"`,
      metadata: { command: 'forget', factId: result.factId }
    };
  } catch (error) {
    console.error('Forget error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "correct" command - update a fact
 */
async function handleCorrect(content, teamId, userId) {
  try {
    // Get existing facts
    const facts = await KnowledgeService.getFacts(teamId, { limit: 100 });

    // Use AI to extract correction
    const correction = await AIService.extractCorrection(content, facts);

    if (correction.factId) {
      // Update existing fact
      const oldFact = facts.find(f => f.id === correction.factId);

      // Create new fact and link old one as superseded
      const newFact = await KnowledgeService.createFact(teamId, {
        content: correction.newContent,
        category: correction.category || oldFact?.category || 'general',
        sourceType: 'conversation',
        createdBy: userId
      });

      // Mark old fact as superseded
      await KnowledgeService.invalidateFact(correction.factId, newFact.id);

      return {
        responseText: `Updated: "${oldFact?.content}" → "${correction.newContent}"`,
        factsCreated: [newFact],
        metadata: { command: 'correct', oldFactId: correction.factId, newFactId: newFact.id }
      };
    } else {
      // No existing fact found, create new
      const newFact = await KnowledgeService.createFact(teamId, {
        content: correction.newContent,
        category: correction.category || 'general',
        sourceType: 'conversation',
        createdBy: userId
      });

      return {
        responseText: `Saved: "${correction.newContent}"`,
        factsCreated: [newFact],
        metadata: { command: 'correct', newFactId: newFact.id }
      };
    }
  } catch (error) {
    console.error('Correct error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "start learning" - enable auto-learning mode for channel
 */
async function handleStartLearning(channelId) {
  try {
    await db.query(
      `UPDATE channels SET ai_mode = 'active' WHERE id = $1`,
      [channelId]
    );
    return {
      responseText: `Learning mode ON 📚\nI'll now automatically extract and remember important facts from all messages in this channel.`,
      metadata: { command: 'start_learning' }
    };
  } catch (error) {
    console.error('Start learning error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "stop learning" - disable auto-learning mode
 */
async function handleStopLearning(channelId) {
  try {
    await db.query(
      `UPDATE channels SET ai_mode = 'mentions_only' WHERE id = $1`,
      [channelId]
    );
    return {
      responseText: `Learning mode OFF\nI'll only respond when you @mention me.`,
      metadata: { command: 'stop_learning' }
    };
  } catch (error) {
    console.error('Stop learning error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "list tasks" - show tasks
 */
async function handleListTasks(teamId, userId) {
  try {
    const tasks = await TaskService.getTasks(teamId, { status: 'todo', limit: 20 });
    const inProgress = await TaskService.getTasks(teamId, { status: 'in_progress', limit: 10 });

    const allTasks = [...inProgress, ...tasks];

    if (allTasks.length === 0) {
      return { responseText: "No open tasks. Create one with `@raven task [description]`" };
    }

    let response = `**Tasks (${allTasks.length})**\n`;
    allTasks.forEach(task => {
      const priority = task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟠' : '';
      const status = task.status === 'in_progress' ? '▶️' : '◻️';
      const due = task.dueAt ? ` (due ${new Date(task.dueAt).toLocaleDateString()})` : '';
      response += `${status} ${priority}${task.title}${due}\n`;
    });

    return { responseText: response, metadata: { command: 'list_tasks', count: allTasks.length } };
  } catch (error) {
    console.error('List tasks error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "list knowledge" - show stored facts
 */
async function handleListKnowledge(teamId) {
  try {
    const facts = await KnowledgeService.getFacts(teamId, { limit: 20 });
    const decisions = await KnowledgeService.getDecisions(teamId, 10);

    if (facts.length === 0 && decisions.length === 0) {
      return { responseText: "I don't have any stored knowledge yet. Tell me things with `@raven remember [fact]`" };
    }

    let response = '';

    if (facts.length > 0) {
      response += `**Facts (${facts.length})**\n`;
      facts.slice(0, 10).forEach(f => {
        response += `• ${f.content} [${f.category}]\n`;
      });
      if (facts.length > 10) response += `...and ${facts.length - 10} more\n`;
    }

    if (decisions.length > 0) {
      response += `\n**Decisions (${decisions.length})**\n`;
      decisions.slice(0, 5).forEach(d => {
        response += `• ${d.what}`;
        if (d.why) response += ` (${d.why})`;
        response += '\n';
      });
    }

    return { responseText: response, metadata: { command: 'list_knowledge', facts: facts.length, decisions: decisions.length } };
  } catch (error) {
    console.error('List knowledge error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "list reminders" - show alerts
 */
async function handleListReminders(teamId) {
  try {
    const alerts = await AlertService.getAlerts(teamId, { status: 'pending' });

    if (alerts.length === 0) {
      return { responseText: "No pending reminders. Set one with `@raven remind [when] [what]`" };
    }

    let response = `**Reminders (${alerts.length})**\n`;
    alerts.forEach(a => {
      const date = a.triggerAt
        ? new Date(a.triggerAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : 'Scheduled';
      response += `• ${date}: ${a.message}\n`;
    });

    return { responseText: response, metadata: { command: 'list_reminders', count: alerts.length } };
  } catch (error) {
    console.error('List reminders error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Get messages for a channel
 */
export async function getMessages(channelId, { limit = 50, before = null } = {}) {
  let query = `
    SELECT m.*, u.display_name, u.email, u.avatar_url
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.channel_id = $1
  `;
  const params = [channelId];
  let paramIndex = 2;

  if (before) {
    query += ` AND m.id < $${paramIndex}`;
    params.push(before);
    paramIndex++;
  }

  query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(query, params);

  // Return in chronological order
  return result.rows.reverse().map(mapMessage);
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Extract facts from a message in background (for learning mode)
 */
async function extractAndSaveFactsFromMessage(content, teamId, userId) {
  try {
    const extractedFacts = await AIService.extractFactsFromMessage(content);

    if (extractedFacts.length === 0) {
      return;
    }

    console.log(`Learning mode: extracted ${extractedFacts.length} facts from message`);

    for (const fact of extractedFacts) {
      await KnowledgeService.createFact(teamId, {
        content: fact.content,
        category: fact.category,
        sourceType: 'auto_extracted',
        createdBy: userId
      });
    }
  } catch (error) {
    console.error('extractAndSaveFactsFromMessage error:', error);
  }
}

/**
 * Handle proactive Raven response during an active discussion
 * Called in background after user messages during discussions
 */
async function handleProactiveDiscussionResponse(channelId, teamId, discussion) {
  try {
    // Get recent messages since discussion started
    const messages = await DiscussionService.getDiscussionMessages(
      channelId,
      discussion.started_at,
      20
    );

    // Get relevant knowledge for context
    const knowledge = await KnowledgeService.searchFacts(teamId, discussion.topic, 5);
    const knowledgeContext = { facts: knowledge };

    // Evaluate if Raven should respond
    const evaluation = await AIService.evaluateDiscussionResponse(
      discussion.topic,
      messages,
      knowledgeContext
    );

    if (!evaluation.shouldRespond) {
      console.log(`Discussion "${discussion.topic}": staying silent - ${evaluation.reason}`);
      return;
    }

    console.log(`Discussion "${discussion.topic}": responding (${evaluation.responseType})`);

    // Save Raven's proactive response
    const metadata = {
      command: 'proactive_discussion',
      topic: discussion.topic,
      responseType: evaluation.responseType,
      replyToMessageId: evaluation.replyToMessageId || null
    };

    await db.query(
      `INSERT INTO messages (channel_id, user_id, content, is_ai, mentions_ai, metadata)
       VALUES ($1, NULL, $2, true, false, $3)
       RETURNING *`,
      [channelId, evaluation.response, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('handleProactiveDiscussionResponse error:', error);
  }
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    threadId: row.thread_id,
    userId: row.user_id,
    user: row.display_name ? {
      id: row.user_id,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url
    } : null,
    content: row.content,
    isAi: row.is_ai,
    mentionsAi: row.mentions_ai,
    aiCommand: row.ai_command,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

/**
 * Send a message to a thread and process any AI commands
 */
export async function sendThreadMessage(threadId, userId, content, options = {}) {
  const { replyToMessageId } = options;

  // Get thread and channel info
  const threadResult = await db.query(
    `SELECT t.*, c.team_id, c.ai_mode
     FROM threads t
     JOIN channels c ON t.channel_id = c.id
     WHERE t.id = $1`,
    [threadId]
  );

  if (threadResult.rows.length === 0) {
    throw new Error('Thread not found');
  }

  const thread = threadResult.rows[0];
  const teamId = thread.team_id;
  const channelId = thread.channel_id;

  // Check if message mentions @raven explicitly
  let mentionsAi = content.toLowerCase().includes('@raven');
  let replyContext = null;

  // If replying to a message, check if it's a Raven message
  if (replyToMessageId) {
    const originalMessage = await getMessageById(replyToMessageId);
    if (originalMessage) {
      // If replying to Raven's message, auto-trigger AI processing
      if (originalMessage.isAi && !mentionsAi) {
        mentionsAi = true;
        replyContext = {
          originalMessage: originalMessage.content,
          originalMetadata: originalMessage.metadata
        };
      }
    }
  }

  const command = mentionsAi ? AIService.parseRavenCommand(content) : null;

  // Save the user's message to the thread
  const messageResult = await db.query(
    `INSERT INTO messages (channel_id, thread_id, user_id, content, is_ai, mentions_ai, ai_command)
     VALUES ($1, $2, $3, $4, false, $5, $6)
     RETURNING *`,
    [channelId, threadId, userId, content, mentionsAi, command?.type || null]
  );

  const userMessage = mapMessage(messageResult.rows[0]);

  // If no AI mention, just return the message
  if (!mentionsAi) {
    return {
      message: userMessage,
      factsCreated: [],
      alertsCreated: [],
      tasksCreated: []
    };
  }

  // Process the AI command (with reply context if available)
  const aiResponse = await processAICommand(command, teamId, channelId, userId, replyContext);

  // Save the AI response message to the same thread
  const aiMessageResult = await db.query(
    `INSERT INTO messages (channel_id, thread_id, user_id, content, is_ai, mentions_ai, metadata)
     VALUES ($1, $2, NULL, $3, true, false, $4)
     RETURNING *`,
    [channelId, threadId, aiResponse.responseText, JSON.stringify(aiResponse.metadata || {})]
  );

  return {
    message: mapMessage(aiMessageResult.rows[0]),
    factsCreated: aiResponse.factsCreated || [],
    alertsCreated: aiResponse.alertsCreated || [],
    tasksCreated: aiResponse.tasksCreated || []
  };
}

/**
 * Handle starting a discussion
 */
async function handleStartDiscussion(topic, teamId, channelId, userId) {
  try {
    // Get relevant knowledge for context
    const knowledge = await KnowledgeService.searchFacts(teamId, topic, 5);
    const knowledgeContext = { facts: knowledge };

    // Start the discussion
    await DiscussionService.startDiscussion(channelId, topic, userId);

    // Generate opening discussion message
    const response = await AIService.startDiscussion(topic, knowledgeContext);

    return {
      responseText: response,
      metadata: {
        command: 'discuss',
        topic: topic,
        action: 'started'
      }
    };
  } catch (error) {
    console.error('Start discussion error:', error);
    return {
      responseText: `I'd love to help facilitate a discussion, but I ran into an issue. Try again?`,
      metadata: { command: 'discuss', error: error.message }
    };
  }
}

/**
 * Handle ending a discussion
 */
async function handleEndDiscussion(teamId, channelId) {
  try {
    // Get the active discussion
    const discussion = await DiscussionService.getActiveDiscussion(channelId);

    if (!discussion) {
      return {
        responseText: `There's no active discussion to end in this channel. You can start one with \`@raven discuss [topic]\`.`,
        metadata: { command: 'end_discussion', action: 'no_discussion' }
      };
    }

    // Get messages since discussion started
    const messages = await DiscussionService.getDiscussionMessages(
      channelId,
      discussion.started_at,
      50
    );

    // Generate summary
    const summary = await AIService.concludeDiscussion(discussion.topic, messages);

    // End the discussion
    await DiscussionService.endActiveDiscussion(channelId);

    return {
      responseText: summary,
      metadata: {
        command: 'end_discussion',
        topic: discussion.topic,
        action: 'ended'
      }
    };
  } catch (error) {
    console.error('End discussion error:', error);
    return {
      responseText: `I ran into an issue wrapping up the discussion. The discussion has been ended though.`,
      metadata: { command: 'end_discussion', error: error.message }
    };
  }
}

/**
 * Handle continuing a discussion with the next question
 */
async function handleContinueDiscussion(teamId, channelId) {
  try {
    // Get the active discussion
    const discussion = await DiscussionService.getActiveDiscussion(channelId);

    if (!discussion) {
      return {
        responseText: `There's no active discussion to continue. Start one with \`@raven discuss [topic]\`.`,
        metadata: { command: 'continue_discussion', action: 'no_discussion' }
      };
    }

    // Get messages since discussion started
    const messages = await DiscussionService.getDiscussionMessages(
      channelId,
      discussion.started_at,
      30
    );

    // Get relevant knowledge for context
    const knowledge = await KnowledgeService.searchFacts(teamId, discussion.topic, 5);
    const knowledgeContext = { facts: knowledge };

    // Generate follow-up question
    const response = await AIService.continueDiscussion(
      discussion.topic,
      messages,
      knowledgeContext
    );

    return {
      responseText: response,
      metadata: {
        command: 'continue_discussion',
        topic: discussion.topic,
        action: 'continued'
      }
    };
  } catch (error) {
    console.error('Continue discussion error:', error);
    return {
      responseText: `I ran into an issue coming up with the next question. Feel free to keep the conversation going!`,
      metadata: { command: 'continue_discussion', error: error.message }
    };
  }
}

/**
 * Handle calendar query - show upcoming events and tasks
 */
async function handleCalendarQuery(teamId) {
  try {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Get events for next 7 days
    const events = await CalendarService.getEvents(teamId, {
      startDate: now.toISOString(),
      endDate: nextWeek.toISOString()
    });

    // Get tasks with due dates
    const allTasks = await TaskService.getTasks(teamId, {});
    const tasksDue = allTasks.filter(t => t.dueAt);

    const response = AIService.formatCalendarResponse(events, tasksDue);

    return {
      responseText: response,
      metadata: { command: 'calendar_query' }
    };
  } catch (error) {
    console.error('Calendar query error:', error);
    return {
      responseText: `I had trouble checking the calendar. ${error.message}`,
      metadata: { command: 'calendar_query', error: error.message }
    };
  }
}

/**
 * Handle adding a calendar event
 */
async function handleAddEvent(content, teamId, userId) {
  try {
    // Extract event details using AI
    const eventDetails = await AIService.extractCalendarEvent(content);

    // Create the event
    const event = await CalendarService.createEvent(teamId, {
      title: eventDetails.title,
      description: eventDetails.description,
      startAt: eventDetails.startAt,
      endAt: eventDetails.endAt,
      isAllDay: eventDetails.isAllDay || false,
      location: eventDetails.location,
      createdBy: userId
    });

    const startDate = new Date(event.startAt);
    const dateStr = startDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
    const timeStr = event.isAllDay ? 'all day' :
      startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return {
      responseText: `Added to calendar: **${event.title}**\n📅 ${dateStr}${event.isAllDay ? '' : ` at ${timeStr}`}${event.location ? `\n📍 ${event.location}` : ''}`,
      metadata: {
        command: 'add_event',
        eventId: event.id
      }
    };
  } catch (error) {
    console.error('Add event error:', error);
    return {
      responseText: `I couldn't add that event. ${error.message}\n\nTry: "add event [title] on [date] at [time]"`,
      metadata: { command: 'add_event', error: error.message }
    };
  }
}

/**
 * Handle due dates query
 */
async function handleDueDatesQuery(teamId) {
  try {
    const allTasks = await TaskService.getTasks(teamId, {});
    const response = AIService.formatDueDatesResponse(allTasks);

    return {
      responseText: response,
      metadata: { command: 'due_dates_query' }
    };
  } catch (error) {
    console.error('Due dates query error:', error);
    return {
      responseText: `I had trouble checking due dates. ${error.message}`,
      metadata: { command: 'due_dates_query', error: error.message }
    };
  }
}

/**
 * Handle deep research command
 */
async function handleDeepResearch(question, teamId, userId) {
  try {
    // Acknowledge and start research
    const session = await DeepResearchService.startResearch(teamId, userId, question);

    // Run the full research in background (don't wait)
    DeepResearchService.runFullResearch(teamId, userId, question).then(result => {
      console.log(`[DeepResearch] Completed: ${result.sessionId}`);
    }).catch(err => {
      console.error('[DeepResearch] Error:', err);
    });

    // Build immediate response with objectives
    const objectivesList = session.objectives
      .map((obj, i) => `${i + 1}. ${obj.objective}`)
      .join('\n');

    return {
      responseText: `Starting deep research on: "${question}"

**Learning Objectives:**
${objectivesList}

I'll explore our knowledge base and synthesize a comprehensive report. This may take a moment...

Use \`@raven research status\` to check progress.`,
      metadata: {
        command: 'deep_research',
        sessionId: session.sessionId,
        status: 'started'
      }
    };
  } catch (error) {
    console.error('Deep research error:', error);
    return {
      responseText: `I had trouble starting the research. ${error.message}`,
      metadata: { command: 'deep_research', error: error.message }
    };
  }
}

// ============================================================================
// WORK CONTEXT HANDLERS (AI-first productivity)
// ============================================================================

/**
 * Handle "@raven status" - show work status with health
 */
async function handleWorkStatus(target, teamId, userId) {
  try {
    const context = await WorkContextService.getWorkContext(teamId, userId);

    let response = '**Work Status**\n\n';

    // Goals overview
    if (context.goals?.length > 0) {
      response += `**Goals (${context.goals.length})**\n`;
      for (const goal of context.goals.slice(0, 5)) {
        const health = goal.health || {};
        const statusEmoji = {
          on_track: '🟢',
          at_risk: '🟡',
          blocked: '🔴',
          behind: '🟠'
        }[health.status] || '⚪';
        response += `${statusEmoji} **${goal.title}** - ${health.progress || 0}% (${health.completedCount || 0}/${health.taskCount || 0} tasks)\n`;
        if (health.riskFactors?.length > 0) {
          response += `   ⚠️ ${health.riskFactors[0]}\n`;
        }
      }
    } else {
      response += 'No active goals.\n';
    }

    // Blockers
    if (context.blockers?.length > 0) {
      response += `\n**🚫 Blocked (${context.blockers.length})**\n`;
      for (const blocker of context.blockers.slice(0, 3)) {
        response += `• ${blocker.title}: ${blocker.blockedReason || 'No reason given'}\n`;
      }
    }

    // Priority conflicts
    const conflicts = await PriorityService.getPriorityConflictSummary(teamId);
    if (conflicts.hasConflicts) {
      response += `\n⚡ ${conflicts.summary}\n`;
    }

    response += `\n${context.summary || ''}`;

    return {
      responseText: response,
      metadata: { command: 'work_status', goalCount: context.goals?.length || 0 }
    };
  } catch (error) {
    console.error('Work status error:', error);
    return { responseText: `Error getting status: ${error.message}` };
  }
}

/**
 * Handle "@raven prioritize" - suggest what to work on
 */
async function handlePrioritize(teamId, userId) {
  try {
    const queue = await PriorityService.getPriorityQueue(teamId, userId, { limit: 5 });
    const suggestions = await PriorityService.suggestPriorities(teamId);

    let response = '**Priority Queue** (What to work on next)\n\n';

    if (queue.length === 0) {
      response += 'No open tasks. Create one with `@raven task [description]`';
    } else {
      queue.forEach((item, i) => {
        const priorityEmoji = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '⚪'
        }[item.effectivePriorityLabel] || '⚪';
        const blockedTag = item.isBlocked ? ' 🚫' : '';
        const conflictTag = item.hasPriorityConflict ? ' ⚡' : '';
        response += `${i + 1}. ${priorityEmoji} **${item.title}**${blockedTag}${conflictTag}\n`;
        if (item.goalNames) response += `   → ${item.goalNames}\n`;
      });
    }

    if (suggestions.suggestions.length > 0) {
      response += `\n**💡 Suggestions**\n`;
      suggestions.suggestions.slice(0, 3).forEach(s => {
        response += `• ${s.reason}\n`;
      });
    }

    return {
      responseText: response,
      metadata: { command: 'prioritize', taskCount: queue.length }
    };
  } catch (error) {
    console.error('Prioritize error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "@raven priority queue" - show priority-ordered tasks
 */
async function handlePriorityQueue(teamId, userId) {
  try {
    const queue = await PriorityService.getPriorityQueue(teamId, userId, { limit: 10 });

    if (queue.length === 0) {
      return { responseText: 'No open tasks in the queue.' };
    }

    let response = '**Priority Queue**\n\n';
    queue.forEach((item, i) => {
      const score = (item.effectiveScore * 100).toFixed(0);
      const priorityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '⚪'
      }[item.effectivePriorityLabel] || '⚪';
      response += `${i + 1}. ${priorityEmoji} [${score}] **${item.title}**\n`;
    });

    return {
      responseText: response,
      metadata: { command: 'priority_queue', count: queue.length }
    };
  } catch (error) {
    console.error('Priority queue error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "@raven what's blocking [goal]" - show blockers
 */
async function handleShowBlockers(target, teamId, userId) {
  try {
    const context = await WorkContextService.getWorkContext(teamId, userId);
    const blockers = context.blockers || [];

    if (blockers.length === 0) {
      return { responseText: '✅ No blocked tasks. Everything is flowing!' };
    }

    let response = `**🚫 Blocked Tasks (${blockers.length})**\n\n`;
    blockers.forEach(b => {
      response += `• **${b.title}**\n`;
      response += `  Reason: ${b.blockedReason || 'Not specified'}\n`;
      if (b.blockedBy) response += `  Blocked by: ${b.blockedByName || 'Unknown'}\n`;
      response += '\n';
    });

    return {
      responseText: response,
      metadata: { command: 'show_blockers', count: blockers.length }
    };
  } catch (error) {
    console.error('Show blockers error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "@raven health of [goal]" - show goal health
 */
async function handleGoalHealth(target, teamId) {
  try {
    // Try to find the goal by name
    const goals = await GoalService.getGoals(teamId, 'active');
    const goal = goals.find(g =>
      g.title.toLowerCase().includes(target.toLowerCase())
    );

    if (!goal) {
      return { responseText: `Goal "${target}" not found. Available goals:\n${goals.map(g => `• ${g.title}`).join('\n')}` };
    }

    const health = await WorkContextService.computeGoalHealth(goal.id);

    const statusEmoji = {
      on_track: '🟢',
      at_risk: '🟡',
      blocked: '🔴',
      behind: '🟠'
    }[health.status] || '⚪';

    let response = `**${goal.title}** ${statusEmoji}\n\n`;
    response += `**Health Score:** ${health.score}/100\n`;
    response += `**Progress:** ${health.progress}% (${health.completedCount}/${health.taskCount} tasks)\n`;
    response += `**Status:** ${health.status.replace('_', ' ')}\n`;

    if (health.blockedCount > 0) {
      response += `\n⚠️ **${health.blockedCount} blocked** tasks\n`;
    }
    if (health.overdueCount > 0) {
      response += `⚠️ **${health.overdueCount} overdue** tasks\n`;
    }

    if (health.riskFactors?.length > 0) {
      response += `\n**Risk Factors:**\n`;
      health.riskFactors.forEach(r => {
        response += `• ${r}\n`;
      });
    }

    return {
      responseText: response,
      metadata: { command: 'goal_health', goalId: goal.id, health }
    };
  } catch (error) {
    console.error('Goal health error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "@raven priority conflicts" - show priority mismatches
 */
async function handlePriorityConflicts(teamId) {
  try {
    const conflicts = await PriorityService.getPriorityConflictSummary(teamId);

    if (!conflicts.hasConflicts) {
      return { responseText: '✅ No priority conflicts. Task priorities are aligned with goals.' };
    }

    let response = `**⚡ Priority Conflicts (${conflicts.conflictCount})**\n\n`;
    response += `${conflicts.summary}\n\n`;

    conflicts.conflicts.slice(0, 5).forEach(c => {
      response += `• **${c.taskTitle}** (${c.taskPriority})\n`;
      response += `  → Goal "${c.goalTitle}" is ${c.goalPriority}\n`;
      response += `  💡 ${c.suggestion}\n\n`;
    });

    if (conflicts.conflicts.length > 5) {
      response += `...and ${conflicts.conflicts.length - 5} more conflicts\n`;
    }

    return {
      responseText: response,
      metadata: { command: 'priority_conflicts', ...conflicts }
    };
  } catch (error) {
    console.error('Priority conflicts error:', error);
    return { responseText: `Error: ${error.message}` };
  }
}

/**
 * Handle "@raven link [fact/decision] to [task/goal]"
 */
async function handleLinkKnowledge(content, teamId, userId) {
  // This is a complex operation that requires parsing the content
  // For now, return a helpful message about how to do it via UI
  return {
    responseText: `To link knowledge to work items, use the task or goal detail view in the dashboard.

**Linking via commands coming soon!**

In the meantime, you can:
1. Open a task → Link Knowledge panel
2. Open a goal → Related Knowledge section
3. Or use the GraphQL mutation: \`linkKnowledgeToTask\``,
    metadata: { command: 'link_knowledge' }
  };
}

/**
 * Handle "@raven research for [task/goal]"
 */
async function handleResearchFor(target, teamId, userId) {
  // Create a learning objective linked to the specified work item
  return {
    responseText: `To start research for a specific task or goal:

1. Use \`@raven research [topic]\` to start general research
2. Then link it to your work item in the Learning Objectives panel

**Direct linking coming soon!**`,
    metadata: { command: 'research_for', target }
  };
}

// ============================================================================
// UX PREFERENCES HANDLERS (AI-controlled personalization)
// ============================================================================

/**
 * Handle "@raven hide [nav item]"
 */
async function handleUXHide(item, teamId, userId) {
  try {
    const result = await UXPreferencesService.hideNavItem(teamId, userId, item);
    return {
      responseText: result.success ? result.message : `Sorry, I couldn't hide that: ${result.error}`,
      metadata: { command: 'ux_hide', item, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't hide that item. Try something like "@raven hide calendar".`,
      metadata: { command: 'ux_hide', error: error.message }
    };
  }
}

/**
 * Handle "@raven show [nav item]"
 */
async function handleUXShow(item, teamId, userId) {
  try {
    const result = await UXPreferencesService.showNavItem(teamId, userId, item);
    return {
      responseText: result.success ? result.message : `Sorry, I couldn't show that: ${result.error}`,
      metadata: { command: 'ux_show', item, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't show that item. Try something like "@raven show calendar".`,
      metadata: { command: 'ux_show', error: error.message }
    };
  }
}

/**
 * Handle "@raven put [item] before [other]" or "@raven put [item] at the top"
 */
async function handleUXMove(content, teamId, userId) {
  try {
    // Parse "tasks before goals" or "tasks at the top"
    const beforeMatch = content.match(/^(.+?)\s+before\s+(.+)$/i);
    const topMatch = content.match(/^(.+?)\s+(at the top|first)$/i);

    let item, beforeItem;
    if (beforeMatch) {
      item = beforeMatch[1].trim();
      beforeItem = beforeMatch[2].trim();
    } else if (topMatch) {
      item = topMatch[1].trim();
      beforeItem = null; // null means move to top
    } else {
      return {
        responseText: `I didn't quite understand. Try:
• "@raven put tasks before goals" - Move Tasks above Goals
• "@raven put calendar at the top" - Move Calendar to the top`,
        metadata: { command: 'ux_move' }
      };
    }

    const result = await UXPreferencesService.moveNavItem(teamId, userId, item, beforeItem);
    return {
      responseText: result.success ? result.message : `Sorry, I couldn't move that: ${result.error}`,
      metadata: { command: 'ux_move', item, beforeItem, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't move that item. Try "@raven put tasks before goals".`,
      metadata: { command: 'ux_move', error: error.message }
    };
  }
}

/**
 * Handle "@raven compact view" / "@raven spacious view"
 */
async function handleUXDensity(density, teamId, userId) {
  try {
    const result = await UXPreferencesService.setDensity(teamId, userId, density);
    return {
      responseText: result.success
        ? `${result.message} - more ${density === 'compact' ? 'items visible' : density === 'spacious' ? 'breathing room' : 'balanced spacing'}.`
        : result.error,
      metadata: { command: 'ux_density', density, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't change the view density.`,
      metadata: { command: 'ux_density', error: error.message }
    };
  }
}

/**
 * Handle "@raven disable animations" / "@raven enable animations"
 */
async function handleUXAnimations(enabled, teamId, userId) {
  try {
    const result = await UXPreferencesService.setAnimations(teamId, userId, enabled);
    return {
      responseText: result.message,
      metadata: { command: 'ux_animations', enabled, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't change the animation setting.`,
      metadata: { command: 'ux_animations', error: error.message }
    };
  }
}

/**
 * Handle "@raven hide badges" / "@raven show badges"
 */
async function handleUXBadges(enabled, teamId, userId) {
  try {
    const result = await UXPreferencesService.setBadges(teamId, userId, enabled);
    return {
      responseText: result.message,
      metadata: { command: 'ux_badges', enabled, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't change the badge setting.`,
      metadata: { command: 'ux_badges', error: error.message }
    };
  }
}

/**
 * Handle "@raven hide ai summaries" / "@raven show ai summaries"
 */
async function handleUXAISummaries(enabled, teamId, userId) {
  try {
    const result = await UXPreferencesService.setAISummaries(teamId, userId, enabled);
    return {
      responseText: result.message,
      metadata: { command: 'ux_ai_summaries', enabled, success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't change the AI summaries setting.`,
      metadata: { command: 'ux_ai_summaries', error: error.message }
    };
  }
}

/**
 * Handle "@raven simplify my view"
 */
async function handleUXSimplify(teamId, userId) {
  try {
    const result = await UXPreferencesService.simplifyView(teamId, userId);
    return {
      responseText: result.message,
      metadata: { command: 'ux_simplify', success: result.success }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't simplify your view. Try again later.`,
      metadata: { command: 'ux_simplify', error: error.message }
    };
  }
}

/**
 * Handle "@raven reset my preferences"
 */
async function handleUXReset(teamId, userId) {
  try {
    await UXPreferencesService.resetUserPreferences(teamId, userId);
    return {
      responseText: `Done! Your preferences have been reset to team defaults. Your sidebar should look like everyone else's now.`,
      metadata: { command: 'ux_reset', success: true }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't reset your preferences.`,
      metadata: { command: 'ux_reset', error: error.message }
    };
  }
}

/**
 * Handle "@raven what have i hidden"
 */
async function handleUXListHidden(teamId, userId) {
  try {
    const hidden = await UXPreferencesService.getHiddenItems(teamId, userId);
    if (hidden.length === 0) {
      return {
        responseText: `You haven't hidden any sidebar items. Everything is visible!`,
        metadata: { command: 'ux_list_hidden', hidden: [] }
      };
    }

    const itemNames = {
      digest: 'Digest', raven: 'Raven', channels: 'Channels', tasks: 'Tasks',
      goals: 'Goals', projects: 'Projects', calendar: 'Calendar',
      insights: 'AI Insights', team: 'Team', knowledge: 'Knowledge'
    };

    const hiddenNames = hidden.map(item => itemNames[item] || item).join(', ');
    return {
      responseText: `You've hidden: **${hiddenNames}**

To show any of these again, say "@raven show [item name]".`,
      metadata: { command: 'ux_list_hidden', hidden }
    };
  } catch (error) {
    return {
      responseText: `Sorry, I couldn't check your hidden items.`,
      metadata: { command: 'ux_list_hidden', error: error.message }
    };
  }
}

export default {
  sendMessage,
  sendThreadMessage,
  getMessages
};
