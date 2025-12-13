/**
 * Toast Notification System
 *
 * Based on Nielsen's "Visibility of system status" heuristic and Slack's
 * non-disruptive feedback patterns. Provides in-app notifications instead
 * of blocking browser alerts.
 *
 * Features:
 * - Success, error, warning, info types
 * - Auto-dismiss with configurable durations
 * - Undo action support (Gmail/Google Docs pattern)
 * - Keyboard shortcut support (Cmd+Z for most recent undo)
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

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
  const timeoutsRef = useRef(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const addToast = useCallback((message, type = 'info', options = {}) => {
    const id = Date.now() + Math.random();
    const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;

    // Options can include: duration, action, actionLabel
    const {
      duration = config.duration,
      action = null,        // Undo function
      actionLabel = 'Undo'  // Button label
    } = typeof options === 'number' ? { duration: options } : options;

    // Longer duration if there's an action to allow user time to click
    const finalDuration = action ? Math.max(duration, 5000) : duration;

    setToasts(prev => [...prev, {
      id,
      message,
      type,
      config,
      action,
      actionLabel
    }]);

    // Auto-remove after duration
    const timeout = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timeoutsRef.current.delete(id);
    }, finalDuration);

    timeoutsRef.current.set(id, timeout);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  // Execute action and dismiss toast
  const executeAction = useCallback((id, action) => {
    if (action) {
      try {
        action();
      } catch (e) {
        console.error('Toast action error:', e);
      }
    }
    removeToast(id);
  }, [removeToast]);

  // Cmd+Z to undo most recent action
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        // Find most recent toast with an undo action
        const undoableToast = [...toasts].reverse().find(t => t.action);
        if (undoableToast) {
          e.preventDefault();
          executeAction(undoableToast.id, undoableToast.action);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toasts, executeAction]);

  // Convenience methods
  const toast = {
    success: (message, options) => addToast(message, 'success', options),
    error: (message, options) => addToast(message, 'error', options),
    warning: (message, options) => addToast(message, 'warning', options),
    info: (message, options) => addToast(message, 'info', options),

    // Convenience method for undo toasts
    withUndo: (message, undoFn, type = 'success') => addToast(message, type, {
      action: undoFn,
      actionLabel: 'Undo'
    }),

    // Remove a specific toast
    dismiss: removeToast
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} executeAction={executeAction} />
    </ToastContext.Provider>
  );
}

// Toast Container - renders all active toasts
function ToastContainer({ toasts, removeToast, executeAction }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast ${toast.config.className} ${toast.action ? 'toast-with-action' : ''}`}
          role="alert"
        >
          <span className="toast-icon" aria-hidden="true">{toast.config.icon}</span>
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => executeAction(toast.id, toast.action)}
            >
              {toast.actionLabel}
            </button>
          )}
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
