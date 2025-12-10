/**
 * Team Settings Modal Tests
 *
 * Tests for the Team Settings modal component behavior:
 * - Modal visibility
 * - Proactive AI toggle states
 * - Feature toggles show/hide based on master toggle
 * - Settings update mutations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMockProactiveSettings } from './utils';

// Mock Team Settings Modal Component (extracted pattern from TeamDashboard)
function TeamSettingsModal({ show, onClose, settings, onUpdate }) {
  if (!show || !settings) return null;

  const handleToggle = (key, value) => {
    onUpdate({ proactiveAI: { [key]: value } });
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="modal-overlay">
      <div className="modal team-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Team Settings</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="settings-section">
          <h4>Proactive AI Features</h4>
          <p className="settings-description">
            Control AI-powered productivity features for your team.
          </p>

          <div className="settings-toggles">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => handleToggle('enabled', e.target.checked)}
                data-testid="master-toggle"
              />
              <span className="toggle-label">
                <strong>Enable Proactive AI</strong>
                <span className="toggle-hint">Master toggle for all AI features</span>
              </span>
            </label>

            {settings.enabled && (
              <>
                <label className="toggle-row toggle-indent">
                  <input
                    type="checkbox"
                    checked={settings.morningFocusEnabled}
                    onChange={(e) => handleToggle('morningFocusEnabled', e.target.checked)}
                    data-testid="morning-focus-toggle"
                  />
                  <span className="toggle-label">
                    <strong>Morning Focus</strong>
                    <span className="toggle-hint">AI-generated daily plans</span>
                  </span>
                </label>

                <label className="toggle-row toggle-indent">
                  <input
                    type="checkbox"
                    checked={settings.smartNudgesEnabled}
                    onChange={(e) => handleToggle('smartNudgesEnabled', e.target.checked)}
                    data-testid="smart-nudges-toggle"
                  />
                  <span className="toggle-label">
                    <strong>Smart Nudges</strong>
                    <span className="toggle-hint">Reminders for overdue/stale tasks</span>
                  </span>
                </label>

                <label className="toggle-row toggle-indent">
                  <input
                    type="checkbox"
                    checked={settings.insightsEnabled}
                    onChange={(e) => handleToggle('insightsEnabled', e.target.checked)}
                    data-testid="insights-toggle"
                  />
                  <span className="toggle-label">
                    <strong>AI Insights</strong>
                    <span className="toggle-hint">Productivity analytics and recommendations</span>
                  </span>
                </label>

                <label className="toggle-row toggle-indent">
                  <input
                    type="checkbox"
                    checked={settings.meetingPrepEnabled}
                    onChange={(e) => handleToggle('meetingPrepEnabled', e.target.checked)}
                    data-testid="meeting-prep-toggle"
                  />
                  <span className="toggle-label">
                    <strong>Meeting Prep</strong>
                    <span className="toggle-hint">Auto-generated context before meetings</span>
                  </span>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

describe('TeamSettingsModal', () => {
  let mockOnClose;
  let mockOnUpdate;

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockOnUpdate = vi.fn();
  });

  describe('Modal Visibility', () => {
    it('should not render when show is false', () => {
      render(
        <TeamSettingsModal
          show={false}
          onClose={mockOnClose}
          settings={createMockProactiveSettings()}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.queryByText('Team Settings')).not.toBeInTheDocument();
    });

    it('should not render when settings is null', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={null}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.queryByText('Team Settings')).not.toBeInTheDocument();
    });

    it('should render when show is true and settings exist', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings()}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText('Team Settings')).toBeInTheDocument();
    });
  });

  describe('Modal Close Behavior', () => {
    it('should call onClose when close button is clicked', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings()}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByLabelText('Close modal'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when overlay is clicked', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings()}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('modal-overlay'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when modal content is clicked', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings()}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByText('Proactive AI Features'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should call onClose when Close button in footer is clicked', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings()}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByText('Close'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Master Toggle', () => {
    it('should show master toggle as checked when enabled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByTestId('master-toggle')).toBeChecked();
    });

    it('should show master toggle as unchecked when disabled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: false })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByTestId('master-toggle')).not.toBeChecked();
    });

    it('should call onUpdate with enabled: false when toggled off', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('master-toggle'));

      expect(mockOnUpdate).toHaveBeenCalledWith({
        proactiveAI: { enabled: false }
      });
    });

    it('should call onUpdate with enabled: true when toggled on', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: false })}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('master-toggle'));

      expect(mockOnUpdate).toHaveBeenCalledWith({
        proactiveAI: { enabled: true }
      });
    });
  });

  describe('Feature Toggles Visibility', () => {
    it('should show all feature toggles when master is enabled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByTestId('morning-focus-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('smart-nudges-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('insights-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('meeting-prep-toggle')).toBeInTheDocument();
    });

    it('should hide all feature toggles when master is disabled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: false })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.queryByTestId('morning-focus-toggle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('smart-nudges-toggle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('insights-toggle')).not.toBeInTheDocument();
      expect(screen.queryByTestId('meeting-prep-toggle')).not.toBeInTheDocument();
    });
  });

  describe('Individual Feature Toggles', () => {
    it('should update Morning Focus setting when toggled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true, morningFocusEnabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('morning-focus-toggle'));

      expect(mockOnUpdate).toHaveBeenCalledWith({
        proactiveAI: { morningFocusEnabled: false }
      });
    });

    it('should update Smart Nudges setting when toggled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true, smartNudgesEnabled: false })}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('smart-nudges-toggle'));

      expect(mockOnUpdate).toHaveBeenCalledWith({
        proactiveAI: { smartNudgesEnabled: true }
      });
    });

    it('should update AI Insights setting when toggled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true, insightsEnabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('insights-toggle'));

      expect(mockOnUpdate).toHaveBeenCalledWith({
        proactiveAI: { insightsEnabled: false }
      });
    });

    it('should update Meeting Prep setting when toggled', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true, meetingPrepEnabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      fireEvent.click(screen.getByTestId('meeting-prep-toggle'));

      expect(mockOnUpdate).toHaveBeenCalledWith({
        proactiveAI: { meetingPrepEnabled: false }
      });
    });
  });

  describe('Toggle States', () => {
    it('should reflect individual toggle states correctly', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({
            enabled: true,
            morningFocusEnabled: true,
            smartNudgesEnabled: false,
            insightsEnabled: true,
            meetingPrepEnabled: false
          })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByTestId('morning-focus-toggle')).toBeChecked();
      expect(screen.getByTestId('smart-nudges-toggle')).not.toBeChecked();
      expect(screen.getByTestId('insights-toggle')).toBeChecked();
      expect(screen.getByTestId('meeting-prep-toggle')).not.toBeChecked();
    });
  });

  describe('Content Display', () => {
    it('should display correct labels for each feature', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText('Enable Proactive AI')).toBeInTheDocument();
      expect(screen.getByText('Morning Focus')).toBeInTheDocument();
      expect(screen.getByText('Smart Nudges')).toBeInTheDocument();
      expect(screen.getByText('AI Insights')).toBeInTheDocument();
      expect(screen.getByText('Meeting Prep')).toBeInTheDocument();
    });

    it('should display hint text for each toggle', () => {
      render(
        <TeamSettingsModal
          show={true}
          onClose={mockOnClose}
          settings={createMockProactiveSettings({ enabled: true })}
          onUpdate={mockOnUpdate}
        />
      );

      expect(screen.getByText('Master toggle for all AI features')).toBeInTheDocument();
      expect(screen.getByText('AI-generated daily plans')).toBeInTheDocument();
      expect(screen.getByText('Reminders for overdue/stale tasks')).toBeInTheDocument();
      expect(screen.getByText('Productivity analytics and recommendations')).toBeInTheDocument();
      expect(screen.getByText('Auto-generated context before meetings')).toBeInTheDocument();
    });
  });
});
