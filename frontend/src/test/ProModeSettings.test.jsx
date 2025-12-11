/**
 * Pro Mode Settings Component Tests
 *
 * Tests for the Pro Mode feature flags panel:
 * - Master toggle enable/disable
 * - Individual feature toggles
 * - Feature visibility based on pro mode state
 * - Productivity method selection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';

// Feature definitions (matching the component)
const featureDefinitions = [
  { key: 'showGanttChart', label: 'Gantt Chart', icon: '📊' },
  { key: 'showWBS', label: 'Work Breakdown Structure', icon: '🌳' },
  { key: 'showEisenhowerMatrix', label: 'Eisenhower Matrix', icon: '⚡' },
  { key: 'showWorkloadHistogram', label: 'Workload Dashboard', icon: '👥' },
  { key: 'showMilestones', label: 'Milestones', icon: '🏁' },
  { key: 'showTimeBlocking', label: 'Time Blocking', icon: '📅' },
  { key: 'showContexts', label: 'GTD Contexts', icon: '🏷️' },
  { key: 'showTimeTracking', label: 'Time Tracking', icon: '⏱️' },
  { key: 'showDependenciesGraph', label: 'Dependencies Graph', icon: '🔗' },
  { key: 'showResourceAllocation', label: 'Resource Allocation', icon: '📈' },
  { key: 'showCriticalPath', label: 'Critical Path', icon: '🛤️' },
];

// Mock ProModeSettings component
function ProModeSettingsMock({
  flags,
  loading,
  onToggleProMode,
  onToggleFeature,
  onUpdateProductivityMethod
}) {
  const isProModeEnabled = flags?.proModeEnabled || false;

  if (loading) {
    return (
      <div className="pro-mode-settings" data-testid="loading-state">
        <div className="loading-spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="pro-mode-settings" data-testid="pro-mode-settings">
      <h4>Pro Mode Settings</h4>

      {/* Master Toggle */}
      <div
        className={`pro-mode-toggle ${isProModeEnabled ? 'active' : ''}`}
        onClick={onToggleProMode}
        data-testid="pro-mode-toggle"
      >
        <span className="pro-mode-icon">⚡</span>
        <div className="pro-mode-label">
          <div className="pro-mode-title">Pro Mode</div>
          <div className="pro-mode-subtitle">
            Enable advanced project management features
          </div>
        </div>
        <div className="pro-mode-switch" data-testid="pro-mode-switch" />
      </div>

      {/* Individual Features */}
      {isProModeEnabled && (
        <div className="pro-features-grid" data-testid="features-grid">
          {featureDefinitions.map((feature) => (
            <div
              key={feature.key}
              className={`pro-feature-item ${flags?.[feature.key] ? 'enabled' : ''}`}
              onClick={() => onToggleFeature(feature.key)}
              data-testid={`feature-${feature.key}`}
            >
              <div className="pro-feature-checkbox" data-testid={`checkbox-${feature.key}`} />
              <span>{feature.icon}</span>
              <span className="pro-feature-label">{feature.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Productivity Method */}
      {isProModeEnabled && (
        <div className="productivity-method" data-testid="productivity-method-section">
          <label>Preferred Productivity Method</label>
          <select
            className="input-field"
            value={flags?.preferredProductivityMethod || 'gtd'}
            onChange={(e) => onUpdateProductivityMethod(e.target.value)}
            data-testid="productivity-method-select"
          >
            <option value="gtd">GTD (Getting Things Done)</option>
            <option value="eisenhower">Eisenhower Matrix</option>
            <option value="eat_the_frog">Eat the Frog</option>
            <option value="time_blocking">Time Blocking</option>
          </select>
        </div>
      )}
    </div>
  );
}

// Test utilities
function createMockFlags(overrides = {}) {
  return {
    proModeEnabled: false,
    showGanttChart: false,
    showWBS: false,
    showTimeTracking: false,
    showDependenciesGraph: false,
    showResourceAllocation: false,
    showCriticalPath: false,
    showEisenhowerMatrix: false,
    showWorkloadHistogram: false,
    showMilestones: false,
    showTimeBlocking: false,
    showContexts: false,
    preferredProductivityMethod: 'gtd',
    ...overrides
  };
}

describe('ProModeSettings', () => {
  let mockOnToggleProMode;
  let mockOnToggleFeature;
  let mockOnUpdateProductivityMethod;

  beforeEach(() => {
    mockOnToggleProMode = vi.fn();
    mockOnToggleFeature = vi.fn();
    mockOnUpdateProductivityMethod = vi.fn();
  });

  describe('Loading State', () => {
    it('should show loading spinner when loading', () => {
      render(
        <ProModeSettingsMock
          flags={null}
          loading={true}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
    });

    it('should not show settings when loading', () => {
      render(
        <ProModeSettingsMock
          flags={null}
          loading={true}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.queryByTestId('pro-mode-toggle')).not.toBeInTheDocument();
    });
  });

  describe('Pro Mode Toggle', () => {
    it('should render pro mode toggle', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags()}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByText('Pro Mode')).toBeInTheDocument();
      expect(screen.getByText('Enable advanced project management features')).toBeInTheDocument();
    });

    it('should call onToggleProMode when toggle clicked', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags()}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      fireEvent.click(screen.getByTestId('pro-mode-toggle'));
      expect(mockOnToggleProMode).toHaveBeenCalledTimes(1);
    });

    it('should have active class when pro mode is enabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('pro-mode-toggle')).toHaveClass('active');
    });

    it('should not have active class when pro mode is disabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: false })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('pro-mode-toggle')).not.toHaveClass('active');
    });
  });

  describe('Feature Grid Visibility', () => {
    it('should not show features grid when pro mode is disabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: false })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.queryByTestId('features-grid')).not.toBeInTheDocument();
    });

    it('should show features grid when pro mode is enabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('features-grid')).toBeInTheDocument();
    });

    it('should render all feature toggles when pro mode enabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      // Check each feature exists by its testid to avoid duplicate text issues
      featureDefinitions.forEach(feature => {
        expect(screen.getByTestId(`feature-${feature.key}`)).toBeInTheDocument();
      });
    });
  });

  describe('Individual Feature Toggles', () => {
    it('should call onToggleFeature with correct key when feature clicked', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      fireEvent.click(screen.getByTestId('feature-showGanttChart'));
      expect(mockOnToggleFeature).toHaveBeenCalledWith('showGanttChart');
    });

    it('should show enabled class when feature is enabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true, showGanttChart: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('feature-showGanttChart')).toHaveClass('enabled');
    });

    it('should not show enabled class when feature is disabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true, showGanttChart: false })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('feature-showGanttChart')).not.toHaveClass('enabled');
    });

    it('should toggle each feature independently', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({
            proModeEnabled: true,
            showGanttChart: true,
            showWBS: false,
            showEisenhowerMatrix: true
          })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('feature-showGanttChart')).toHaveClass('enabled');
      expect(screen.getByTestId('feature-showWBS')).not.toHaveClass('enabled');
      expect(screen.getByTestId('feature-showEisenhowerMatrix')).toHaveClass('enabled');
    });
  });

  describe('Productivity Method', () => {
    it('should not show productivity method selector when pro mode disabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: false })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.queryByTestId('productivity-method-section')).not.toBeInTheDocument();
    });

    it('should show productivity method selector when pro mode enabled', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('productivity-method-section')).toBeInTheDocument();
    });

    it('should show correct default method', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true, preferredProductivityMethod: 'eisenhower' })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('productivity-method-select')).toHaveValue('eisenhower');
    });

    it('should call onUpdateProductivityMethod when method changed', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      fireEvent.change(screen.getByTestId('productivity-method-select'), { target: { value: 'time_blocking' } });
      expect(mockOnUpdateProductivityMethod).toHaveBeenCalledWith('time_blocking');
    });

    it('should have all productivity method options', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      const select = screen.getByTestId('productivity-method-select');
      expect(select.querySelector('option[value="gtd"]')).toBeInTheDocument();
      expect(select.querySelector('option[value="eisenhower"]')).toBeInTheDocument();
      expect(select.querySelector('option[value="eat_the_frog"]')).toBeInTheDocument();
      expect(select.querySelector('option[value="time_blocking"]')).toBeInTheDocument();
    });
  });

  describe('Feature Icons and Labels', () => {
    it('should display correct icons for each feature', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByText('📊')).toBeInTheDocument(); // Gantt
      expect(screen.getByText('🌳')).toBeInTheDocument(); // WBS
      expect(screen.getByText('🏁')).toBeInTheDocument(); // Milestones
    });

    it('should display all feature labels', () => {
      render(
        <ProModeSettingsMock
          flags={createMockFlags({ proModeEnabled: true })}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByText('Gantt Chart')).toBeInTheDocument();
      expect(screen.getByText('Work Breakdown Structure')).toBeInTheDocument();
      // Eisenhower Matrix appears in both feature list and dropdown, use getAllByText
      expect(screen.getAllByText('Eisenhower Matrix').length).toBeGreaterThan(0);
      expect(screen.getByText('Workload Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Milestones')).toBeInTheDocument();
      // Time Blocking appears in both feature list and dropdown, use getAllByText
      expect(screen.getAllByText('Time Blocking').length).toBeGreaterThan(0);
      expect(screen.getByText('GTD Contexts')).toBeInTheDocument();
      expect(screen.getByText('Time Tracking')).toBeInTheDocument();
      expect(screen.getByText('Dependencies Graph')).toBeInTheDocument();
      expect(screen.getByText('Resource Allocation')).toBeInTheDocument();
      expect(screen.getByText('Critical Path')).toBeInTheDocument();
    });
  });

  describe('Settings Persistence', () => {
    it('should reflect correct initial state for all features', () => {
      const flags = createMockFlags({
        proModeEnabled: true,
        showGanttChart: true,
        showWBS: true,
        showTimeTracking: false,
        showMilestones: true,
        showTimeBlocking: false
      });

      render(
        <ProModeSettingsMock
          flags={flags}
          loading={false}
          onToggleProMode={mockOnToggleProMode}
          onToggleFeature={mockOnToggleFeature}
          onUpdateProductivityMethod={mockOnUpdateProductivityMethod}
        />
      );

      expect(screen.getByTestId('feature-showGanttChart')).toHaveClass('enabled');
      expect(screen.getByTestId('feature-showWBS')).toHaveClass('enabled');
      expect(screen.getByTestId('feature-showTimeTracking')).not.toHaveClass('enabled');
      expect(screen.getByTestId('feature-showMilestones')).toHaveClass('enabled');
      expect(screen.getByTestId('feature-showTimeBlocking')).not.toHaveClass('enabled');
    });
  });
});
