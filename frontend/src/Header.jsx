import { useState } from 'react';

function Header({ user, onSignOut }) {
  const [showMenu, setShowMenu] = useState(false);

  const handleSignOut = async () => {
    setShowMenu(false);
    if (onSignOut) {
      await onSignOut();
    }
  };

  // Get user's initials for avatar
  const getInitials = () => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  return (
    <header style={{
      background: '#1A1A1A',
      borderBottom: '2px solid #2D2D40',
      padding: '1rem 2rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '1.5rem',
          color: '#5D4B8C',
          fontFamily: 'Cinzel, serif',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <img src="/favicon.svg" alt="RavenLoom Logo" style={{ width: '32px', height: '32px' }} />
          RavenLoom
        </h1>
      </div>

      {/* User Menu */}
      {user && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            style={{
              background: '#5D4B8C',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#6D5B9C'}
            onMouseLeave={(e) => e.target.style.background = '#5D4B8C'}
          >
            {getInitials()}
          </button>

          {showMenu && (
            <>
              {/* Overlay to close menu when clicking outside */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 99
                }}
                onClick={() => setShowMenu(false)}
              />

              {/* Dropdown Menu */}
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                right: 0,
                background: '#1A1A1A',
                border: '2px solid #2D2D40',
                borderRadius: '8px',
                minWidth: '250px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                zIndex: 100
              }}>
                {/* User Info */}
                <div style={{
                  padding: '1rem',
                  borderBottom: '1px solid #2D2D40'
                }}>
                  <div style={{
                    fontWeight: '500',
                    color: '#D9D9E3',
                    marginBottom: '0.25rem'
                  }}>
                    {user.displayName || 'User'}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#888'
                  }}>
                    {user.email}
                  </div>
                  {user.uid === 'test-user-123' && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      background: '#2D2D40',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#9D8BCC',
                      display: 'inline-block'
                    }}>
                      🧪 Test User
                    </div>
                  )}
                </div>

                {/* Menu Items */}
                <div style={{ padding: '0.5rem 0' }}>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      // TODO: Navigate to profile page
                      alert('Profile management coming soon!');
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      color: '#D9D9E3',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#2D2D40'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    ⚙️ Profile Settings
                  </button>

                  <button
                    onClick={() => {
                      setShowMenu(false);
                      // TODO: Navigate to preferences
                      alert('Preferences coming soon!');
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      color: '#D9D9E3',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#2D2D40'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    🎨 Preferences
                  </button>
                </div>

                {/* Sign Out */}
                <div style={{
                  padding: '0.5rem',
                  borderTop: '1px solid #2D2D40'
                }}>
                  <button
                    onClick={handleSignOut}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'none',
                      border: 'none',
                      color: '#FF6F59',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: '500',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#2D2D40'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    🚪 Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

export default Header;
