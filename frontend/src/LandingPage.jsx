import strings from './strings.js';

/**
 * Public landing page for RavenLoom
 * Visible without login - meets Google OAuth verification requirements
 */
function LandingPage({ onGetStarted }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0D0D',
      color: '#D9D9E3',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <header style={{
        background: '#1A1A1A',
        borderBottom: '2px solid #2D2D40',
        padding: '1.5rem 2rem'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.5rem',
            color: '#5D4B8C',
            fontFamily: 'Cinzel, serif',
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem'
          }}>
            <img src="/web-app-manifest-192x192.png" alt="RavenLoom Logo" style={{ width: '60px', height: '60px' }} />
            RavenLoom
          </h1>
          <button
            onClick={onGetStarted}
            style={{
              background: '#5D4B8C',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1 }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '4rem 2rem'
        }}>
          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <div style={{ marginBottom: '2rem' }}>
              <img src="/web-app-manifest-192x192.png" alt="RavenLoom Logo" style={{ width: '120px', height: '120px' }} />
            </div>
            <h1 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              color: '#5D4B8C',
              marginBottom: '1rem'
            }}>
              {strings.app.name}
            </h1>
            <p style={{
              fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
              color: '#aaa',
              marginBottom: '2rem',
              maxWidth: '800px',
              margin: '0 auto 2rem'
            }}>
              {strings.app.tagline}
            </p>
            <button
              onClick={onGetStarted}
              style={{
                background: '#5D4B8C',
                color: '#fff',
                padding: '1rem 2rem',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1.1rem',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Get Started Free
            </button>
          </div>

          {/* Features */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem',
            marginBottom: '4rem'
          }}>
            <FeatureCard
              title="AI-Powered Project Management"
              description="Organize your projects with intelligent AI assistance that adapts to your workflow and helps you achieve your goals."
            />
            <FeatureCard
              title="Personalized AI Coaches"
              description="Get customized guidance from AI personas designed to match your specific needs and communication preferences."
            />
            <FeatureCard
              title="Smart Task Tracking"
              description="Keep track of tasks, deadlines, and progress with intelligent reminders and insights powered by AI."
            />
          </div>

          {/* How It Works */}
          <div style={{ marginBottom: '4rem' }}>
            <h2 style={{
              textAlign: 'center',
              color: '#5D4B8C',
              fontSize: '2rem',
              marginBottom: '2rem'
            }}>
              How It Works
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '2rem'
            }}>
              <Step number="1" title="Sign In" description="Use your Google account to get started quickly and securely" />
              <Step number="2" title="Create Projects" description="Set up your projects and describe your goals" />
              <Step number="3" title="Get AI Assistance" description="Work with personalized AI coaches to achieve your objectives" />
            </div>
          </div>

          {/* Data Usage */}
          <div style={{
            background: '#1A1A1A',
            border: '2px solid #2D2D40',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '4rem'
          }}>
            <h2 style={{
              color: '#5D4B8C',
              fontSize: '1.5rem',
              marginTop: 0
            }}>
              How We Use Your Google Data
            </h2>
            <p style={{ color: '#aaa', lineHeight: '1.6' }}>
              RavenLoom uses Google Sign-In to authenticate users securely. We only request access to your basic profile information
              (name and email address) to create and maintain your account. We do not access, store, or share any other Google data.
            </p>
            <p style={{ color: '#aaa', lineHeight: '1.6', marginBottom: 0 }}>
              Your project data, tasks, and AI interactions are stored securely and are never shared with third parties.
              See our <a href="/privacy" style={{ color: '#5D4B8C', textDecoration: 'underline' }}>Privacy Policy</a> for complete details.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        background: '#1A1A1A',
        borderTop: '2px solid #2D2D40',
        padding: '1.5rem 2rem',
        marginTop: 'auto',
        textAlign: 'center',
        color: '#888',
        fontSize: '0.875rem'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '2rem',
            flexWrap: 'wrap'
          }}>
            <a
              href="/privacy"
              style={{
                color: '#888',
                textDecoration: 'none',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.color = '#5D4B8C'}
              onMouseLeave={(e) => e.target.style.color = '#888'}
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              style={{
                color: '#888',
                textDecoration: 'none',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.color = '#5D4B8C'}
              onMouseLeave={(e) => e.target.style.color = '#888'}
            >
              Terms of Service
            </a>
          </div>
          <div style={{ color: '#666' }}>
            {strings.footer.copyright(new Date().getFullYear())}
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }) {
  return (
    <div style={{
      background: '#1A1A1A',
      border: '2px solid #2D2D40',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <h3 style={{
        color: '#5D4B8C',
        fontSize: '1.3rem',
        marginTop: 0,
        marginBottom: '1rem'
      }}>
        {title}
      </h3>
      <p style={{
        color: '#aaa',
        lineHeight: '1.6',
        marginBottom: 0
      }}>
        {description}
      </p>
    </div>
  );
}

function Step({ number, title, description }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: '#5D4B8C',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        margin: '0 auto 1rem'
      }}>
        {number}
      </div>
      <h3 style={{
        color: '#D9D9E3',
        fontSize: '1.2rem',
        marginBottom: '0.5rem'
      }}>
        {title}
      </h3>
      <p style={{
        color: '#aaa',
        lineHeight: '1.6',
        marginBottom: 0
      }}>
        {description}
      </p>
    </div>
  );
}

export default LandingPage;
