import { useEffect, useState } from 'react';

/**
 * AIHighlight Component
 *
 * Creates a visual highlight/coachmark effect pointing to UI elements.
 * The AI can trigger these to guide users through actions.
 */
export function AIHighlight({ targetSelector, message, onDismiss, duration = 10000 }) {
  const [position, setPosition] = useState(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!targetSelector) return;

    // Find the target element
    const target = document.querySelector(targetSelector);
    if (!target) {
      console.warn(`[AIHighlight] Target not found: ${targetSelector}`);
      return;
    }

    // Calculate position
    const rect = target.getBoundingClientRect();
    setPosition({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    });

    // Add pulsing class to target
    target.classList.add('ai-highlighted');

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, duration);

    return () => {
      clearTimeout(timer);
      target.classList.remove('ai-highlighted');
    };
  }, [targetSelector, duration, onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!visible || !position) return null;

  return (
    <>
      {/* Overlay backdrop */}
      <div
        onClick={handleDismiss}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          animation: 'fadeIn 0.3s ease-out'
        }}
      />

      {/* Spotlight cutout (element remains clickable) */}
      <div
        style={{
          position: 'absolute',
          top: position.top - 8,
          left: position.left - 8,
          width: position.width + 16,
          height: position.height + 16,
          border: '3px solid #5D4B8C',
          borderRadius: '12px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 20px rgba(93, 75, 140, 0.8)',
          zIndex: 9999,
          pointerEvents: 'none',
          animation: 'pulse 2s ease-in-out infinite'
        }}
      />

      {/* Message tooltip */}
      {message && (
        <div
          style={{
            position: 'absolute',
            top: position.top + position.height + 20,
            left: Math.max(16, position.left),
            maxWidth: '300px',
            padding: '1rem',
            backgroundColor: '#1A1A1A',
            border: '2px solid #5D4B8C',
            borderRadius: '12px',
            color: '#D9D9E3',
            fontSize: '0.95rem',
            zIndex: 10000,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>{message}</div>
          <button
            onClick={handleDismiss}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#5D4B8C',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '500'
            }}
          >
            Got it
          </button>

          {/* Pointer arrow */}
          <div
            style={{
              position: 'absolute',
              top: '-10px',
              left: '20px',
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderBottom: '10px solid #5D4B8C'
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.02);
            opacity: 0.8;
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ai-highlighted {
          position: relative;
          z-index: 10000 !important;
        }
      `}</style>
    </>
  );
}

/**
 * Hook to manage AI highlights
 */
export function useAIHighlight() {
  const [highlight, setHighlight] = useState(null);

  const showHighlight = (targetSelector, message, duration) => {
    setHighlight({ targetSelector, message, duration });
  };

  const clearHighlight = () => {
    setHighlight(null);
  };

  return {
    highlight,
    showHighlight,
    clearHighlight
  };
}
