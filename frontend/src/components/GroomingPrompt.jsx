/**
 * GroomingPrompt — Suggests and runs knowledge graph grooming
 *
 * Appears when Raven detects it could benefit from organizing:
 * - After N low-confidence answers
 * - When the user triggers it manually
 *
 * Shows progress and results in a friendly, non-technical way.
 */

import { useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import './GroomingPrompt.css';

const GET_GRAPH_STATS = gql`
  query GetTripleGraphStats($teamId: ID!) {
    getTripleGraphStats(teamId: $teamId) {
      totalConcepts
      totalTriples
      totalContexts
      orphanConcepts
    }
  }
`;

const GROOM_GRAPH = gql`
  mutation GroomTripleGraph($teamId: ID!) {
    groomTripleGraph(teamId: $teamId) {
      decomposed
      mergeProposals {
        conceptA { name }
        conceptB { name }
        similarity
        suggestedCanonical
      }
      autoMerged
      pruned
      contextsDiscovered
      inferences
      relationshipsRefined
    }
  }
`;

export default function GroomingPrompt({ teamId, show, onDismiss }) {
  const [isGrooming, setIsGrooming] = useState(false);
  const [groomResult, setGroomResult] = useState(null);
  const [phase, setPhase] = useState('');

  const { data: statsData } = useQuery(GET_GRAPH_STATS, {
    variables: { teamId },
    skip: !show,
  });

  const [groomGraph] = useMutation(GROOM_GRAPH);

  const stats = statsData?.getTripleGraphStats;

  const handleGroom = async () => {
    setIsGrooming(true);
    setPhase('Scanning for duplicate concepts...');

    // Simulate phase progression (grooming takes ~10-30s)
    const phases = [
      { msg: 'Scanning for duplicate concepts...', delay: 0 },
      { msg: 'Checking for universal knowledge...', delay: 3000 },
      { msg: 'Discovering missing contexts...', delay: 6000 },
      { msg: 'Looking for hidden connections...', delay: 9000 },
      { msg: 'Refining relationships...', delay: 12000 },
      { msg: 'Wrapping up...', delay: 15000 },
    ];
    phases.forEach(p => setTimeout(() => { if (isGrooming) setPhase(p.msg); }, p.delay));

    try {
      const { data } = await groomGraph({ variables: { teamId } });
      setGroomResult(data.groomTripleGraph);
    } catch (err) {
      console.error('Grooming error:', err);
      setGroomResult({ error: err.message });
    } finally {
      setIsGrooming(false);
      setPhase('');
    }
  };

  if (!show) return null;

  return (
    <div className="grooming-prompt">
      {!isGrooming && !groomResult && (
        <div className="grooming-suggest">
          <div className="grooming-icon">&#x1F9F9;</div>
          <div className="grooming-text">
            <p className="grooming-title">Raven could use some organizing</p>
            <p className="grooming-subtitle">
              {stats && `${stats.totalConcepts} concepts, ${stats.totalTriples} knowledge triples`}
              {stats?.orphanConcepts > 0 && `, ${stats.orphanConcepts} disconnected concepts`}
            </p>
            <p className="grooming-desc">
              I'll merge duplicates, discover missing connections, and clean up.
              Takes about a minute.
            </p>
          </div>
          <div className="grooming-actions">
            <button className="grooming-btn grooming-btn--go" onClick={handleGroom}>
              Organize
            </button>
            <button className="grooming-btn grooming-btn--later" onClick={onDismiss}>
              Later
            </button>
          </div>
        </div>
      )}

      {isGrooming && (
        <div className="grooming-progress">
          <div className="grooming-spinner" />
          <span className="grooming-phase">{phase}</span>
        </div>
      )}

      {groomResult && !groomResult.error && (
        <div className="grooming-result">
          <div className="grooming-result-icon">&#x2728;</div>
          <div className="grooming-result-text">
            <p className="grooming-result-title">All organized!</p>
            <div className="grooming-result-stats">
              {groomResult.decomposed > 0 && <span>{groomResult.decomposed} facts simplified</span>}
              {(groomResult.autoMerged?.length || 0) > 0 && <span>{groomResult.autoMerged.length} duplicates merged</span>}
              {groomResult.pruned > 0 && <span>{groomResult.pruned} redundancies removed</span>}
              {groomResult.contextsDiscovered > 0 && <span>{groomResult.contextsDiscovered} contexts added</span>}
              {(groomResult.inferences?.length || 0) > 0 && <span>{groomResult.inferences.length} new connections found</span>}
              {groomResult.relationshipsRefined > 0 && <span>{groomResult.relationshipsRefined} relationships sharpened</span>}
              {groomResult.mergeProposals?.length > 0 && (
                <div className="grooming-merge-proposals">
                  <p>These look similar — should they be merged?</p>
                  {groomResult.mergeProposals.slice(0, 3).map((p, i) => (
                    <div key={i} className="merge-proposal">
                      <span>{p.conceptA.name}</span>
                      <span className="merge-sim">{Math.round(p.similarity * 100)}% similar</span>
                      <span>{p.conceptB.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="grooming-btn grooming-btn--done" onClick={onDismiss}>Done</button>
        </div>
      )}

      {groomResult?.error && (
        <div className="grooming-result grooming-result--error">
          <p>Something went wrong: {groomResult.error}</p>
          <button className="grooming-btn grooming-btn--done" onClick={onDismiss}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
