/**
 * RavenHome - The primary surface of RavenLoom
 *
 * "Tell me something, or ask me anything."
 *
 * This is where 90% of the product lives. It wraps the Ask/Remember flow
 * (RavenKnowledge) with the brief's UX: scope toggle, fact counter,
 * minimal chrome, and no jargon.
 */

import { useState } from 'react';
import RavenKnowledge from './RavenKnowledge';

export default function RavenHome({
  teamId,
  scopeId,
  scopeName,
  isPrivate,
  onTogglePrivate,
  factCount,
  onFactsChanged,
  user,
  onShowTraversal,
}) {
  return (
    <div className="raven-home">
      {/* Scope toggle + context */}
      <div className="raven-home-toolbar">
        <button
          className={`scope-toggle ${isPrivate ? 'private' : 'team'}`}
          onClick={onTogglePrivate}
          title={isPrivate ? 'Only you can see facts saved here' : 'Facts are shared with your team'}
        >
          <span className="scope-toggle-indicator" />
          <span className="scope-toggle-label">
            {isPrivate ? 'Just Me' : 'My Team'}
          </span>
        </button>

        {factCount > 0 && (
          <span className="raven-home-fact-count">
            {factCount} {factCount === 1 ? 'fact' : 'facts'} confirmed
          </span>
        )}
      </div>

      {/* The core: Ask + Remember */}
      <div className="raven-home-main">
        <RavenKnowledge
          teamId={teamId}
          scopeId={scopeId}
          scopeName={scopeName}
          onFactsChanged={onFactsChanged}
          onShowTraversal={onShowTraversal}
        />
      </div>
    </div>
  );
}
