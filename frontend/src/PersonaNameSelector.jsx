/**
 * PersonaNameSelector Component
 *
 * Typeahead name selector with random name button.
 * Shows only available names for the selected archetype.
 */

import React, { useState, useEffect, useRef } from 'react';
import './PersonaNameSelector.css';

const PersonaNameSelector = ({
  archetype,
  selectedName,
  onSelectName,
  availableNames = [],
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filter names based on search term
  const filteredNames = searchTerm
    ? availableNames.filter(nameData =>
        nameData.name.toLowerCase().startsWith(searchTerm.toLowerCase())
      )
    : availableNames;

  // Take top 50 for dropdown (performance)
  const dropdownNames = filteredNames.slice(0, 50);

  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowDropdown(true);
    setHighlightedIndex(0);
  };

  // Handle name selection
  const handleSelectName = (name) => {
    onSelectName(name);
    setSearchTerm(name);
    setShowDropdown(false);
  };

  // Handle random name selection
  const handleRandomName = () => {
    if (availableNames.length === 0) return;

    const randomIndex = Math.floor(Math.random() * availableNames.length);
    const randomName = availableNames[randomIndex].name;

    handleSelectName(randomName);

    // Visual feedback
    inputRef.current?.classList.add('random-flash');
    setTimeout(() => {
      inputRef.current?.classList.remove('random-flash');
    }, 300);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < dropdownNames.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (dropdownNames[highlightedIndex]) {
          handleSelectName(dropdownNames[highlightedIndex].name);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        break;

      default:
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.querySelector(
        `[data-index="${highlightedIndex}"]`
      );
      highlightedElement?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedIndex, showDropdown]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set search term when selected name changes (from parent)
  useEffect(() => {
    if (selectedName && selectedName !== searchTerm) {
      setSearchTerm(selectedName);
    }
  }, [selectedName]);

  return (
    <div className="persona-name-selector" data-testid="persona-name-selector">
      <label htmlFor="persona-name-input">
        Choose a Name <span className="required">*</span>
      </label>

      <div className="name-input-wrapper">
        {/* Typeahead Input */}
        <div className="typeahead-container">
          <input
            ref={inputRef}
            id="persona-name-input"
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowDropdown(true)}
            placeholder="Start typing a name..."
            disabled={isLoading}
            data-testid="name-input"
            className={selectedName ? 'has-selection' : ''}
            autoComplete="off"
          />

          {/* Dropdown */}
          {showDropdown && dropdownNames.length > 0 && (
            <div
              ref={dropdownRef}
              className="typeahead-dropdown"
              data-testid="name-dropdown"
            >
              {dropdownNames.map((nameData, index) => (
                <div
                  key={nameData.name}
                  data-index={index}
                  className={`dropdown-item ${
                    index === highlightedIndex ? 'highlighted' : ''
                  } ${selectedName === nameData.name ? 'selected' : ''}`}
                  onClick={() => handleSelectName(nameData.name)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="name-text">{nameData.name}</span>
                  <span className="name-rank">#{nameData.popularity_rank}</span>
                </div>
              ))}

              {searchTerm && filteredNames.length > 50 && (
                <div className="dropdown-footer">
                  Showing top 50 of {filteredNames.length} matches
                </div>
              )}
            </div>
          )}

          {/* No results */}
          {showDropdown && searchTerm && dropdownNames.length === 0 && (
            <div className="typeahead-dropdown" data-testid="no-results">
              <div className="dropdown-item no-results">
                No names found matching "{searchTerm}"
              </div>
            </div>
          )}
        </div>

        {/* Random Button */}
        <button
          type="button"
          className="random-name-button"
          onClick={handleRandomName}
          disabled={isLoading || availableNames.length === 0}
          data-testid="random-name-button"
          title="Pick a random name"
        >
          🎲 Random
        </button>
      </div>

      {/* Helper Text */}
      <p className="field-hint">
        {availableNames.length > 0 ? (
          <>
            {filteredNames.length} name{filteredNames.length !== 1 ? 's' : ''}{' '}
            available for {archetype}
            {searchTerm && filteredNames.length < availableNames.length && (
              <> (filtered from {availableNames.length} total)</>
            )}
          </>
        ) : (
          'Loading available names...'
        )}
      </p>

      {/* Selected Name Display */}
      {selectedName && (
        <div className="selected-name-display" data-testid="selected-name-display">
          <span className="checkmark">✓</span> Selected: <strong>{selectedName}</strong>
        </div>
      )}

      {/* Keyboard Shortcuts Hint */}
      {showDropdown && (
        <div className="keyboard-hints">
          <span>↑↓ Navigate</span>
          <span>Enter Select</span>
          <span>Esc Close</span>
        </div>
      )}
    </div>
  );
};

export default PersonaNameSelector;
