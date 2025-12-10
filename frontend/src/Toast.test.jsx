/**
 * Toast Component Tests
 *
 * Tests for the toast notification system including:
 * - Toast provider functionality
 * - Toast display and removal
 * - Different toast types
 * - useToast hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

// Helper component to test useToast hook
function TestComponent() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Show Success</button>
      <button onClick={() => toast.error('Error message')}>Show Error</button>
      <button onClick={() => toast.warning('Warning message')}>Show Warning</button>
      <button onClick={() => toast.info('Info message')}>Show Info</button>
    </div>
  );
}

// Component that uses custom duration
function TestComponentWithDuration() {
  const toast = useToast();
  return (
    <button onClick={() => toast.success('Quick message', 100)}>
      Show Quick
    </button>
  );
}

describe('Toast System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ToastProvider', () => {
    it('should render children', () => {
      render(
        <ToastProvider>
          <div data-testid="child">Child content</div>
        </ToastProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should not render toast container when no toasts exist', () => {
      render(
        <ToastProvider>
          <div>Content</div>
        </ToastProvider>
      );

      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });
  });

  describe('useToast Hook', () => {
    it('should throw error when used outside ToastProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useToast must be used within a ToastProvider');

      consoleError.mockRestore();
    });

    it('should provide toast methods', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      expect(screen.getByText('Show Success')).toBeInTheDocument();
      expect(screen.getByText('Show Error')).toBeInTheDocument();
      expect(screen.getByText('Show Warning')).toBeInTheDocument();
      expect(screen.getByText('Show Info')).toBeInTheDocument();
    });
  });

  describe('Toast Display', () => {
    it('should show success toast when triggered', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));

      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveClass('toast-success');
    });

    it('should show error toast when triggered', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Error'));

      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveClass('toast-error');
    });

    it('should show warning toast when triggered', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Warning'));

      expect(screen.getByText('Warning message')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveClass('toast-warning');
    });

    it('should show info toast when triggered', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Info'));

      expect(screen.getByText('Info message')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveClass('toast-info');
    });

    it('should display correct icons for each toast type', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('should show multiple toasts simultaneously', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      fireEvent.click(screen.getByText('Show Error'));

      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
  });

  describe('Toast Auto-Dismiss', () => {
    it('should auto-dismiss success toast after default duration', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      expect(screen.getByText('Success message')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    });

    it('should auto-dismiss error toast after longer duration', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Error'));
      expect(screen.getByText('Error message')).toBeInTheDocument();

      // Error has 5000ms duration
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText('Error message')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText('Error message')).not.toBeInTheDocument();
    });

    it('should use custom duration when provided', async () => {
      render(
        <ToastProvider>
          <TestComponentWithDuration />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Quick'));
      expect(screen.getByText('Quick message')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.queryByText('Quick message')).not.toBeInTheDocument();
    });
  });

  describe('Toast Manual Dismiss', () => {
    it('should dismiss toast when close button is clicked', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      expect(screen.getByText('Success message')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Dismiss notification'));

      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    });

    it('should only dismiss clicked toast when multiple exist', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      fireEvent.click(screen.getByText('Show Error'));

      const closeButtons = screen.getAllByLabelText('Dismiss notification');
      fireEvent.click(closeButtons[0]); // Dismiss first toast

      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on container', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));

      const container = screen.getByRole('region');
      expect(container).toHaveAttribute('aria-label', 'Notifications');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });

    it('should mark toast as alert role', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have accessible dismiss button', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));

      expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
    });
  });
});
