/**
 * PersonaColorPicker Component
 *
 * Simple color selector for persona avatars.
 * 32 curated colors organized by theme.
 */

import React, { useState } from 'react';
import './PersonaColorPicker.css';

// 32 carefully selected colors organized by theme
const COLOR_PALETTE = {
  warm: [
    { name: 'Crimson', hex: '#DC2626', rgb: '220, 38, 38' },
    { name: 'Rose', hex: '#E11D48', rgb: '225, 29, 72' },
    { name: 'Orange', hex: '#EA580C', rgb: '234, 88, 12' },
    { name: 'Amber', hex: '#D97706', rgb: '217, 119, 6' },
  ],
  cool: [
    { name: 'Sky', hex: '#0284C7', rgb: '2, 132, 199' },
    { name: 'Blue', hex: '#2563EB', rgb: '37, 99, 235' },
    { name: 'Indigo', hex: '#4F46E5', rgb: '79, 70, 229' },
    { name: 'Violet', hex: '#7C3AED', rgb: '124, 58, 237' },
  ],
  vibrant: [
    { name: 'Pink', hex: '#DB2777', rgb: '219, 39, 119' },
    { name: 'Fuchsia', hex: '#C026D3', rgb: '192, 38, 211' },
    { name: 'Purple', hex: '#9333EA', rgb: '147, 51, 234' },
    { name: 'Grape', hex: '#7E22CE', rgb: '126, 34, 206' },
  ],
  nature: [
    { name: 'Emerald', hex: '#059669', rgb: '5, 150, 105' },
    { name: 'Green', hex: '#16A34A', rgb: '22, 163, 74' },
    { name: 'Lime', hex: '#65A30D', rgb: '101, 163, 13' },
    { name: 'Teal', hex: '#0D9488', rgb: '13, 148, 136' },
  ],
  earth: [
    { name: 'Yellow', hex: '#CA8A04', rgb: '202, 138, 4' },
    { name: 'Stone', hex: '#78716C', rgb: '120, 113, 108' },
    { name: 'Neutral', hex: '#737373', rgb: '115, 115, 115' },
    { name: 'Slate', hex: '#475569', rgb: '71, 85, 105' },
  ],
  ocean: [
    { name: 'Cyan', hex: '#0891B2', rgb: '8, 145, 178' },
    { name: 'Aqua', hex: '#06B6D4', rgb: '6, 182, 212' },
    { name: 'Turquoise', hex: '#14B8A6', rgb: '20, 184, 166' },
    { name: 'Sea', hex: '#0D9488', rgb: '13, 148, 136' },
  ],
  sunset: [
    { name: 'Coral', hex: '#F97316', rgb: '249, 115, 22' },
    { name: 'Peach', hex: '#FB923C', rgb: '251, 146, 60' },
    { name: 'Salmon', hex: '#FB7185', rgb: '251, 113, 133' },
    { name: 'Tangerine', hex: '#F59E0B', rgb: '245, 158, 11' },
  ],
  deep: [
    { name: 'Navy', hex: '#1E3A8A', rgb: '30, 58, 138' },
    { name: 'Cobalt', hex: '#1E40AF', rgb: '30, 64, 175' },
    { name: 'Sapphire', hex: '#1D4ED8', rgb: '29, 78, 216' },
    { name: 'Royal', hex: '#3730A3', rgb: '55, 48, 163' },
  ],
};

const PersonaColorPicker = ({
  selectedColor = '#3B82F6',
  onSelectColor,
  personaName = '',
  showPreview = true,
  shape = 'circle', // 'circle' or 'square'
}) => {
  const [activeTheme, setActiveTheme] = useState('all');

  // Get all colors or filtered by theme
  const getColors = () => {
    if (activeTheme === 'all') {
      return Object.values(COLOR_PALETTE).flat();
    }
    return COLOR_PALETTE[activeTheme] || [];
  };

  const colors = getColors();
  const initial = personaName ? personaName[0].toUpperCase() : '?';

  return (
    <div className="persona-color-picker" data-testid="color-picker">
      <label>
        Avatar Color <span className="optional">(optional)</span>
      </label>

      {/* Preview */}
      {showPreview && (
        <div className="color-preview">
          <div
            className={`avatar-preview ${shape}`}
            style={{ backgroundColor: selectedColor }}
            data-testid="avatar-preview"
          >
            <span className="avatar-initial">{initial}</span>
          </div>
          <div className="preview-info">
            <div className="preview-name">
              {personaName ? `${personaName} the Coach` : 'Your Persona'}
            </div>
            <div className="preview-color">
              {colors.find(c => c.hex === selectedColor)?.name || 'Custom'}
            </div>
          </div>
        </div>
      )}

      {/* Theme Filter */}
      <div className="theme-filter">
        <button
          className={`theme-button ${activeTheme === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTheme('all')}
          data-testid="theme-all"
        >
          All Colors
        </button>
        {Object.keys(COLOR_PALETTE).map((theme) => (
          <button
            key={theme}
            className={`theme-button ${activeTheme === theme ? 'active' : ''}`}
            onClick={() => setActiveTheme(theme)}
            data-testid={`theme-${theme}`}
          >
            {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </button>
        ))}
      </div>

      {/* Color Grid */}
      <div className="color-grid" data-testid="color-grid">
        {colors.map((color) => (
          <button
            key={color.hex}
            className={`color-swatch ${selectedColor === color.hex ? 'selected' : ''}`}
            style={{ backgroundColor: color.hex }}
            onClick={() => onSelectColor(color.hex)}
            title={color.name}
            data-testid={`color-${color.name.toLowerCase()}`}
            aria-label={`Select ${color.name} color`}
          >
            {selectedColor === color.hex && (
              <span className="checkmark">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Shape Toggle */}
      <div className="shape-toggle">
        <label>Avatar Shape:</label>
        <div className="shape-options">
          <button
            className={`shape-option ${shape === 'circle' ? 'active' : ''}`}
            onClick={() => onSelectColor(selectedColor, 'circle')}
            data-testid="shape-circle"
          >
            ⭕ Circle
          </button>
          <button
            className={`shape-option ${shape === 'square' ? 'active' : ''}`}
            onClick={() => onSelectColor(selectedColor, 'square')}
            data-testid="shape-square"
          >
            ◼️ Square
          </button>
        </div>
      </div>

      <p className="field-hint">
        Choose a color for your persona's avatar. This will be displayed next to
        messages and in your persona list.
      </p>
    </div>
  );
};

export default PersonaColorPicker;
