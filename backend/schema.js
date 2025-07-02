import { gql } from 'apollo-server';

export default gql`
  type Plan {
    id: ID!
    userId: String!
    businessName: String
    description: String
    productOrService: String
  }

  type Query {
    getPlan(userId: String!): Plan
  }

  input PlanInput {
    businessName: String
    description: String
    productOrService: String
  }

  type Mutation {
    savePlan(userId: String!, input: PlanInput!): Plan
    chat(userId: String!, message: String!): ChatReply
  }

  type ChatReply {
    reply: String
  }
`;
