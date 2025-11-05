/**
 * PersonaColorPicker Component Stories
 *
 * Shows 32 color options organized by theme.
 */

import React, { useState } from 'react';
import PersonaColorPicker from './PersonaColorPicker';

export default {
  title: 'Components/PersonaColorPicker',
  component: PersonaColorPicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

// Default state
export const Default = {
  args: {
    selectedColor: '#3B82F6',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Sarah',
    showPreview: true,
    shape: 'circle',
  },
};

// All themes visible
export const AllColors = {
  args: {
    selectedColor: '#DC2626',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Marcus',
    showPreview: true,
    shape: 'circle',
  },
};

// Square shape
export const SquareAvatar = {
  args: {
    selectedColor: '#059669',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Alex',
    showPreview: true,
    shape: 'square',
  },
};

// Without preview
export const NoPreview = {
  args: {
    selectedColor: '#7C3AED',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Jordan',
    showPreview: false,
    shape: 'circle',
  },
};

// Different persona names (to show initials)
export const EmmaTheCoach = {
  args: {
    selectedColor: '#E11D48',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Emma',
    showPreview: true,
    shape: 'circle',
  },
};

export const OliviaTheAdvisor = {
  args: {
    selectedColor: '#0284C7',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Olivia',
    showPreview: true,
    shape: 'circle',
  },
};

export const LiamTheStrategist = {
  args: {
    selectedColor: '#9333EA',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Liam',
    showPreview: true,
    shape: 'square',
  },
};

// Interactive example with state
export const Interactive = {
  render: () => {
    const [color, setColor] = useState('#3B82F6');
    const [shape, setShape] = useState('circle');

    return (
      <div style={{ width: '600px' }}>
        <PersonaColorPicker
          selectedColor={color}
          onSelectColor={(newColor, newShape) => {
            console.log('Color changed to:', newColor);
            setColor(newColor);
            if (newShape) setShape(newShape);
          }}
          personaName="Sarah"
          showPreview={true}
          shape={shape}
        />

        <div style={{ marginTop: '24px', padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
          <strong>Current Selection:</strong>
          <div style={{ marginTop: '8px' }}>
            Color: <code style={{ background: color, color: 'white', padding: '2px 8px', borderRadius: '4px' }}>{color}</code>
          </div>
          <div style={{ marginTop: '4px' }}>
            Shape: <code>{shape}</code>
          </div>
        </div>

        <div style={{ marginTop: '16px', fontSize: '14px', color: '#6B7280' }}>
          <p><strong>Try these features:</strong></p>
          <ul>
            <li>Click any color to select it</li>
            <li>Use theme filters to browse by category</li>
            <li>Toggle between circle and square shapes</li>
            <li>See live preview update with your persona's initial</li>
          </ul>
        </div>
      </div>
    );
  },
};

// Show all 32 colors
export const AllColorPalette = {
  render: () => {
    const [selectedColor, setSelectedColor] = useState('#3B82F6');

    const COLOR_PALETTE = {
      warm: [
        { name: 'Crimson', hex: '#DC2626' },
        { name: 'Rose', hex: '#E11D48' },
        { name: 'Orange', hex: '#EA580C' },
        { name: 'Amber', hex: '#D97706' },
      ],
      cool: [
        { name: 'Sky', hex: '#0284C7' },
        { name: 'Blue', hex: '#2563EB' },
        { name: 'Indigo', hex: '#4F46E5' },
        { name: 'Violet', hex: '#7C3AED' },
      ],
      vibrant: [
        { name: 'Pink', hex: '#DB2777' },
        { name: 'Fuchsia', hex: '#C026D3' },
        { name: 'Purple', hex: '#9333EA' },
        { name: 'Grape', hex: '#7E22CE' },
      ],
      nature: [
        { name: 'Emerald', hex: '#059669' },
        { name: 'Green', hex: '#16A34A' },
        { name: 'Lime', hex: '#65A30D' },
        { name: 'Teal', hex: '#0D9488' },
      ],
      earth: [
        { name: 'Yellow', hex: '#CA8A04' },
        { name: 'Stone', hex: '#78716C' },
        { name: 'Neutral', hex: '#737373' },
        { name: 'Slate', hex: '#475569' },
      ],
      ocean: [
        { name: 'Cyan', hex: '#0891B2' },
        { name: 'Aqua', hex: '#06B6D4' },
        { name: 'Turquoise', hex: '#14B8A6' },
        { name: 'Sea', hex: '#0D9488' },
      ],
      sunset: [
        { name: 'Coral', hex: '#F97316' },
        { name: 'Peach', hex: '#FB923C' },
        { name: 'Salmon', hex: '#FB7185' },
        { name: 'Tangerine', hex: '#F59E0B' },
      ],
      deep: [
        { name: 'Navy', hex: '#1E3A8A' },
        { name: 'Cobalt', hex: '#1E40AF' },
        { name: 'Sapphire', hex: '#1D4ED8' },
        { name: 'Royal', hex: '#3730A3' },
      ],
    };

    return (
      <div style={{ width: '700px' }}>
        <h3>32-Color Palette</h3>
        <p style={{ color: '#6B7280', marginBottom: '24px' }}>
          Organized into 8 themes with 4 colors each
        </p>

        {Object.entries(COLOR_PALETTE).map(([theme, colors]) => (
          <div key={theme} style={{ marginBottom: '24px' }}>
            <h4 style={{ textTransform: 'capitalize', marginBottom: '12px' }}>
              {theme}
            </h4>
            <div style={{ display: 'flex', gap: '12px' }}>
              {colors.map((color) => (
                <div
                  key={color.hex}
                  style={{
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedColor(color.hex)}
                >
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      background: color.hex,
                      borderRadius: '12px',
                      border: selectedColor === color.hex ? '4px solid #111' : '2px solid #E5E7EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}
                  >
                    <span style={{ color: 'white', fontSize: '32px', fontWeight: '700' }}>
                      S
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '8px', fontWeight: '500' }}>
                    {color.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6B7280' }}>
                    {color.hex}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: '32px', padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
          <strong>Selected:</strong> {COLOR_PALETTE.warm.concat(COLOR_PALETTE.cool, COLOR_PALETTE.vibrant, COLOR_PALETTE.nature, COLOR_PALETTE.earth, COLOR_PALETTE.ocean, COLOR_PALETTE.sunset, COLOR_PALETTE.deep).find(c => c.hex === selectedColor)?.name || 'None'}
        </div>
      </div>
    );
  },
};

// Mobile responsive
export const MobileView = {
  args: {
    selectedColor: '#16A34A',
    onSelectColor: (color) => console.log('Selected:', color),
    personaName: 'Taylor',
    showPreview: true,
    shape: 'circle',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Accessibility test
export const AccessibilityTest = {
  render: () => {
    const [color, setColor] = useState('#3B82F6');

    return (
      <div style={{ width: '600px' }}>
        <PersonaColorPicker
          selectedColor={color}
          onSelectColor={setColor}
          personaName="Alex"
          showPreview={true}
          shape="circle"
        />

        <div style={{ marginTop: '24px', padding: '16px', background: '#FEF3C7', borderRadius: '8px', border: '2px solid #F59E0B' }}>
          <strong>♿ Accessibility Features:</strong>
          <ul style={{ marginTop: '8px', fontSize: '14px' }}>
            <li>Keyboard navigable (Tab through colors)</li>
            <li>Focus indicators on color swatches</li>
            <li>ARIA labels for screen readers</li>
            <li>High contrast mode support</li>
            <li>Color names in title attributes</li>
          </ul>
        </div>
      </div>
    );
  },
};
