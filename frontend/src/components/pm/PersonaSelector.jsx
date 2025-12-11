/**
 * Persona Selector - Choose your workflow focus
 * Allows users to select their role which customizes nav and default features
 */

import { gql, useMutation, useQuery } from '@apollo/client';

const GET_MY_FEATURE_FLAGS = gql`
  query GetMyFeatureFlags {
    getMyFeatureFlags {
      workflowPersona
    }
  }
`;

const SET_WORKFLOW_PERSONA = gql`
  mutation SetWorkflowPersona($persona: String!) {
    setWorkflowPersona(persona: $persona) {
      workflowPersona
      showGanttChart
      showEisenhowerMatrix
      showWorkloadHistogram
      showMilestones
      showTimeBlocking
      showContexts
      showDependenciesGraph
      showResourceAllocation
      showCriticalPath
    }
  }
`;

const PERSONAS = [
  {
    id: 'contributor',
    title: 'Contributor',
    icon: '🎯',
    description: 'Individual productivity focus',
    details: 'Tasks, goals, and personal productivity tools like Eisenhower Matrix and Time Blocking.',
    bestFor: 'Individual contributors, developers, designers, writers'
  },
  {
    id: 'team_lead',
    title: 'Team Lead',
    icon: '👥',
    description: 'Team coordination + doing',
    details: 'Everything a contributor has, plus team workload visibility, milestones, and resource views.',
    bestFor: 'Tech leads, team managers, department heads'
  },
  {
    id: 'project_manager',
    title: 'Project Manager',
    icon: '📊',
    description: 'Project delivery focus',
    details: 'Full PM toolkit: Gantt charts, dependencies, critical path, milestones, resource allocation.',
    bestFor: 'Project managers, program managers, PMOs'
  },
  {
    id: 'executive',
    title: 'Executive',
    icon: '📈',
    description: 'Strategic oversight',
    details: 'High-level views: goals/OKRs, team health metrics, milestone tracking, workload overview.',
    bestFor: 'Directors, VPs, executives, founders'
  }
];

function PersonaSelector({ onSelect, compact = false }) {
  const { data, loading } = useQuery(GET_MY_FEATURE_FLAGS);
  const [setPersona, { loading: saving }] = useMutation(SET_WORKFLOW_PERSONA, {
    refetchQueries: ['GetMyFeatureFlags']
  });

  const currentPersona = data?.getMyFeatureFlags?.workflowPersona || 'contributor';

  const handleSelect = async (personaId) => {
    try {
      await setPersona({ variables: { persona: personaId } });
      if (onSelect) onSelect(personaId);
    } catch (err) {
      console.error('Error setting persona:', err);
    }
  };

  if (loading) {
    return (
      <div className="persona-selector loading">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="persona-selector-compact">
        <label className="persona-label">Workflow Focus</label>
        <select
          className="input-field"
          value={currentPersona}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={saving}
        >
          {PERSONAS.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.icon} {persona.title}
            </option>
          ))}
        </select>
        <p className="persona-hint">
          {PERSONAS.find(p => p.id === currentPersona)?.description}
        </p>
      </div>
    );
  }

  return (
    <div className="persona-selector">
      <div className="persona-header">
        <h3>Choose Your Workflow Focus</h3>
        <p>Select how you primarily work to customize your experience</p>
      </div>

      <div className="persona-grid">
        {PERSONAS.map((persona) => (
          <button
            key={persona.id}
            className={`persona-card ${currentPersona === persona.id ? 'selected' : ''}`}
            onClick={() => handleSelect(persona.id)}
            disabled={saving}
          >
            <div className="persona-icon">{persona.icon}</div>
            <div className="persona-title">{persona.title}</div>
            <div className="persona-description">{persona.description}</div>
            <div className="persona-details">{persona.details}</div>
            <div className="persona-best-for">
              <strong>Best for:</strong> {persona.bestFor}
            </div>
            {currentPersona === persona.id && (
              <div className="persona-selected-badge">Current</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default PersonaSelector;
