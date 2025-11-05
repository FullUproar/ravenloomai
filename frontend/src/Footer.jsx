import strings from './strings.js';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
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
            href="https://github.com/yourusername/ravenloom"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#888',
              textDecoration: 'none',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.color = '#5D4B8C'}
            onMouseLeave={(e) => e.target.style.color = '#888'}
          >
            GitHub
          </a>
          <a
            href="/docs"
            style={{
              color: '#888',
              textDecoration: 'none',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.color = '#5D4B8C'}
            onMouseLeave={(e) => e.target.style.color = '#888'}
          >
            Documentation
          </a>
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
            {strings.footer.privacyLink}
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
            {strings.footer.termsLink}
          </a>
        </div>

        <div style={{ color: '#666' }}>
          {strings.footer.copyright(currentYear)}
        </div>
      </div>
    </footer>
  );
}

export default Footer;
