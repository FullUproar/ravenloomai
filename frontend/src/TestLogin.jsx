import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';

/**
 * TestLogin - Automatic login for Playwright tests
 *
 * Usage: Navigate to /test-login
 * Automatically signs in with test credentials and redirects to dashboard
 */
export default function TestLogin() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Authenticating...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const testEmail = 'shawnoahpollock@gmail.com';
    const testPassword = '$$TESTaccount';

    const autoLogin = async () => {
      try {
        setStatus('Signing in with test credentials...');

        // Sign in with Firebase
        await signInWithEmailAndPassword(auth, testEmail, testPassword);

        setStatus('✅ Login successful! Redirecting...');

        // Wait a bit for Firebase auth state to propagate
        setTimeout(() => {
          navigate('/');
        }, 1000);

      } catch (err) {
        console.error('Test login error:', err);
        setError(err.message);
        setStatus('❌ Login failed');
      }
    };

    autoLogin();
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0D0D0D',
      color: '#D9D9E3',
      fontFamily: "'Inter', sans-serif",
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '500px',
        textAlign: 'center'
      }}>
        <h1 style={{
          color: '#5D4B8C',
          marginBottom: '2rem',
          fontSize: '2rem'
        }}>
          RavenLoom Test Login
        </h1>

        <div style={{
          padding: '2rem',
          backgroundColor: '#1A1A1A',
          borderRadius: '12px',
          border: '2px solid #2D2D40'
        }}>
          <div style={{
            fontSize: '1.2rem',
            marginBottom: '1rem',
            color: error ? '#FF6B6B' : '#9D8BCC'
          }}>
            {status}
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#2A1515',
              borderRadius: '8px',
              color: '#FF6B6B',
              fontSize: '0.9rem',
              textAlign: 'left'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div style={{
            marginTop: '2rem',
            fontSize: '0.85rem',
            color: '#666'
          }}>
            This page automatically signs in with test credentials.
            <br />
            Only use for automated testing.
          </div>
        </div>
      </div>
    </div>
  );
}
