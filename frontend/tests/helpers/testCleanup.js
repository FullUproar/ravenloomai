/**
 * Test Cleanup Utilities
 *
 * Handles periodic cleanup of test data to prevent database bloat
 */

import { request } from '@playwright/test';

/**
 * Delete all projects for a test user
 */
export async function deleteAllUserProjects(userId, apiUrl = 'http://localhost:5001/graphql') {
  const context = await request.newContext();

  const query = `
    query GetProjects($userId: String!) {
      getProjects(userId: $userId) {
        id
      }
    }
  `;

  try {
    // Get all projects
    const response = await context.post(apiUrl, {
      data: {
        query,
        variables: { userId }
      }
    });

    const result = await response.json();
    const projects = result.data?.getProjects || [];

    // Delete each project
    for (const project of projects) {
      const deleteMutation = `
        mutation DeleteProject($projectId: ID!) {
          deleteProject(projectId: $projectId)
        }
      `;

      await context.post(apiUrl, {
        data: {
          query: deleteMutation,
          variables: { projectId: project.id }
        }
      });
    }

    console.log(`[Cleanup] Deleted ${projects.length} projects for user ${userId}`);
    return projects.length;
  } catch (error) {
    console.error('[Cleanup] Error deleting projects:', error);
    return 0;
  } finally {
    await context.dispose();
  }
}

/**
 * Clean up old test projects (older than specified hours)
 */
export async function cleanupOldProjects(userId, hoursOld = 24, apiUrl = 'http://localhost:5001/graphql') {
  const context = await request.newContext();

  // This would require a backend mutation to delete by age
  // For now, we'll just delete all test projects
  return await deleteAllUserProjects(userId, apiUrl);
}

/**
 * Reset test user state completely
 */
export async function resetTestUser(userId, apiUrl = 'http://localhost:5001/graphql') {
  console.log(`[Cleanup] Resetting test user ${userId}...`);

  const deleted = await deleteAllUserProjects(userId, apiUrl);

  console.log(`[Cleanup] Test user ${userId} reset complete. Deleted ${deleted} projects.`);
  return { projectsDeleted: deleted };
}

/**
 * Cleanup function to run after each test
 */
export async function afterEachTest(userId) {
  // Optional: Delete projects after each test
  // Disabled by default to allow inspection
  if (process.env.CLEANUP_AFTER_EACH === 'true') {
    await deleteAllUserProjects(userId);
  }
}

/**
 * Cleanup function to run after all tests
 */
export async function afterAllTests(userId) {
  if (process.env.CLEANUP_AFTER_ALL !== 'false') {
    await deleteAllUserProjects(userId);
  }
}

export default {
  deleteAllUserProjects,
  cleanupOldProjects,
  resetTestUser,
  afterEachTest,
  afterAllTests
};
