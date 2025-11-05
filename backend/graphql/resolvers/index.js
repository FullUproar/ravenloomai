/**
 * Combined GraphQL Resolvers
 *
 * Merges all resolver modules into a single resolver object.
 */

import personaResolvers from './personaResolvers.js';
import personaNameResolvers from './personaNameResolvers.js';
import conversationResolvers from './conversationResolvers.js';
import projectResolvers from './projectResolvers.js';
import taskResolvers from './taskResolvers.js';
import goalResolvers from './goalResolvers.js';
import memoryResolvers from './memoryResolvers.js';
import sharingResolvers from './sharingResolvers.js';
import { GraphQLJSON } from 'graphql-type-json';
import { GraphQLDateTime } from 'graphql-scalars';

// Merge resolvers
const resolvers = {
  // Custom scalars
  JSON: GraphQLJSON,
  DateTime: GraphQLDateTime,

  // Queries
  Query: {
    ...personaResolvers.Query,
    ...personaNameResolvers.Query,
    ...conversationResolvers.Query,
    ...projectResolvers.Query,
    ...taskResolvers.Query,
    ...goalResolvers.Query,
    ...memoryResolvers.Query,
    ...sharingResolvers.Query
  },

  // Mutations
  Mutation: {
    ...personaResolvers.Mutation,
    ...personaNameResolvers.Mutation,
    ...conversationResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...taskResolvers.Mutation,
    ...goalResolvers.Mutation,
    ...memoryResolvers.Mutation,
    ...sharingResolvers.Mutation
  },

  // Type resolvers
  Persona: personaResolvers.Persona,
  Conversation: conversationResolvers.Conversation,
  Project: projectResolvers.Project,
  Goal: goalResolvers.Goal
};

export default resolvers;
