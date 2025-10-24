/**
 * Combined GraphQL Resolvers
 *
 * Merges all resolver modules into a single resolver object.
 */

import personaResolvers from './personaResolvers.js';
import conversationResolvers from './conversationResolvers.js';
import projectResolvers from './projectResolvers.js';
import taskResolvers from './taskResolvers.js';
import memoryResolvers from './memoryResolvers.js';
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
    ...conversationResolvers.Query,
    ...projectResolvers.Query,
    ...taskResolvers.Query,
    ...memoryResolvers.Query
  },

  // Mutations
  Mutation: {
    ...personaResolvers.Mutation,
    ...conversationResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...taskResolvers.Mutation,
    ...memoryResolvers.Mutation
  },

  // Type resolvers
  Persona: personaResolvers.Persona,
  Conversation: conversationResolvers.Conversation,
  Project: projectResolvers.Project
};

export default resolvers;
