/**
 * Toast Notification System
 *
 * Based on Nielsen's "Visibility of system status" heuristic and Slack's
 * non-disruptive feedback patterns. Provides in-app notifications instead
 * of blocking browser alerts.
 */
import { createContext, useContext, useState, useCallback } from 'react';

// Toast Context
const ToastContext = createContext(null);

// Toast types with their icons and default durations
const TOAST_CONFIG = {
  success: { icon: '✓', duration: 3000, className: 'toast-success' },
  error: { icon: '✕', duration: 5000, className: 'toast-error' },
  warning: { icon: '⚠', duration: 4000, className: 'toast-warning' },
  info: { icon: 'ℹ', duration: 3000, className: 'toast-info' }
};

// Toast Provider Component
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = null) => {
    const id = Date.now() + Math.random();
    const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;
    const toastDuration = duration || config.duration;

    setToasts(prev => [...prev, { id, message, type, config }]);

    // Auto-remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, toastDuration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Convenience methods
  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration)
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast Container - renders all active toasts
function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast ${toast.config.className}`}
          role="alert"
        >
          <span className="toast-icon" aria-hidden="true">{toast.config.icon}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// Hook to use toast
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastProvider;
