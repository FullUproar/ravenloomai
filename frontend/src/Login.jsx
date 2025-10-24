import { useState } from 'react';
import { auth } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'signup'
  const [error, setError] = useState('');

  // Quick test login bypass
  const handleTestLogin = () => {
    onLogin({ uid: 'test-user-123', email: 'test@example.com' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const userCred = mode === 'signup'
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);

      onLogin(userCred.user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{
      padding: '2rem',
      color: '#D9D9E3',
      fontFamily: 'Inter, sans-serif',
      backgroundColor: '#0D0D0D',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <h1 style={{
          textAlign: 'center',
          color: '#5D4B8C',
          fontFamily: 'Cinzel, serif',
          marginBottom: '2rem'
        }}>
          🪶 RavenLoom
        </h1>

        <div style={{
          background: '#1A1A1A',
          padding: '2rem',
          borderRadius: '12px',
          border: '2px solid #2D2D40'
        }}>
          <h2 style={{ marginTop: 0 }}>{mode === 'signup' ? 'Create Account' : 'Log In'}</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: '0.75rem',
                background: '#0D0D0D',
                border: '1px solid #333',
                borderRadius: '6px',
                color: '#D9D9E3',
                fontSize: '1rem'
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                padding: '0.75rem',
                background: '#0D0D0D',
                border: '1px solid #333',
                borderRadius: '6px',
                color: '#D9D9E3',
                fontSize: '1rem'
              }}
            />
            <button type="submit" style={{
              background: '#5D4B8C',
              color: '#fff',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}>
              {mode === 'signup' ? 'Sign Up' : 'Log In'}
            </button>
          </form>

          {error && <p style={{ color: '#FF6F59', marginTop: '1rem' }}>{error}</p>}

          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#888' }}>
            {mode === 'signup' ? 'Already have an account?' : 'Need to create one?'}{' '}
            <button
              onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
              style={{
                background: 'none',
                border: 'none',
                color: '#5D4B8C',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {mode === 'signup' ? 'Log In' : 'Sign Up'}
            </button>
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '1.5rem 0' }} />

          <button
            onClick={handleTestLogin}
            style={{
              width: '100%',
              background: '#2D2D40',
              color: '#9D8BCC',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            🧪 Continue as Test User
          </button>
          <p style={{
            textAlign: 'center',
            fontSize: '0.85rem',
            color: '#666',
            marginTop: '0.5rem',
            marginBottom: 0
          }}>
            Skip authentication for testing
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
