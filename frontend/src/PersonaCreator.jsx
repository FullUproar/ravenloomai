/**
 * PersonaCreator Component
 *
 * Bounded persona creation UI that prevents abuse while allowing
 * creative personalization within guardrails.
 *
 * Safety features:
 * - Archetype selection (not creation)
 * - Specialization selection from curated list
 * - Display name validation with pattern enforcement
 * - Custom instructions content filtering
 * - Real-time validation feedback
 */

import React, { useState, useEffect } from 'react';
import './PersonaCreator.css';

// Archetype definitions (matches backend)
const ARCHETYPES = {
  coach: {
    icon: '🏃',
    title: 'Coach',
    description: 'Encouraging, habit-focused, empathetic',
    voice: 'encouraging',
    specializations: [
      { id: 'health', name: 'Health Coach', focus: 'Nutrition, exercise, wellness' },
      { id: 'fitness', name: 'Fitness Coach', focus: 'Workout programming, recovery' },
      { id: 'accountability', name: 'Accountability Partner', focus: 'Addiction recovery, triggers' },
      { id: 'skill', name: 'Skill Coach', focus: 'Deliberate practice, learning' },
    ],
  },
  advisor: {
    icon: '📊',
    title: 'Advisor',
    description: 'Analytical, decision-focused, formal',
    voice: 'analytical',
    specializations: [
      { id: 'academic', name: 'Academic Advisor', focus: 'College admissions, test prep' },
      { id: 'financial', name: 'Financial Advisor', focus: 'Budgeting, investing, debt payoff' },
      { id: 'career', name: 'Career Advisor', focus: 'Job search, resume, interviews' },
    ],
  },
  strategist: {
    icon: '🎯',
    title: 'Strategist',
    description: 'Direct, execution-focused, data-driven',
    voice: 'direct',
    specializations: [
      { id: 'launch', name: 'Launch Strategist', focus: 'Product launches, GTM strategy' },
      { id: 'campaign', name: 'Campaign Manager', focus: 'Political strategy, fundraising' },
      { id: 'growth', name: 'Growth Strategist', focus: 'User acquisition, retention' },
    ],
  },
  partner: {
    icon: '🤝',
    title: 'Partner',
    description: 'Supportive, creativity-focused, collaborative',
    voice: 'supportive',
    specializations: [
      { id: 'creative', name: 'Creative Partner', focus: 'Writing, editing, creative blocks' },
      { id: 'research', name: 'Research Partner', focus: 'Literature review, methodology' },
    ],
  },
  manager: {
    icon: '📋',
    title: 'Manager',
    description: 'Structured, coordination-focused, process-oriented',
    voice: 'structured',
    specializations: [
      { id: 'scrum', name: 'Scrum Master', focus: 'Agile ceremonies, velocity tracking' },
      { id: 'project', name: 'Project Manager', focus: 'Gantt charts, critical path, risks' },
    ],
  },
  coordinator: {
    icon: '🗓️',
    title: 'Coordinator',
    description: 'Detailed, logistics-focused, organized',
    voice: 'detailed',
    specializations: [
      { id: 'event', name: 'Event Coordinator', focus: 'Venue, catering, guest logistics' },
      { id: 'renovation', name: 'Renovation Coordinator', focus: 'Permits, contractors, inspections' },
    ],
  },
};

