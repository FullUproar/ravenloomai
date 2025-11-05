/**
 * PersonaNameSelector Component Stories
 *
 * Demonstrates typeahead search and random name selection.
 */

import PersonaNameSelector from './PersonaNameSelector';

export default {
  title: 'Components/PersonaNameSelector',
  component: PersonaNameSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

// Sample available names data
const SAMPLE_NAMES = [
  { name: 'Emma', popularity_rank: 1 },
  { name: 'Olivia', popularity_rank: 2 },
  { name: 'Ava', popularity_rank: 3 },
  { name: 'Isabella', popularity_rank: 4 },
  { name: 'Sophia', popularity_rank: 5 },
  { name: 'Liam', popularity_rank: 6 },
  { name: 'Noah', popularity_rank: 7 },
  { name: 'William', popularity_rank: 8 },
  { name: 'James', popularity_rank: 9 },
  { name: 'Oliver', popularity_rank: 10 },
  { name: 'Sarah', popularity_rank: 11 },
  { name: 'Marcus', popularity_rank: 12 },
  { name: 'Alex', popularity_rank: 13 },
  { name: 'Jordan', popularity_rank: 14 },
  { name: 'Taylor', popularity_rank: 15 },
  { name: 'Luna', popularity_rank: 16 },
  { name: 'Stella', popularity_rank: 17 },
  { name: 'Hazel', popularity_rank: 18 },
  { name: 'Violet', popularity_rank: 19 },
  { name: 'Aurora', popularity_rank: 20 },
  { name: 'Savannah', popularity_rank: 21 },
  { name: 'Brooklyn', popularity_rank: 22 },
  { name: 'Mason', popularity_rank: 23 },
  { name: 'Logan', popularity_rank: 24 },
  { name: 'Lucas', popularity_rank: 25 },
  { name: 'Ethan', popularity_rank: 26 },
  { name: 'Jackson', popularity_rank: 27 },
  { name: 'Aiden', popularity_rank: 28 },
  { name: 'Carter', popularity_rank: 29 },
  { name: 'Aria', popularity_rank: 30 },
];

// Default state - ready to search
export const Default = {
  args: {
    archetype: 'coach',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: SAMPLE_NAMES,
    isLoading: false,
  },
};

// With name selected
export const NameSelected = {
  args: {
    archetype: 'coach',
    selectedName: 'Sarah',
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: SAMPLE_NAMES,
    isLoading: false,
  },
};

// Loading state
export const Loading = {
  args: {
    archetype: 'coach',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: [],
    isLoading: true,
  },
};

// Many names (performance test)
const MANY_NAMES = Array.from({ length: 200 }, (_, i) => ({
  name: `Name${i + 1}`,
  popularity_rank: i + 1,
}));

export const ManyNames = {
  args: {
    archetype: 'advisor',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: MANY_NAMES,
    isLoading: false,
  },
};

// Few names remaining
const FEW_NAMES = [
  { name: 'Zara', popularity_rank: 150 },
  { name: 'Zion', popularity_rank: 175 },
  { name: 'Zoe', popularity_rank: 180 },
];

export const FewNamesRemaining = {
  args: {
    archetype: 'strategist',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: FEW_NAMES,
    isLoading: false,
  },
};

// No names available (all claimed)
export const NoNamesAvailable = {
  args: {
    archetype: 'partner',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: [],
    isLoading: false,
  },
};

// Interactive example with state management
export const Interactive = {
  render: () => {
    const [selectedName, setSelectedName] = React.useState(null);

    return (
      <div style={{ width: '500px' }}>
        <PersonaNameSelector
          archetype="coach"
          selectedName={selectedName}
          onSelectName={(name) => {
            console.log('Selected:', name);
            setSelectedName(name);
          }}
          availableNames={SAMPLE_NAMES}
          isLoading={false}
        />

        <div style={{ marginTop: '24px', padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
          <strong>Current Selection:</strong>{' '}
          {selectedName ? (
            <span style={{ color: '#10B981' }}>{selectedName}</span>
          ) : (
            <span style={{ color: '#6B7280' }}>None</span>
          )}
        </div>

        <div style={{ marginTop: '16px', fontSize: '14px', color: '#6B7280' }}>
          <p><strong>Try these features:</strong></p>
          <ul>
            <li>Type "S" to filter names starting with S</li>
            <li>Click "🎲 Random" to pick a random name</li>
            <li>Use arrow keys to navigate dropdown</li>
            <li>Press Enter to select highlighted name</li>
            <li>Press Escape to close dropdown</li>
          </ul>
        </div>
      </div>
    );
  },
};

// Different archetypes
export const AdvisorArchetype = {
  args: {
    archetype: 'advisor',
    selectedName: 'Marcus',
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: SAMPLE_NAMES,
    isLoading: false,
  },
};

export const StrategistArchetype = {
  args: {
    archetype: 'strategist',
    selectedName: 'Alex',
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: SAMPLE_NAMES,
    isLoading: false,
  },
};

// Edge case: Single name
export const SingleName = {
  args: {
    archetype: 'coordinator',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: [{ name: 'Luna', popularity_rank: 1 }],
    isLoading: false,
  },
};

// Accessibility example
export const KeyboardNavigation = {
  args: {
    archetype: 'manager',
    selectedName: null,
    onSelectName: (name) => console.log('Selected:', name),
    availableNames: SAMPLE_NAMES,
    isLoading: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Use keyboard to navigate: Arrow keys to move, Enter to select, Escape to close.',
      },
    },
  },
};
