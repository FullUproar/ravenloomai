import { useState, useEffect } from 'react';
import { auth } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider
} from 'firebase/auth';

function Login({ onLogin, onSignInStart }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'signup'
  const [error, setError] = useState('');

  // Detect if running in a native app (Capacitor)
  const isNativeApp = window.Capacitor !== undefined;

  // Check for redirect result on mount (for both mobile and web auth)
  useEffect(() => {
    console.log('=== Checking for redirect result ===');
    console.log('Current URL:', window.location.href);
    console.log('URL params:', window.location.search);

    // Check if we initiated a redirect in a previous session
    const redirectInitiated = sessionStorage.getItem('googleRedirectInitiated');
    if (redirectInitiated) {
      console.log('🔄 We initiated a redirect at:', redirectInitiated);
      console.log('Now checking for the result...');
    }

    getRedirectResult(auth)
      .then((result) => {
        console.log('getRedirectResult response:', result);
        if (result?.user) {
          console.log('✅ Redirect auth successful:', result.user);
          console.log('User email:', result.user.email);
          console.log('User uid:', result.user.uid);
          sessionStorage.removeItem('googleRedirectInitiated'); // Clear flag on success
          // Don't call onLogin - onAuthStateChanged will handle it
        } else {
          if (redirectInitiated) {
            console.error('❌ CRITICAL: Redirect was initiated but result is null!');
            console.error('This indicates the redirect failed or was blocked.');
            sessionStorage.removeItem('googleRedirectInitiated'); // Clear the flag
            setError('Sign-in failed. The redirect to Google may have been blocked. Try incognito mode or check Firebase Console authorized domains.');
          } else {
            console.log('No redirect result (user probably just loaded the page)');
          }
        }
      })
      .catch((err) => {
        console.error('❌ Redirect auth error:', err);
        console.error('Error code:', err.code);
        console.error('Error message:', err.message);
        console.error('Full error object:', err);
        sessionStorage.removeItem('googleRedirectInitiated'); // Clear flag on error
        // Always show the error to help debug
        setError(`Auth error: ${err.code} - ${err.message}`);
      });
  }, []);

  // Quick test login bypass
  const handleTestLogin = () => {
    onLogin({ uid: 'test-user-123', email: 'test@example.com' });
  };

  // Google Sign-In
  const handleGoogleSignIn = async (e) => {
    e?.preventDefault(); // Prevent any default behavior
    setError('');
    console.log('=== Google Sign-In Started ===');
    console.log('isNativeApp:', isNativeApp);

    // Notify parent that sign-in is starting
    console.log('Calling onSignInStart...');
    onSignInStart?.();
    console.log('onSignInStart called');

    try {
      const provider = new GoogleAuthProvider();

      // Force account selection - this ensures user always sees the account picker
      // even if they're already signed in. This prevents issues with stale sessions.
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      // Use redirect for native, popup for web
      // Popup works better for web because it doesn't have cross-domain redirect issues
      if (isNativeApp) {
        console.log('Using signInWithRedirect for native app');
        sessionStorage.setItem('googleRedirectInitiated', new Date().toISOString());
        await signInWithRedirect(auth, provider);
      } else {
        console.log('Using signInWithPopup for web');
        const result = await signInWithPopup(auth, provider);
        console.log('✅ Popup auth successful:', result.user);
        // Don't call onLogin - onAuthStateChanged will handle it
      }
    } catch (err) {
      console.error('=== Google sign-in error ===');
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Full error:', err);

      // Reset signing-in state in parent on error
      // We need to pass this callback from App.jsx
      console.log('Resetting signing-in state...');
      if (window.resetSigningIn) {
        window.resetSigningIn();
      }

      // Show user-friendly error messages
      if (err.code === 'auth/popup-blocked') {
        setError('Popup was blocked. Please allow popups for this site and try again.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // This happens when user clicks button multiple times - ignore it
        console.log('Duplicate popup request cancelled');
      } else {
        setError(err.message);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Don't call onLogin - onAuthStateChanged will handle it
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

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            style={{
              width: '100%',
              background: '#fff',
              color: '#333',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.183l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{
            textAlign: 'center',
            color: '#666',
            margin: '1rem 0',
            position: 'relative'
          }}>
            <span style={{
              background: '#1A1A1A',
              padding: '0 1rem',
              position: 'relative',
              zIndex: 1
            }}>or</span>
            <hr style={{
              border: 'none',
              borderTop: '1px solid #333',
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              zIndex: 0
            }} />
          </div>

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