const PersonaCreator = ({ onCreatePersona, onCancel }) => {
  const [step, setStep] = useState(1); // 1=archetype, 2=specialization, 3=personalize
  const [selectedArchetype, setSelectedArchetype] = useState(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [communicationPrefs, setCommunicationPrefs] = useState({
    formality: 5,
    emojiUsage: 5,
    checkinFrequency: 'as_needed',
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate display name when specialization selected
  useEffect(() => {
    if (selectedArchetype && selectedSpecialization) {
      const archetype = ARCHETYPES[selectedArchetype];
      const spec = archetype.specializations.find(s => s.id === selectedSpecialization);
      setDisplayName(`Your Name the ${archetype.title}`);
    }
  }, [selectedArchetype, selectedSpecialization]);

  // Validate display name in real-time
  const validateDisplayName = (name) => {
    if (!name || name.trim().length === 0) {
      return 'Display name is required';
    }

    if (name.length > 50) {
      return 'Display name too long (max 50 characters)';
    }

    const archetype = ARCHETYPES[selectedArchetype];
    const pattern = new RegExp(`^[\\w\\s]+ the ${archetype.title}$`, 'i');
    if (!pattern.test(name)) {
      return `Must follow pattern: "[Your Name] the ${archetype.title}"`;
    }

    // Simple profanity check (add more comprehensive check in backend)
    const profanity = ['fuck', 'shit', 'bitch', 'ass'];
    const lower = name.toLowerCase();
    if (profanity.some(word => lower.includes(word))) {
      return 'Display name contains inappropriate language';
    }

    return null;
  };

  // Validate custom instructions
  const validateCustomInstructions = (text) => {
    if (text.length > 500) {
      return 'Custom instructions too long (max 500 characters)';
    }

    // Check for prompt injection patterns
    const injectionPatterns = [
      /ignore (all )?previous (instructions?|prompts?)/i,
      /disregard (all )?previous (instructions?|prompts?)/i,
      /you are (now|actually)/i,
      /system:/i,
    ];

    if (injectionPatterns.some(pattern => pattern.test(text))) {
      return 'Custom instructions contain disallowed patterns';
    }

    return null;
  };

  // Handle archetype selection
  const handleArchetypeSelect = (archetypeKey) => {
    setSelectedArchetype(archetypeKey);
    setSelectedSpecialization(null);
    setStep(2);
  };

  // Handle specialization selection
  const handleSpecializationSelect = (specializationId) => {
    setSelectedSpecialization(specializationId);
    setStep(3);
  };

  // Handle display name change
  const handleDisplayNameChange = (e) => {
    const value = e.target.value;
    setDisplayName(value);

    const error = validateDisplayName(value);
    setValidationErrors(prev => ({ ...prev, displayName: error }));
  };

  // Handle custom instructions change
  const handleCustomInstructionsChange = (e) => {
    const value = e.target.value;
    setCustomInstructions(value);

    if (value.trim().length > 0) {
      const error = validateCustomInstructions(value);
      setValidationErrors(prev => ({ ...prev, customInstructions: error }));
    } else {
      setValidationErrors(prev => ({ ...prev, customInstructions: null }));
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Final validation
    const nameError = validateDisplayName(displayName);
    const instructionsError = customInstructions.trim().length > 0
      ? validateCustomInstructions(customInstructions)
      : null;

    if (nameError || instructionsError) {
      setValidationErrors({
        displayName: nameError,
        customInstructions: instructionsError,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const personaData = {
        archetype: selectedArchetype,
        specialization: selectedSpecialization,
        displayName,
        customInstructions: customInstructions.trim() || null,
        communicationPreferences: communicationPrefs,
        role: 'primary', // First persona is primary
      };

      await onCreatePersona(personaData);
    } catch (error) {
      setValidationErrors({ submit: error.message });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="persona-creator" data-testid="persona-creator">
      {/* Progress indicator */}
      <div className="progress-steps">
        <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
          <span className="step-number">1</span>
          <span className="step-label">Archetype</span>
        </div>
        <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">Specialization</span>
        </div>
        <div className={`step ${step >= 3 ? 'active' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Personalize</span>
        </div>
      </div>

      {/* Step 1: Choose Archetype */}
      {step === 1 && (
        <div className="archetype-selection" data-testid="archetype-step">
          <h2>Choose Your Archetype</h2>
          <p className="step-description">
            Select the communication style that best fits your needs.
            You cannot create custom archetypes.
          </p>

          <div className="archetype-grid">
            {Object.entries(ARCHETYPES).map(([key, archetype]) => (
              <div
                key={key}
                className="archetype-card"
                onClick={() => handleArchetypeSelect(key)}
                data-testid={`archetype-${key}`}
              >
                <div className="archetype-icon">{archetype.icon}</div>
                <h3>{archetype.title}</h3>
                <p>{archetype.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Choose Specialization */}
      {step === 2 && selectedArchetype && (
        <div className="specialization-selection" data-testid="specialization-step">
          <h2>Choose Specialization</h2>
          <p className="step-description">
            Archetype: <strong>{ARCHETYPES[selectedArchetype].icon} {ARCHETYPES[selectedArchetype].title}</strong>
          </p>

          <div className="specialization-list">
            {ARCHETYPES[selectedArchetype].specializations.map((spec) => (
              <div
                key={spec.id}
                className="specialization-card"
                onClick={() => handleSpecializationSelect(spec.id)}
                data-testid={`specialization-${spec.id}`}
              >
                <h3>{spec.name}</h3>
                <p className="specialization-focus">{spec.focus}</p>
              </div>
            ))}
          </div>

          <button className="back-button" onClick={() => setStep(1)}>
            ← Back to Archetypes
          </button>
        </div>
      )}

      {/* Step 3: Personalize */}
      {step === 3 && selectedArchetype && selectedSpecialization && (
        <div className="personalization-form" data-testid="personalization-step">
          <h2>Personalize Your Persona</h2>
          <p className="step-description">
            {ARCHETYPES[selectedArchetype].icon} {ARCHETYPES[selectedArchetype].title} →{' '}
            {ARCHETYPES[selectedArchetype].specializations.find(s => s.id === selectedSpecialization)?.name}
          </p>

          {/* Display Name */}
          <div className="form-group">
            <label htmlFor="displayName">
              Display Name <span className="required">*</span>
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={handleDisplayNameChange}
              placeholder={`Your Name the ${ARCHETYPES[selectedArchetype].title}`}
              data-testid="display-name-input"
              className={validationErrors.displayName ? 'error' : ''}
              maxLength={50}
            />
            {validationErrors.displayName && (
              <p className="error-message">{validationErrors.displayName}</p>
            )}
            <p className="field-hint">
              Must follow pattern: "[Your Name] the {ARCHETYPES[selectedArchetype].title}"
              <br />
              Example: Sarah the {ARCHETYPES[selectedArchetype].title}
            </p>
          </div>

          {/* Custom Instructions */}
          <div className="form-group">
            <label htmlFor="customInstructions">
              Custom Instructions <span className="optional">(optional)</span>
            </label>
            <textarea
              id="customInstructions"
              value={customInstructions}
              onChange={handleCustomInstructionsChange}
              placeholder="E.g., I prefer metric units. I have dietary restrictions. I'm focused on sustainable practices."
              data-testid="custom-instructions-input"
              className={validationErrors.customInstructions ? 'error' : ''}
              maxLength={500}
              rows={4}
            />
            <p className="character-count">
              {customInstructions.length}/500 characters
            </p>
            {validationErrors.customInstructions && (
              <p className="error-message">{validationErrors.customInstructions}</p>
            )}
            <p className="field-hint">
              Add context about your preferences, constraints, or goals.
              Do not attempt to override system behavior.
            </p>
          </div>

          {/* Communication Style */}
          <div className="form-group">
            <label>Communication Style</label>

            <div className="slider-group">
              <label htmlFor="formality">
                Formality: <strong>{communicationPrefs.formality === 0 ? 'Casual' : communicationPrefs.formality === 10 ? 'Formal' : 'Balanced'}</strong>
              </label>
              <input
                type="range"
                id="formality"
                min="0"
                max="10"
                value={communicationPrefs.formality}
                onChange={(e) => setCommunicationPrefs(prev => ({ ...prev, formality: parseInt(e.target.value) }))}
                data-testid="formality-slider"
              />
              <div className="slider-labels">
                <span>Casual</span>
                <span>Formal</span>
              </div>
            </div>

            <div className="slider-group">
              <label htmlFor="emojiUsage">
                Emoji Usage: <strong>{communicationPrefs.emojiUsage === 0 ? 'None' : communicationPrefs.emojiUsage === 10 ? 'Frequent' : 'Moderate'}</strong>
              </label>
              <input
                type="range"
                id="emojiUsage"
                min="0"
                max="10"
                value={communicationPrefs.emojiUsage}
                onChange={(e) => setCommunicationPrefs(prev => ({ ...prev, emojiUsage: parseInt(e.target.value) }))}
                data-testid="emoji-slider"
              />
              <div className="slider-labels">
                <span>None</span>
                <span>Frequent</span>
              </div>
            </div>

            <div className="radio-group">
              <label>Check-in Frequency:</label>
              <div className="radio-options">
                <label>
                  <input
                    type="radio"
                    name="checkinFrequency"
                    value="as_needed"
                    checked={communicationPrefs.checkinFrequency === 'as_needed'}
                    onChange={(e) => setCommunicationPrefs(prev => ({ ...prev, checkinFrequency: e.target.value }))}
                    data-testid="checkin-as-needed"
                  />
                  As Needed
                </label>
                <label>
                  <input
                    type="radio"
                    name="checkinFrequency"
                    value="daily"
                    checked={communicationPrefs.checkinFrequency === 'daily'}
                    onChange={(e) => setCommunicationPrefs(prev => ({ ...prev, checkinFrequency: e.target.value }))}
                    data-testid="checkin-daily"
                  />
                  Daily
                </label>
                <label>
                  <input
                    type="radio"
                    name="checkinFrequency"
                    value="weekly"
                    checked={communicationPrefs.checkinFrequency === 'weekly'}
                    onChange={(e) => setCommunicationPrefs(prev => ({ ...prev, checkinFrequency: e.target.value }))}
                    data-testid="checkin-weekly"
                  />
                  Weekly
                </label>
              </div>
            </div>
          </div>

          {/* Submit Error */}
          {validationErrors.submit && (
            <div className="submit-error">
              <p className="error-message">{validationErrors.submit}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="form-actions">
            <button
              className="back-button"
              onClick={() => setStep(2)}
              disabled={isSubmitting}
            >
              ← Back
            </button>
            <button
              className="cancel-button"
              onClick={onCancel}
              disabled={isSubmitting}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              className="submit-button"
              onClick={handleSubmit}
              disabled={isSubmitting || validationErrors.displayName || validationErrors.customInstructions}
              data-testid="create-persona-button"
            >
              {isSubmitting ? 'Creating...' : 'Create Persona'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonaCreator;
