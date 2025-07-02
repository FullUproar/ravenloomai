import { gql, useQuery } from '@apollo/client';

const GET_PLAN = gql`
  query {
    getPlan(userId: "test-user-001") {
      businessName
      description
    }
  }
`;

function App() {
  const { loading, error, data } = useQuery(GET_PLAN);

  if (loading) return <p>Loading...</p>;

  if (error) {
    console.error('GraphQL error:', error);
    return <p>Error: {error.message}</p>;
  }

  if (!data || !data.getPlan) {
    return <p>No plan data returned.</p>;
  }

  const { businessName, description } = data.getPlan;

  return (
    <main style={{ padding: '2rem' }}>
      <h1>{businessName}</h1>
      <p>{description}</p>
    </main>
  );
}

export default App;
