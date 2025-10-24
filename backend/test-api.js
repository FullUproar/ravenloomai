/**
 * API Test Script
 *
 * Tests the GraphQL API to validate MVP implementation.
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4013/graphql';

// Helper function to execute GraphQL queries
async function graphqlRequest(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const result = await response.json();

  if (result.errors) {
    console.error('❌ GraphQL Error:', JSON.stringify(result.errors, null, 2));
    throw new Error('GraphQL request failed');
  }

  return result.data;
}

// Test 1: Create a project
async function testCreateProject() {
  console.log('\n📝 Test 1: Creating a project...');

  const query = `
    mutation CreateProject($userId: String!, $input: ProjectInput!) {
      createProject(userId: $userId, input: $input) {
        id
        title
        description
        completionType
        outcome
        createdAt
      }
    }
  `;

  const variables = {
    userId: 'test-user-123',
    input: {
      title: 'Lose 20 pounds',
      description: 'Get healthier and lose weight through better nutrition and exercise',
      completionType: 'milestone',
      outcome: 'Reach 180 lbs and maintain for 2 weeks',
    },
  };

  const data = await graphqlRequest(query, variables);
  console.log('✅ Project created:', data.createProject);
  return data.createProject.id;
}

// Test 2: Create a persona using AI
async function testCreatePersona(projectId) {
  console.log('\n🤖 Test 2: Creating a persona with AI...');

  const query = `
    mutation CreatePersonaFromGoal($projectId: ID!, $userId: String!, $userGoal: String!, $preferences: CommunicationPreferencesInput) {
      createPersonaFromGoal(projectId: $projectId, userId: $userId, userGoal: $userGoal, preferences: $preferences) {
        id
        archetype
        specialization
        displayName
        voice
        interventionStyle
        focusArea
        domainKnowledge
        communicationPreferences {
          tone
          verbosity
          emoji
          platitudes
        }
      }
    }
  `;

  const variables = {
    projectId: parseInt(projectId),
    userId: 'test-user-123',
    userGoal: 'I want to lose 20 pounds. I need someone to keep me accountable and help me build better habits around eating and exercise.',
    preferences: {
      tone: 'direct',
      verbosity: 'concise',
      emoji: false,
      platitudes: false,
    },
  };

  const data = await graphqlRequest(query, variables);
  console.log('✅ Persona created:', data.createPersonaFromGoal);
  return data.createPersonaFromGoal.id;
}

// Test 3: Send a chat message
async function testSendMessage(projectId) {
  console.log('\n💬 Test 3: Sending a chat message...');

  const query = `
    mutation SendMessage($projectId: ID!, $userId: String!, $message: String!) {
      sendMessage(projectId: $projectId, userId: $userId, message: $message) {
        message {
          id
          content
          senderName
          senderType
          createdAt
        }
        persona {
          displayName
          archetype
        }
        conversation {
          id
          topic
        }
      }
    }
  `;

  const variables = {
    projectId: parseInt(projectId),
    userId: 'test-user-123',
    message: 'Hi! I just started this project and I\'m feeling motivated. What should I focus on first?',
  };

  const data = await graphqlRequest(query, variables);
  console.log('✅ User message sent');
  console.log('✅ AI response:', data.sendMessage.message.content);
  console.log('   From:', data.sendMessage.persona.displayName);
  return data.sendMessage.conversation.id;
}

// Test 4: Get conversation history
async function testGetConversation(projectId) {
  console.log('\n📜 Test 4: Getting conversation history...');

  const query = `
    query GetConversation($projectId: ID!, $userId: String!) {
      getConversation(projectId: $projectId, userId: $userId) {
        id
        topic
        status
        messages {
          id
          content
          senderName
          senderType
          createdAt
        }
      }
    }
  `;

  const variables = {
    projectId: parseInt(projectId),
    userId: 'test-user-123',
  };

  const data = await graphqlRequest(query, variables);
  console.log('✅ Conversation retrieved:');
  console.log(`   Topic: ${data.getConversation.topic || 'No topic set'}`);
  console.log(`   Messages: ${data.getConversation.messages.length}`);
  data.getConversation.messages.forEach((msg, i) => {
    console.log(`   ${i + 1}. [${msg.senderType}] ${msg.senderName}: ${msg.content.substring(0, 60)}...`);
  });
}

// Test 5: Create a task
async function testCreateTask(projectId) {
  console.log('\n✅ Test 5: Creating a task...');

  const query = `
    mutation CreateTask($projectId: ID!, $input: TaskInput!) {
      createTask(projectId: $projectId, input: $input) {
        id
        title
        description
        gtdType
        context
        energyLevel
        timeEstimate
        status
      }
    }
  `;

  const variables = {
    projectId: parseInt(projectId),
    input: {
      title: 'Track daily calories for one week',
      description: 'Use MyFitnessPal to log all meals and snacks',
      type: 'manual',
      gtdType: 'next_action',
      context: '@home',
      energyLevel: 'low',
      timeEstimate: 10,
    },
  };

  const data = await graphqlRequest(query, variables);
  console.log('✅ Task created:', data.createTask);
}

// Test 6: Get project with persona
async function testGetProject(projectId) {
  console.log('\n📊 Test 6: Getting project with persona...');

  const query = `
    query GetProject($userId: String!, $projectId: ID!) {
      getProject(userId: $userId, projectId: $projectId) {
        id
        title
        description
        completionType
        outcome
        persona {
          id
          displayName
          archetype
          specialization
        }
        tasks {
          id
          title
          status
          gtdType
          context
        }
      }
    }
  `;

  const variables = {
    userId: 'test-user-123',
    projectId: parseInt(projectId),
  };

  const data = await graphqlRequest(query, variables);
  console.log('✅ Project retrieved:');
  console.log(`   Name: ${data.getProject.title}`);
  console.log(`   Outcome: ${data.getProject.outcome}`);
  console.log(`   Persona: ${data.getProject.persona?.displayName || 'None'}`);
  console.log(`   Tasks: ${data.getProject.tasks.length}`);
}

// Run all tests
async function runTests() {
  console.log('🧪 Starting API Tests...\n');
  console.log('=' .repeat(60));

  try {
    const projectId = await testCreateProject();
    await testCreatePersona(projectId);
    await testSendMessage(projectId);
    await testGetConversation(projectId);
    await testCreateTask(projectId);
    await testGetProject(projectId);

    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 All tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runTests();
