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
import { gql, useMutation } from '@apollo/client';

const REDEEM_ACCESS_CODE = gql`
  mutation RedeemAccessCode($code: String!, $email: String!) {
    redeemAccessCode(code: $code, email: $email) {
      valid
      message
      teamId
      teamName
    }
  }
`;

function Login({ onSignInStart }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // or 'signup'
  const [error, setError] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [accessCodeValidated, setAccessCodeValidated] = useState(false);

  const [redeemAccessCode] = useMutation(REDEEM_ACCESS_CODE);

  // Detect if running in a native app (Capacitor)
  // Note: window.Capacitor exists in web too due to imports, so we need to check isNativePlatform()
  const isNativeApp = window.Capacitor?.isNativePlatform?.() || false;

  // Check for redirect result on mount (for both mobile and web auth)
  useEffect(() => {
    // Display persistent debug logs
    const debugLogs = sessionStorage.getItem('authDebugLogs');
    if (debugLogs) {
      console.log('📋 PERSISTENT DEBUG LOGS FROM PREVIOUS SESSION:');
      JSON.parse(debugLogs).forEach(log => console.log(log));
    }

    console.log('=== Checking for redirect result ===');
    console.log('Current URL:', window.location.href);
    console.log('URL params:', window.location.search);
    console.log('isNativeApp:', isNativeApp);

    // Check if we initiated a redirect in a previous session
    const redirectInitiated = sessionStorage.getItem('googleRedirectInitiated');

    // If we're on web (not native) and there's a redirect flag, clear it
    // because we use popup auth on web now
    if (!isNativeApp && redirectInitiated) {
      console.log('⚠️ Found old redirect flag from previous session, clearing it (we use popup auth on web now)');
      sessionStorage.removeItem('googleRedirectInitiated');
      return; // Don't check for redirect result
    }

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


  // Google Sign-In
  const handleGoogleSignIn = async (e) => {
    e?.preventDefault(); // Prevent any default behavior
    setError('');

    // Log to sessionStorage so we can see what happened even after redirects
    const logToSession = (msg) => {
      const logs = JSON.parse(sessionStorage.getItem('authDebugLogs') || '[]');
      logs.push(`${new Date().toISOString()}: ${msg}`);
      sessionStorage.setItem('authDebugLogs', JSON.stringify(logs));
      console.log(msg);
    };

    logToSession('=== Google Sign-In Started ===');
    logToSession(`isNativeApp: ${isNativeApp}`);
    logToSession(`window.Capacitor: ${window.Capacitor}`);

    // Notify parent that sign-in is starting
    onSignInStart?.();

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
        logToSession('USING REDIRECT AUTH (native app detected)');
        sessionStorage.setItem('googleRedirectInitiated', new Date().toISOString());
        await signInWithRedirect(auth, provider);
      } else {
        logToSession('USING POPUP AUTH (web browser)');
        logToSession(`Current URL: ${window.location.href}`);
        logToSession(`Auth domain: ${auth.config.authDomain}`);

        try {
          logToSession('Opening popup window...');
          const result = await signInWithPopup(auth, provider);
          logToSession('✅ Popup auth successful!');
          logToSession(`User: ${result.user.email}`);
          // Don't call onLogin - onAuthStateChanged will handle it
        } catch (popupError) {
          logToSession(`❌ Popup auth failed: ${popupError.code} - ${popupError.message}`);

          // Check for specific popup errors
          if (popupError.code === 'auth/popup-blocked') {
            throw new Error('Popup was blocked by your browser. Please allow popups for this site.');
          } else if (popupError.code === 'auth/popup-closed-by-user') {
            throw new Error('Sign-in cancelled.');
          } else if (popupError.code === 'auth/unauthorized-domain') {
            logToSession('🚨 UNAUTHORIZED DOMAIN ERROR');
            throw new Error('Domain not authorized. Please check Firebase Console settings.');
          }

          // Re-throw the error to be caught by outer catch
          throw popupError;
        }
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

  // Validate access code before allowing signup
  const handleValidateAccessCode = async () => {
    if (!accessCode.trim()) {
      setError('Please enter an access code');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email first');
      return;
    }
    setError('');
    try {
      const { data } = await redeemAccessCode({
        variables: { code: accessCode.trim(), email: email.trim() }
      });
      if (data.redeemAccessCode.valid) {
        setAccessCodeValidated(true);
        setError('');
      } else {
        setError(data.redeemAccessCode.message || 'Invalid access code');
      }
    } catch (err) {
      setError(err.message || 'Failed to validate access code');
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

  // Feature data for the landing page
  const features = [
    {
      icon: '💬',
      title: 'Team Chat',
      description: 'Real-time messaging with channels, threads, and direct messages for seamless team communication.'
    },
    {
      icon: '✅',
      title: 'Task Management',
      description: 'Create, assign, and track tasks with priorities, due dates, and status updates across your team.'
    },
    {
      icon: '🤖',
      title: 'AI Assistant (Raven)',
      description: 'Get intelligent help with task creation, summaries, and answers to questions about your projects.'
    },
    {
      icon: '📊',
      title: 'Proactive Insights',
      description: 'AI-powered daily focus plans, smart nudges for overdue tasks, and productivity recommendations.'
    },
    {
      icon: '📅',
      title: 'Calendar Integration',
      description: 'Sync with Google Calendar for meeting prep, scheduling assistance, and time management.'
    },
    {
      icon: '🔒',
      title: 'Secure & Private',
      description: 'Enterprise-grade security with role-based access control and data encryption.'
    }
  ];

  return (
    <div style={{
      color: '#D9D9E3',
      fontFamily: 'Inter, sans-serif',
      backgroundColor: '#0D0D0D',
      minHeight: '100vh'
    }}>
      {/* Header / Navigation */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 2rem',
        borderBottom: '1px solid #1A1A1A'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <img src="/web-app-manifest-192x192.png" alt="RavenLoom Logo" style={{ width: '40px', height: '40px' }} />
          <span style={{
            color: '#5D4B8C',
            fontFamily: 'Cinzel, serif',
            fontSize: '1.5rem',
            fontWeight: 'bold'
          }}>RavenLoom</span>
        </div>
        <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="#features" style={{ color: '#888', textDecoration: 'none' }}>Features</a>
          <a href="#about" style={{ color: '#888', textDecoration: 'none' }}>About</a>
          <a href="#get-started" style={{
            background: '#5D4B8C',
            color: '#fff',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: '500'
          }}>Get Started</a>
        </nav>
      </header>

      {/* Hero Section */}
      <section style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        <h1 style={{
          color: '#5D4B8C',
          fontFamily: 'Cinzel, serif',
          fontSize: '3rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem'
        }}>
          <img src="/web-app-manifest-192x192.png" alt="RavenLoom Logo" style={{ width: '80px', height: '80px' }} />
          RavenLoom
        </h1>
        <p style={{
          fontSize: '1.5rem',
          color: '#B8B8C0',
          marginBottom: '1rem'
        }}>
          AI-Powered Team Productivity Platform
        </p>
        <p style={{
          fontSize: '1.1rem',
          color: '#888',
          maxWidth: '700px',
          margin: '0 auto 2rem',
          lineHeight: '1.6'
        }}>
          RavenLoom combines team chat, task management, and intelligent AI assistance
          to help your team work smarter. Our AI assistant &quot;Raven&quot; provides proactive
          insights, daily focus plans, and smart recommendations to boost productivity.
        </p>
        <a href="#get-started" style={{
          display: 'inline-block',
          background: '#5D4B8C',
          color: '#fff',
          padding: '1rem 2rem',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: '600',
          fontSize: '1.1rem'
        }}>
          Start Free Today
        </a>
      </section>

      {/* Features Section */}
      <section id="features" style={{
        padding: '4rem 2rem',
        backgroundColor: '#111'
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h2 style={{
            textAlign: 'center',
            color: '#D9D9E3',
            fontSize: '2rem',
            marginBottom: '3rem'
          }}>
            Everything Your Team Needs
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem'
          }}>
            {features.map((feature, index) => (
              <div key={index} style={{
                background: '#1A1A1A',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid #2D2D40'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{feature.icon}</div>
                <h3 style={{ color: '#D9D9E3', marginBottom: '0.5rem', fontSize: '1.2rem' }}>{feature.title}</h3>
                <p style={{ color: '#888', lineHeight: '1.5', margin: 0 }}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" style={{
        padding: '4rem 2rem',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <h2 style={{
          textAlign: 'center',
          color: '#D9D9E3',
          fontSize: '2rem',
          marginBottom: '1.5rem'
        }}>
          Why RavenLoom?
        </h2>
        <div style={{
          color: '#B8B8C0',
          lineHeight: '1.8',
          fontSize: '1.05rem'
        }}>
          <p>
            <strong style={{ color: '#D9D9E3' }}>RavenLoom</strong> is designed for modern teams who want
            to communicate effectively and stay on top of their work without the chaos of scattered tools.
          </p>
          <p>
            Our intelligent AI assistant, <strong style={{ color: '#5D4B8C' }}>Raven</strong>, learns
            your team&apos;s patterns and provides personalized recommendations—from daily focus plans
            each morning to gentle nudges when tasks are at risk of falling behind.
          </p>
          <p>
            Whether you&apos;re a startup team of 5 or a growing organization, RavenLoom scales with
            you while keeping everything organized in one place: conversations, tasks, files, and insights.
          </p>
        </div>
      </section>

      {/* Get Started / Sign Up Section */}
      <section id="get-started" style={{
        padding: '4rem 2rem',
        backgroundColor: '#111'
      }}>
        <div style={{ maxWidth: '450px', margin: '0 auto' }}>
          <h2 style={{
            textAlign: 'center',
            color: '#D9D9E3',
            fontSize: '2rem',
            marginBottom: '0.5rem'
          }}>
            {mode === 'signup' ? 'Join RavenLoom' : 'Welcome Back'}
          </h2>
          <p style={{
            textAlign: 'center',
            color: '#888',
            marginBottom: '2rem'
          }}>
            {mode === 'signup'
              ? 'RavenLoom is currently invite-only. You need an invite or access code to join.'
              : 'Sign in to your existing account.'}
          </p>

          <div style={{
            background: '#1A1A1A',
            padding: '2rem',
            borderRadius: '12px',
            border: '2px solid #2D2D40'
          }}>
            <h3 style={{ marginTop: 0, textAlign: 'center' }}>
              {mode === 'signup' ? 'Create Account' : 'Log In'}
            </h3>

            {/* Show invite-only notice for signup */}
            {mode === 'signup' && !accessCodeValidated && (
              <div style={{
                background: '#2D2D40',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                color: '#B8B8C0'
              }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                  <strong>Invite Required:</strong> New accounts require either:
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  <li>An email invite from an existing member</li>
                  <li>A valid access code</li>
                </ul>
              </div>
            )}

            {/* Access code validated message */}
            {mode === 'signup' && accessCodeValidated && (
              <div style={{
                background: '#1a4d1a',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                color: '#8fdf8f'
              }}>
                Access code validated! You can now sign up.
              </div>
            )}

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

              {/* Access Code Section for Signup */}
              {mode === 'signup' && !accessCodeValidated && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAccessCode(!showAccessCode)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#5D4B8C',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      textAlign: 'left',
                      padding: 0
                    }}
                  >
                    {showAccessCode ? '- Hide access code' : '+ Have an access code?'}
                  </button>
                  {showAccessCode && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Enter access code"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          background: '#0D0D0D',
                          border: '1px solid #5D4B8C',
                          borderRadius: '6px',
                          color: '#D9D9E3',
                          fontSize: '1rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1rem'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleValidateAccessCode}
                        style={{
                          background: '#5D4B8C',
                          color: '#fff',
                          padding: '0.75rem 1rem',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        Validate
                      </button>
                    </div>
                  )}
                </>
              )}

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
                onClick={() => {
                  setMode(mode === 'signup' ? 'login' : 'signup');
                  setError('');
                  setAccessCodeValidated(false);
                  setShowAccessCode(false);
                }}
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
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '2rem',
        borderTop: '1px solid #1A1A1A',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '1rem'
        }}>
          <img src="/web-app-manifest-192x192.png" alt="RavenLoom Logo" style={{ width: '24px', height: '24px' }} />
          <span style={{
            color: '#5D4B8C',
            fontFamily: 'Cinzel, serif',
            fontSize: '1rem'
          }}>RavenLoom</span>
        </div>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          AI-Powered Team Productivity Platform
        </p>
        <div style={{
          color: '#666',
          fontSize: '0.875rem'
        }}>
          <a href="/privacy" style={{ color: '#888', textDecoration: 'none', marginRight: '1rem' }}>
            Privacy Policy
          </a>
          <span style={{ color: '#444' }}>|</span>
          <a href="/terms" style={{ color: '#888', textDecoration: 'none', marginLeft: '1rem' }}>
            Terms of Service
          </a>
        </div>
        <p style={{ color: '#444', fontSize: '0.8rem', marginTop: '1rem' }}>
          © {new Date().getFullYear()} RavenLoom. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default Login;
