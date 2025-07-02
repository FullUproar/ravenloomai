import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

// GraphQL queries/mutations
const GET_PLAN = gql`
  query {
    getPlan(userId: "test-user-001") {
      businessName
      description
    }
  }
`;

const CHAT = gql`
  mutation Chat($userId: String!, $message: String!) {
    chat(userId: $userId, message: $message) {
      reply
    }
  }
`;

function App() {
  const { loading, error, data } = useQuery(GET_PLAN);
  const [sendChat, { loading: chatting }] = useMutation(CHAT);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);

  if (loading) return <p style={{ color: '#ccc' }}>Loading...</p>;
  if (error) return <p style={{ color: '#f88' }}>Error loading plan: {error.message}</p>;

  const { businessName, description } = data.getPlan;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');

    try {
      const res = await sendChat({
        variables: { userId: 'test-user-001', message: userMessage },
      });

      const reply = res.data.chat.reply;
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: "⚠️ Error: " + err.message }]);
    }
  };

  return (
    <main style={{
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ maxWidth: 700, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/ravenloom.png"
            alt="RavenLoom"
            style={{
              width: '96px',
              filter: 'drop-shadow(0 0 6px #5D4B8C)'
            }}
          />
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '2.5rem',
            color: '#5D4B8C',
            marginTop: '1rem',
          }}>
            RavenLoom
          </h1>
        </div>

        <h2 style={{
          fontFamily: "'Cinzel', serif",
          color: '#D9D9E3',
          fontSize: '1.5rem',
          marginBottom: '0.25rem'
        }}>{businessName}</h2>
        <p style={{ color: '#aaa', marginBottom: '2rem' }}>{description}</p>

        <div style={{
          background: '#1A1A1A',
          padding: '1rem',
          borderRadius: '8px',
          maxHeight: '50vh',
          overflowY: 'auto',
          marginBottom: '1rem'
        }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              textAlign: msg.role === 'user' ? 'right' : 'left',
              background: msg.role === 'user' ? '#3A8DFF' : '#2D2D40',
              color: '#fff',
              padding: '0.75rem 1rem',
              borderRadius: '1rem',
              margin: '0.5rem 0',
              maxWidth: '80%',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              {msg.text}
            </div>
          ))}
          {chatting && <div style={{ color: '#888' }}>🤖 Thinking...</div>}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask RavenLoom something..."
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              fontSize: '1rem',
              borderRadius: '1rem 0 0 1rem',
              border: 'none',
              outline: 'none',
              background: '#333',
              color: '#fff'
            }}
          />
          <button type="submit" style={{
            padding: '0.75rem 1.25rem',
            fontSize: '1rem',
            backgroundColor: '#3A8DFF',
            color: '#fff',
            border: 'none',
            borderRadius: '0 1rem 1rem 0',
            cursor: 'pointer'
          }}>
            Send
          </button>
        </form>
      </div>
    </main>
  );
}

export default App;
