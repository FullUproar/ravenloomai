/**
 * RavenKnowledge - Clean Ask/Remember Interface (Triple-based)
 *
 * Ask: Instant AI response with dual-embedding search + multi-hop
 * Remember: Preview → Confirm flow producing structured triples
 *
 * The atom of knowledge: (Subject --relationship--> Object) [Contexts]
 */

import { useState, useRef, useEffect } from 'react';
import { gql, useMutation, useLazyQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './RavenKnowledge.css';

// GraphQL Operations
const ASK_RAVEN = gql`
  query AskRaven($scopeId: ID!, $question: String!, $conversationHistory: [ConversationMessage!]) {
    askRaven(scopeId: $scopeId, question: $question, conversationHistory: $conversationHistory) {
      answer
      confidence
      factsUsed {
        id
        content
        sourceQuote
        sourceUrl
        createdAt
      }
      suggestedFollowups
    }
  }
`;

const LOG_CORRECTION = gql`
  mutation LogCorrection($teamId: ID!, $question: String!, $wrongAnswer: String!, $correctInfo: String, $tripleIds: [ID!]) {
    logCorrection(teamId: $teamId, question: $question, wrongAnswer: $wrongAnswer, correctInfo: $correctInfo, tripleIds: $tripleIds) {
      success
    }
  }
`;

const PREVIEW_REMEMBER = gql`
  mutation PreviewRemember($scopeId: ID!, $statement: String!, $sourceUrl: String) {
    previewRemember(scopeId: $scopeId, statement: $statement, sourceUrl: $sourceUrl) {
      previewId
      sourceText
      extractedTriples {
        subject
        subjectType
        relationship
        object
        objectType
        contexts {
          name
          type
        }
        confidence
        trustTier
        displayText
        isNew
        challengeFlags {
          type
          detail
          severity
        }
      }
      triageLevel
      conflicts {
        existingDisplayText
        conflictType
        explanation
      }
      isMismatch
      mismatchSuggestion
    }
  }
`;

const CONFIRM_REMEMBER = gql`
  mutation ConfirmRemember($previewId: ID!, $skipConflictIds: [ID!]) {
    confirmRemember(previewId: $previewId, skipConflictIds: $skipConflictIds) {
      success
      factsCreated {
        id
        content
      }
      factsUpdated {
        id
        content
      }
      message
    }
  }
`;

const CANCEL_REMEMBER = gql`
  mutation CancelRemember($previewId: ID!) {
    cancelRemember(previewId: $previewId)
  }
`;

/**
 * ConfidenceBadge - Shows answer confidence in plain English
 */
function ConfidenceBadge({ confidence }) {
  if (confidence == null) return null;

  let level, label;
  if (confidence >= 0.7) {
    level = 'high';
    label = 'Strong match from your saved knowledge';
  } else if (confidence >= 0.4) {
    level = 'medium';
    label = 'Partial match — some info may be missing';
  } else {
    level = 'low';
    label = 'Not much to go on — double-check this';
  }

  return (
    <div className={`confidence-badge confidence-badge--${level}`}>
      <span className="confidence-dot" />
      <span>{label}</span>
    </div>
  );
}

/**
 * ThinkingIndicator - Contextual progress messages
 */
function ThinkingIndicator({ mode }) {
  const [messageIdx, setMessageIdx] = useState(0);

  const messages = mode === 'asking'
    ? ['Searching your knowledge base...', 'Analyzing connections...', 'Composing answer...']
    : ['Reading your input...', 'Extracting knowledge triples...', 'Checking for conflicts...'];

  useEffect(() => {
    setMessageIdx(0);
    const interval = setInterval(() => {
      setMessageIdx(prev => Math.min(prev + 1, messages.length - 1));
    }, 2000);
    return () => clearInterval(interval);
  }, [mode]);

  return (
    <div className="raven-knowledge-loading">
      <div className="raven-thinking-dot" />
      <span className="raven-thinking-text">{messages[messageIdx]}</span>
    </div>
  );
}

/**
 * TripleCard - Renders a single extracted triple with trust indicators
 */
function TripleCard({ triple, index }) {
  const confPct = triple.confidence != null ? Math.round(triple.confidence * 100) : null;
  const confLevel = confPct >= 80 ? 'high' : confPct >= 60 ? 'medium' : 'low';
  const flags = triple.challengeFlags || [];
  const hasHardFlag = flags.some(f => f.severity === 'hard');
  const hasSoftFlag = flags.some(f => f.severity === 'soft');

  return (
    <div className={`preview-triple ${hasHardFlag ? 'preview-triple--flagged-hard' : hasSoftFlag ? 'preview-triple--flagged-soft' : ''}`}>
      <div className="triple-structure">
        <span className="triple-subject" title={triple.subjectType}>
          {triple.subject}
        </span>
        <span className="triple-relationship">
          {triple.relationship}
        </span>
        <span className="triple-object" title={triple.objectType}>
          {triple.object}
        </span>
      </div>
      <div className="triple-meta">
        {triple.contexts?.length > 0 && (
          <div className="triple-contexts">
            {triple.contexts.map((ctx, i) => (
              <span key={i} className="context-badge" title={ctx.type}>
                {ctx.name}
              </span>
            ))}
          </div>
        )}
        <div className="triple-badges">
          {triple.trustTier && (
            <span className={`trust-tier-badge trust-tier-badge--${triple.trustTier}`}>
              {triple.trustTier === 'official' ? 'Official' : 'Tribal'}
            </span>
          )}
          {confPct != null && (
            <span className={`triple-confidence triple-confidence--${confLevel}`}>
              {confPct}%
            </span>
          )}
        </div>
      </div>
      {flags.length > 0 && (
        <div className="triple-challenge-flags">
          {flags.map((flag, i) => (
            <div key={i} className={`challenge-flag challenge-flag--${flag.severity}`}>
              <span className="challenge-flag-icon">{flag.severity === 'hard' ? '!' : '?'}</span>
              <span className="challenge-flag-detail">{flag.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RavenKnowledge({ scopeId, scopeName, onFactsChanged, teamId }) {
  const [input, setInput] = useState('');
  const [followUpInput, setFollowUpInput] = useState('');
  const [mode, setMode] = useState('idle'); // idle, asking, remembering, preview, result
  const [askResult, setAskResult] = useState(null);
  const [rememberPreview, setRememberPreview] = useState(null);
  const [rememberResult, setRememberResult] = useState(null);
  const [skipConflictIds, setSkipConflictIds] = useState([]);
  const [error, setError] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const inputRef = useRef(null);
  const followUpRef = useRef(null);

  // GraphQL operations
  const [askRaven, { loading: askLoading }] = useLazyQuery(ASK_RAVEN, {
    fetchPolicy: 'network-only'
  });
  const [previewRemember, { loading: previewLoading }] = useMutation(PREVIEW_REMEMBER);
  const [confirmRemember, { loading: confirmLoading }] = useMutation(CONFIRM_REMEMBER);
  const [cancelRemember] = useMutation(CANCEL_REMEMBER);
  const [logCorrectionMutation] = useMutation(LOG_CORRECTION);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    setInput('');
    setFollowUpInput('');
    setMode('idle');
    setAskResult(null);
    setRememberPreview(null);
    setRememberResult(null);
    setSkipConflictIds([]);
    setError(null);
    inputRef.current?.focus();
  }, [scopeId]);

  const reset = (clearHistory = true) => {
    setInput('');
    setFollowUpInput('');
    setMode('idle');
    setAskResult(null);
    setRememberPreview(null);
    setRememberResult(null);
    setSkipConflictIds([]);
    setError(null);
    if (clearHistory) setConversationHistory([]);
    inputRef.current?.focus();
  };

  const handleAsk = async (questionOverride = null) => {
    const question = (questionOverride || input).trim();
    if (!question || !scopeId) return;
    setMode('asking');
    setError(null);
    try {
      // Pass conversation history for follow-up context resolution
      const historyForBackend = conversationHistory.slice(-6).map(h => ({
        role: h.role,
        content: h.content,
      }));

      const { data } = await askRaven({
        variables: {
          scopeId,
          question,
          conversationHistory: historyForBackend.length > 0 ? historyForBackend : undefined,
        }
      });
      setAskResult(data.askRaven);

      // Append to conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: data.askRaven.answer, confidence: data.askRaven.confidence },
      ]);

      setMode('result');
    } catch (err) {
      console.error('Ask error:', err);
      setError('Something went wrong getting an answer. Try again?');
      setMode('idle');
    }
  };

  const handleRemember = async (overrideText = null) => {
    const text = overrideText || input;
    if (!text.trim() || !scopeId) return;
    setMode('remembering');
    setError(null);
    try {
      const { data } = await previewRemember({ variables: { scopeId, statement: text.trim() } });
      setRememberPreview(data.previewRemember);
      setMode('preview');
    } catch (err) {
      console.error('Remember preview error:', err);
      setError('Something went wrong reading that. Try again?');
      setMode('idle');
    }
  };

  const handleConfirm = async () => {
    if (!rememberPreview?.previewId) return;
    try {
      const { data } = await confirmRemember({
        variables: {
          previewId: rememberPreview.previewId,
          skipConflictIds,
        }
      });
      setRememberResult(data.confirmRemember);
      setMode('result');
      onFactsChanged?.();
    } catch (err) {
      console.error('Confirm error:', err);
      setError('Something went wrong saving. Try again?');
    }
  };

  const handleCancel = async () => {
    if (rememberPreview?.previewId) {
      await cancelRemember({ variables: { previewId: rememberPreview.previewId } });
    }
    reset();
  };

  const toggleSkipConflict = (id) => {
    setSkipConflictIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSwitchToAsk = () => { handleAsk(); };

  const handleFollowUp = async () => {
    if (!followUpInput.trim() || !scopeId) return;
    const question = followUpInput.trim();
    setInput(question);
    setFollowUpInput('');
    setAskResult(null);
    setError(null);
    // Don't clear conversation history — this IS a follow-up
    await handleAsk(question);
  };

  const handleCorrection = async () => {
    if (!followUpInput.trim()) return;
    const correctionText = followUpInput.trim();

    // Log the correction signal for trust model learning
    if (teamId && askResult) {
      try {
        await logCorrectionMutation({
          variables: {
            teamId,
            question: input,
            wrongAnswer: askResult.answer,
            correctInfo: correctionText,
            tripleIds: (askResult.factsUsed || []).map(f => f.id).filter(Boolean),
          }
        });
      } catch { /* correction logging is best-effort */ }
    }

    // Add correction to conversation history
    setConversationHistory(prev => [
      ...prev,
      { role: 'user', content: `Correction: ${correctionText}` },
    ]);

    setInput(correctionText);
    setFollowUpInput('');
    setAskResult(null);
    setRememberResult(null);
    handleRemember(correctionText);
  };

  const isLoading = askLoading || previewLoading || confirmLoading;

  return (
    <div className="raven-knowledge">
      {/* Input area */}
      {mode === 'idle' && (
        <div className="raven-knowledge-input-section">
          <div className="raven-knowledge-input-container">
            <textarea
              ref={inputRef}
              className="raven-knowledge-input"
              placeholder="Tell me something, or ask me anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              rows={3}
            />
            <div className="raven-knowledge-actions">
              <button className="raven-knowledge-btn ask" onClick={handleAsk} disabled={!input.trim() || isLoading}>
                {askLoading ? 'Asking...' : 'Ask'}
              </button>
              <button className="raven-knowledge-btn remember" onClick={() => handleRemember()} disabled={!input.trim() || isLoading}>
                {previewLoading ? 'Checking...' : 'Remember'}
              </button>
            </div>
          </div>
          {error && <div className="raven-knowledge-error">{error}</div>}
        </div>
      )}

      {/* Loading */}
      {(mode === 'asking' || mode === 'remembering') && (
        <ThinkingIndicator mode={mode} />
      )}

      {/* Remember Preview — Triple-based */}
      {mode === 'preview' && rememberPreview && (
        <div className="raven-knowledge-preview">
          {rememberPreview.isMismatch && (
            <div className="raven-knowledge-mismatch">
              <div className="mismatch-icon">?</div>
              <div className="mismatch-content">
                <p>{rememberPreview.mismatchSuggestion}</p>
                <button className="mismatch-switch" onClick={handleSwitchToAsk}>Switch to Ask</button>
              </div>
            </div>
          )}

          <div className="preview-header">
            <h3>Review Before Saving</h3>
            <p className="preview-source">From: "{rememberPreview.sourceText.substring(0, 200)}{rememberPreview.sourceText.length > 200 ? '...' : ''}"</p>
            {rememberPreview.triageLevel === 'auto_confirm' && (
              <div className="triage-banner triage-banner--auto">
                <span className="triage-icon">&#10003;</span>
                Trusted source — auto-confirmed
              </div>
            )}
            {rememberPreview.triageLevel === 'requires_decision' && (
              <div className="triage-banner triage-banner--decision">
                <span className="triage-icon">!</span>
                Needs your attention — potential issues detected
              </div>
            )}
          </div>

          {/* Extracted triples */}
          <div className="preview-facts">
            <h4>Knowledge to be saved:</h4>
            {(rememberPreview.extractedTriples || []).map((triple, i) => (
              <TripleCard key={i} triple={triple} index={i} />
            ))}
          </div>

          {/* Conflicts */}
          {rememberPreview.conflicts?.length > 0 && (
            <div className="preview-conflicts">
              <h4>Potential conflicts:</h4>
              {rememberPreview.conflicts.map((conflict, i) => (
                <div key={i} className="preview-conflict">
                  <div className="conflict-type">{conflict.conflictType}</div>
                  <div className="conflict-explanation">{conflict.explanation}</div>
                  {conflict.existingDisplayText && (
                    <div className="conflict-existing">
                      Existing: {conflict.existingDisplayText.substring(0, 100)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="preview-actions">
            <button className="raven-knowledge-btn cancel" onClick={handleCancel} disabled={confirmLoading}>
              Cancel
            </button>
            <button className="raven-knowledge-btn confirm" onClick={handleConfirm} disabled={confirmLoading}>
              {confirmLoading ? 'Saving...' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      )}

      {/* Result display */}
      {mode === 'result' && (
        <div className="raven-knowledge-result">
          {/* Conversation thread (previous exchanges) */}
          {conversationHistory.length > 2 && askResult && (
            <div className="conversation-thread">
              {conversationHistory.slice(0, -2).map((msg, i) => (
                <div key={i} className={`conversation-msg conversation-msg--${msg.role}`}>
                  <span className="conversation-msg-label">{msg.role === 'user' ? 'You' : 'Raven'}</span>
                  <span className="conversation-msg-text">{msg.content.substring(0, 150)}{msg.content.length > 150 ? '...' : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="result-query">
            <span className="result-query-label">{askResult ? 'You asked:' : 'You remembered:'}</span>
            <span className="result-query-text">{input}</span>
          </div>

          {/* Ask result */}
          {askResult && (
            <div className="result-ask">
              <div className="result-answer">
                <ReactMarkdown>{askResult.answer}</ReactMarkdown>
              </div>

              <ConfidenceBadge confidence={askResult.confidence} />

              {askResult.factsUsed?.length > 0 && (
                <div className="result-sources">
                  <h4>Sources:</h4>
                  {askResult.factsUsed.map(fact => (
                    <div key={fact.id} className="result-source">
                      <span className="source-content">{(fact.content || '').substring(0, 120)}</span>
                      {fact.sourceUrl && (
                        <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">
                          View source
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {askResult.suggestedFollowups?.length > 0 && (
                <div className="result-followups">
                  <h4>Related questions:</h4>
                  {askResult.suggestedFollowups.map((q, i) => (
                    <button key={i} className="followup-btn" onClick={() => setFollowUpInput(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Follow-up input */}
              <div className="result-followup-input">
                <input
                  ref={followUpRef}
                  type="text"
                  className="followup-input"
                  placeholder="Ask a follow-up or correct this..."
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleFollowUp();
                    }
                  }}
                />
                <div className="followup-actions">
                  <button className="followup-action-btn ask" onClick={handleFollowUp} disabled={!followUpInput.trim() || isLoading}>
                    Ask
                  </button>
                  <button className="followup-action-btn correct" onClick={handleCorrection} disabled={!followUpInput.trim() || isLoading}>
                    Correct
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Remember result */}
          {rememberResult && (
            <div className="result-remember">
              <div className="result-success">
                <div className="success-icon">✓</div>
                <div className="success-message">{rememberResult.message}</div>
              </div>

              {rememberResult.factsCreated?.length > 0 && (
                <div className="result-created">
                  <h4>New knowledge:</h4>
                  {rememberResult.factsCreated.map(fact => (
                    <div key={fact.id} className="result-fact">{fact.content}</div>
                  ))}
                </div>
              )}

              {rememberResult.factsUpdated?.length > 0 && (
                <div className="result-updated">
                  <h4>Updated:</h4>
                  {rememberResult.factsUpdated.map(fact => (
                    <div key={fact.id} className="result-fact">{fact.content}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="result-new-actions">
            <button className="raven-knowledge-new" onClick={() => reset(true)}>New Topic</button>
            {conversationHistory.length > 0 && askResult && (
              <button className="raven-knowledge-continue" onClick={() => { setMode('idle'); setInput(''); setFollowUpInput(''); setAskResult(null); inputRef.current?.focus(); }}>
                Continue Conversation
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
