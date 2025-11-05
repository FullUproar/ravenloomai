/**
 * PersonaAvatar Component
 *
 * Displays a colored circle/square with persona's initial.
 * Used in chat, persona lists, and anywhere personas are shown.
 */

import React from 'react';
import './PersonaAvatar.css';

const PersonaAvatar = ({
  personaName,
  color = '#3B82F6',
  shape = 'circle', // 'circle' or 'square'
  size = 'medium', // 'small', 'medium', 'large', 'xlarge'
  showName = false,
  className = '',
}) => {
  const initial = personaName ? personaName[0].toUpperCase() : '?';

  const sizeMap = {
    small: { width: 32, height: 32, fontSize: 16 },
    medium: { width: 48, height: 48, fontSize: 24 },
    large: { width: 64, height: 64, fontSize: 32 },
    xlarge: { width: 96, height: 96, fontSize: 48 },
  };

  const dimensions = sizeMap[size] || sizeMap.medium;

  return (
    <div className={`persona-avatar-wrapper ${className}`} data-testid="persona-avatar-wrapper">
      <div
        className={`persona-avatar ${shape} ${size}`}
        style={{
          backgroundColor: color,
          width: dimensions.width,
          height: dimensions.height,
        }}
        data-testid="persona-avatar"
        aria-label={`${personaName} avatar`}
      >
        <span
          className="avatar-initial"
          style={{ fontSize: dimensions.fontSize }}
        >
          {initial}
        </span>
      </div>

      {showName && personaName && (
        <span className="avatar-name" data-testid="avatar-name">
          {personaName}
        </span>
      )}
    </div>
  );
};

export default PersonaAvatar;
