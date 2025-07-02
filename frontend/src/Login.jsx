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
    <div style={{ padding: '2rem', color: '#D9D9E3', fontFamily: 'Inter, sans-serif' }}>
      <h2>{mode === 'signup' ? 'Create Account' : 'Log In'}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 300 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" style={{ background: '#3A8DFF', color: '#fff', padding: '0.5rem' }}>
          {mode === 'signup' ? 'Sign Up' : 'Log In'}
        </button>
      </form>
      {error && <p style={{ color: '#FF6F59' }}>{error}</p>}
      <p>
        {mode === 'signup' ? 'Already have an account?' : 'Need to create one?'}{' '}
        <button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
          {mode === 'signup' ? 'Log In' : 'Sign Up'}
        </button>
      </p>
    </div>
  );
}

export default Login;
