/**
 * PersonaAvatar Component Stories
 *
 * Demonstrates avatar sizes, shapes, and colors.
 */

import PersonaAvatar from './PersonaAvatar';

export default {
  title: 'Components/PersonaAvatar',
  component: PersonaAvatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

// Default medium circle
export const Default = {
  args: {
    personaName: 'Sarah',
    color: '#3B82F6',
    shape: 'circle',
    size: 'medium',
    showName: false,
  },
};

// All sizes
export const Sizes = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
      <PersonaAvatar personaName="S" color="#DC2626" size="small" showName={true} />
      <PersonaAvatar personaName="M" color="#059669" size="medium" showName={true} />
      <PersonaAvatar personaName="L" color="#7C3AED" size="large" showName={true} />
      <PersonaAvatar personaName="XL" color="#EA580C" size="xlarge" showName={true} />
    </div>
  ),
};

// Circle vs Square
export const Shapes = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h4 style={{ marginBottom: '16px' }}>Circle Avatars</h4>
        <div style={{ display: 'flex', gap: '16px' }}>
          <PersonaAvatar personaName="Sarah" color="#DC2626" shape="circle" size="large" showName={true} />
          <PersonaAvatar personaName="Marcus" color="#0284C7" shape="circle" size="large" showName={true} />
          <PersonaAvatar personaName="Alex" color="#059669" shape="circle" size="large" showName={true} />
        </div>
      </div>
      <div>
        <h4 style={{ marginBottom: '16px' }}>Square Avatars</h4>
        <div style={{ display: 'flex', gap: '16px' }}>
          <PersonaAvatar personaName="Emma" color="#E11D48" shape="square" size="large" showName={true} />
          <PersonaAvatar personaName="Liam" color="#4F46E5" shape="square" size="large" showName={true} />
          <PersonaAvatar personaName="Olivia" color="#9333EA" shape="square" size="large" showName={true} />
        </div>
      </div>
    </div>
  ),
};

// Different colors
export const Colors = {
  render: () => {
    const colors = [
      { name: 'Crimson', hex: '#DC2626' },
      { name: 'Rose', hex: '#E11D48' },
      { name: 'Orange', hex: '#EA580C' },
      { name: 'Amber', hex: '#D97706' },
      { name: 'Sky', hex: '#0284C7' },
      { name: 'Blue', hex: '#2563EB' },
      { name: 'Indigo', hex: '#4F46E5' },
      { name: 'Violet', hex: '#7C3AED' },
      { name: 'Pink', hex: '#DB2777' },
      { name: 'Fuchsia', hex: '#C026D3' },
      { name: 'Purple', hex: '#9333EA' },
      { name: 'Emerald', hex: '#059669' },
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
        {colors.map((color, index) => (
          <div key={color.hex} style={{ textAlign: 'center' }}>
            <PersonaAvatar
              personaName={color.name[0]}
              color={color.hex}
              size="large"
              shape="circle"
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#6B7280' }}>
              {color.name}
            </div>
          </div>
        ))}
      </div>
    );
  },
};

// With name labels
export const WithNames = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PersonaAvatar personaName="Sarah" color="#DC2626" size="medium" showName={true} />
      <PersonaAvatar personaName="Marcus" color="#0284C7" size="medium" showName={true} />
      <PersonaAvatar personaName="Alex" color="#059669" size="medium" showName={true} />
      <PersonaAvatar personaName="Emma" color="#E11D48" size="medium" showName={true} />
      <PersonaAvatar personaName="Liam" color="#7C3AED" size="medium" showName={true} />
    </div>
  ),
};

// Chat message context
export const InChatMessage = {
  render: () => (
    <div style={{ width: '500px' }}>
      {/* User message */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        alignItems: 'flex-start',
      }}>
        <PersonaAvatar personaName="You" color="#6B7280" size="small" shape="circle" />
        <div style={{
          background: '#F3F4F6',
          padding: '12px 16px',
          borderRadius: '12px',
          flex: 1,
        }}>
          <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>You</div>
          <div style={{ fontSize: '14px' }}>I want to lose 10 pounds by summer</div>
        </div>
      </div>

      {/* AI message */}
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}>
        <PersonaAvatar personaName="Sarah" color="#DC2626" size="small" shape="circle" />
        <div style={{
          background: '#DBEAFE',
          padding: '12px 16px',
          borderRadius: '12px',
          flex: 1,
        }}>
          <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>Sarah the Health Coach</div>
          <div style={{ fontSize: '14px' }}>Perfect! I've set up your goal. What's your current weight?</div>
        </div>
      </div>
    </div>
  ),
};

// Persona list
export const InPersonaList = {
  render: () => (
    <div style={{ width: '400px' }}>
      <div style={{ marginBottom: '16px', fontWeight: '600' }}>Your Personas</div>

      {[
        { name: 'Sarah', archetype: 'Health Coach', color: '#DC2626', active: true },
        { name: 'Marcus', archetype: 'Launch Strategist', color: '#0284C7', active: false },
        { name: 'Alex', archetype: 'Creative Partner', color: '#059669', active: false },
      ].map((persona) => (
        <div
          key={persona.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            border: '2px solid #E5E7EB',
            borderRadius: '8px',
            marginBottom: '8px',
            background: persona.active ? '#EFF6FF' : 'white',
            borderColor: persona.active ? '#3B82F6' : '#E5E7EB',
            cursor: 'pointer',
          }}
        >
          <PersonaAvatar
            personaName={persona.name}
            color={persona.color}
            size="medium"
            shape="circle"
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{persona.name}</div>
            <div style={{ fontSize: '14px', color: '#6B7280' }}>{persona.archetype}</div>
          </div>
          {persona.active && (
            <span style={{
              padding: '4px 8px',
              background: '#10B981',
              color: 'white',
              fontSize: '12px',
              borderRadius: '4px',
              fontWeight: '600',
            }}>
              Active
            </span>
          )}
        </div>
      ))}
    </div>
  ),
};

// Small size (for compact displays)
export const SmallInList = {
  render: () => (
    <div style={{ width: '300px' }}>
      {['Sarah', 'Marcus', 'Alex', 'Emma', 'Liam'].map((name, i) => (
        <div
          key={name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <PersonaAvatar
            personaName={name}
            color={['#DC2626', '#0284C7', '#059669', '#E11D48', '#7C3AED'][i]}
            size="small"
            shape="circle"
          />
          <span style={{ fontSize: '14px' }}>{name} the Coach</span>
        </div>
      ))}
    </div>
  ),
};

// X-Large (profile page)
export const ProfileDisplay = {
  render: () => (
    <div style={{ textAlign: 'center', padding: '32px' }}>
      <PersonaAvatar
        personaName="Sarah"
        color="#DC2626"
        size="xlarge"
        shape="circle"
      />
      <h2 style={{ marginTop: '16px', marginBottom: '4px' }}>Sarah the Health Coach</h2>
      <p style={{ color: '#6B7280', fontSize: '14px' }}>Active • Last used 5 minutes ago</p>
    </div>
  ),
};

// All combinations
export const AllCombinations = {
  render: () => (
    <div>
      <h3>All Size & Shape Combinations</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginTop: '16px' }}>
        {['small', 'medium', 'large', 'xlarge'].map((size) => (
          <div key={size}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', marginBottom: '8px', textTransform: 'capitalize' }}>
                {size}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <PersonaAvatar personaName="S" color="#DC2626" size={size} shape="circle" />
                <PersonaAvatar personaName="S" color="#DC2626" size={size} shape="square" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
};
