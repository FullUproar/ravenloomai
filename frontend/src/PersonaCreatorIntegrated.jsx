/**
 * Integrated Persona Creator
 *
 * Complete 3-step persona creation flow with:
 * 1. Select archetype & specialization
 * 2. Choose name from available baby names
 * 3. Pick color and shape for avatar
 */

import { useState, useEffect } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import PersonaNameSelector from './PersonaNameSelector.jsx';
import PersonaColorPicker from './PersonaColorPicker.jsx';
import './PersonaCreator.css';

// GraphQL Queries
const GET_AVAILABLE_NAMES = gql`
  query GetAvailableNames($archetype: String!) {
    getAvailableNames(archetype: $archetype) {
      id
      name
      popularityRank
      isAvailable
    }
  }
`;

const CLAIM_PERSONA_NAME = gql`
  mutation ClaimPersonaName(
    $userId: String!
    $name: String!
    $archetype: String!
    $color: String!
    $shape: String!
  ) {
    claimPersonaName(
      userId: $userId
      name: $name
      archetype: $archetype
      color: $color
      shape: $shape
    ) {
      id
      name
      archetype
      claimedAt
    }
  }
`;

const CREATE_PERSONA = gql`
  mutation CreatePersona(
    $projectId: ID!
    $userId: String!
    $input: PersonaInput!
  ) {
    createPersona(projectId: $projectId, userId: $userId, input: $input) {
      id
      displayName
      archetype
      specialization
      color
      shape
    }
  }
`;

// Archetype configuration
const ARCHETYPES = {
  coach: {
    name: 'Coach',
    emoji: '🏃',
    description: 'Motivates and guides you to reach your goals',
    specializations: ['Health', 'Fitness', 'Career', 'Life', 'Financial']
  },
  advisor: {
    name: 'Advisor',
    emoji: '💼',
    description: 'Provides expert guidance and strategic planning',
    specializations: ['Business', 'Financial', 'Career', 'Legal', 'Technical']
  },
  teacher: {
    name: 'Teacher',
    emoji: '📚',
    description: 'Educates and helps you learn new skills',
    specializations: ['Academic', 'Technical', 'Creative', 'Language', 'Music']
  },
  therapist: {
    name: 'Therapist',
    emoji: '🧠',
    description: 'Supports your mental health and emotional wellbeing',
    specializations: ['Mental Health', 'Relationships', 'Stress', 'Grief', 'Trauma']
  },
  mentor: {
    name: 'Mentor',
    emoji: '🎯',
    description: 'Shares wisdom and experience to guide your journey',
    specializations: ['Leadership', 'Entrepreneurship', 'Creative', 'Technical', 'Personal']
  },
  companion: {
    name: 'Companion',
    emoji: '🤝',
    description: 'Provides friendly support and accountability',
    specializations: ['General', 'Study Buddy', 'Work Partner', 'Habit', 'Social']
  }
};

function PersonaCreatorIntegrated({ userId, projectId, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [archetype, setArchetype] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3B82F6');
  const [selectedShape, setSelectedShape] = useState('circle');

  // Query available names based on selected archetype
  const { loading: namesLoading, data: namesData } = useQuery(GET_AVAILABLE_NAMES, {
    variables: { archetype },
    skip: !archetype || step !== 2,
  });

  const [claimName, { loading: claimingName }] = useMutation(CLAIM_PERSONA_NAME);
  const [createPersona, { loading: creatingPersona }] = useMutation(CREATE_PERSONA);

  const handleArchetypeSelect = (selectedArchetype) => {
    setArchetype(selectedArchetype);
    setSpecialization(ARCHETYPES[selectedArchetype].specializations[0]);
    setStep(2);
  };

  const handleNameConfirm = () => {
    if (selectedName) {
      setStep(3);
    }
  };

  const handleComplete = async () => {
    try {
      // Step 1: Claim the name
      await claimName({
        variables: {
          userId,
          name: selectedName,
          archetype,
          color: selectedColor,
          shape: selectedShape,
        },
      });

      // Step 2: Create the persona
      const displayName = `${selectedName} the ${ARCHETYPES[archetype].name}`;

      const result = await createPersona({
        variables: {
          projectId,
          userId,
          input: {
            archetype,
            specialization,
            customInstructions: '',
            communicationPreferences: {
              tone: 'friendly',
              verbosity: 'balanced',
              emoji: true,
              platitudes: false,
            },
          },
        },
      });

      onComplete(result.data.createPersona);
    } catch (error) {
      console.error('Error creating persona:', error);
      alert('Failed to create persona: ' + error.message);
    }
  };

  const availableNames = (namesData?.getAvailableNames || [])
    .filter(n => n.isAvailable)
    .map(n => ({ name: n.name, popularityRank: n.popularityRank }));

  return (
    <div className="persona-creator">
      {/* Progress Steps */}
      <div className="progress-steps">
        <div className={`progress-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Choose Type</div>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Pick Name</div>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-label">Customize</div>
        </div>
      </div>

      {/* Step 1: Archetype Selection */}
      {step === 1 && (
        <div className="step-content">
          <h2>What type of persona do you need?</h2>
          <p className="step-description">
            Choose the role that best matches your goal
          </p>

          <div className="archetype-grid">
            {Object.entries(ARCHETYPES).map(([key, archetype]) => (
              <button
                key={key}
                className="archetype-card"
                onClick={() => handleArchetypeSelect(key)}
              >
                <div className="archetype-emoji">{archetype.emoji}</div>
                <h3>{archetype.name}</h3>
                <p>{archetype.description}</p>
              </button>
            ))}
          </div>

          <div className="step-actions">
            <button className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Name Selection */}
      {step === 2 && (
        <div className="step-content">
          <h2>Choose a name for your {ARCHETYPES[archetype].name}</h2>
          <p className="step-description">
            Each name is unique – once claimed, it's yours
          </p>

          {/* Specialization selector */}
          <div className="field">
            <label>Specialization</label>
            <select
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              className="select"
            >
              {ARCHETYPES[archetype].specializations.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          <PersonaNameSelector
            archetype={archetype}
            selectedName={selectedName}
            onSelectName={setSelectedName}
            availableNames={availableNames}
            isLoading={namesLoading}
          />

          <div className="step-actions">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleNameConfirm}
              disabled={!selectedName}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Color & Shape Selection */}
      {step === 3 && (
        <div className="step-content">
          <h2>Customize your persona's appearance</h2>
          <p className="step-description">
            Choose a color and shape for {selectedName}'s avatar
          </p>

          <PersonaColorPicker
            selectedColor={selectedColor}
            onSelectColor={(color, shape) => {
              setSelectedColor(color);
              if (shape) setSelectedShape(shape);
            }}
            personaName={selectedName}
            showPreview={true}
            shape={selectedShape}
          />

          <div className="step-actions">
            <button className="btn-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleComplete}
              disabled={claimingName || creatingPersona}
            >
              {claimingName || creatingPersona ? 'Creating...' : 'Create Persona'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PersonaCreatorIntegrated;
