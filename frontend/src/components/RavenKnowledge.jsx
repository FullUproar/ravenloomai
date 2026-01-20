/**
 * RavenKnowledge - Clean Ask/Remember Interface
 *
 * Clean knowledge interface with dual action buttons:
 * - Ask: Instant AI response (read-only)
 * - Remember: Preview → Confirm flow (supervised learning)
 *
 * Resets between interactions (not continuous chat).
 */

import { useState, useRef, useEffect } from 'react';
import { gql, useMutation, useLazyQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './RavenKnowledge.css';

// GraphQL Operations
const ASK_RAVEN = gql`
  query AskRaven($scopeId: ID!, $question: String!) {
    askRaven(scopeId: $scopeId, question: $question) {
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

const PREVIEW_REMEMBER = gql`
  mutation PreviewRemember($scopeId: ID!, $statement: String!, $sourceUrl: String) {
    previewRemember(scopeId: $scopeId, statement: $statement, sourceUrl: $sourceUrl) {
      previewId
      sourceText
      extractedFacts {
        content
        entityType
        entityName
        category
        confidenceScore
      }
      conflicts {
        existingFact {
          id
          content
          createdAt
        }
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

export default function RavenKnowledge({ scopeId, scopeName, onFactsChanged }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('idle'); // idle, asking, remembering, preview, result
  const [askResult, setAskResult] = useState(null);
  const [rememberPreview, setRememberPreview] = useState(null);
  const [rememberResult, setRememberResult] = useState(null);
  const [skipConflictIds, setSkipConflictIds] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // GraphQL operations
  const [askRaven, { loading: askLoading }] = useLazyQuery(ASK_RAVEN, {
    fetchPolicy: 'network-only'
  });
  const [previewRemember, { loading: previewLoading }] = useMutation(PREVIEW_REMEMBER);
  const [confirmRemember, { loading: confirmLoading }] = useMutation(CONFIRM_REMEMBER);
  const [cancelRemember] = useMutation(CANCEL_REMEMBER);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset to idle state
  const reset = () => {
    setInput('');
    setMode('idle');
    setAskResult(null);
    setRememberPreview(null);
    setRememberResult(null);
    setSkipConflictIds([]);
    setError(null);
    inputRef.current?.focus();
  };

  // Handle Ask action
  const handleAsk = async () => {
    if (!input.trim() || !scopeId) return;

    setMode('asking');
    setError(null);

    try {
      const { data } = await askRaven({
        variables: { scopeId, question: input.trim() }
      });

      setAskResult(data.askRaven);
      setMode('result');
    } catch (err) {
      console.error('Ask error:', err);
      setError(err.message);
      setMode('idle');
    }
  };

  // Handle Remember action (shows preview)
  const handleRemember = async () => {
    if (!input.trim() || !scopeId) return;

    setMode('remembering');
    setError(null);

    try {
      const { data } = await previewRemember({
        variables: { scopeId, statement: input.trim() }
      });

      setRememberPreview(data.previewRemember);
      setMode('preview');
    } catch (err) {
      console.error('Remember preview error:', err);
      setError(err.message);
      setMode('idle');
    }
  };

  // Handle Confirm (save the facts)
  const handleConfirm = async () => {
    if (!rememberPreview?.previewId) return;

    try {
      const { data } = await confirmRemember({
        variables: {
          previewId: rememberPreview.previewId,
          skipConflictIds
        }
      });

      setRememberResult(data.confirmRemember);
      setMode('result');
      onFactsChanged?.();
    } catch (err) {
      console.error('Confirm error:', err);
      setError(err.message);
    }
  };

  // Handle Cancel (discard the preview)
  const handleCancel = async () => {
    if (rememberPreview?.previewId) {
      await cancelRemember({
        variables: { previewId: rememberPreview.previewId }
      });
    }
    reset();
  };

  // Toggle a conflict to be skipped
  const toggleSkipConflict = (factId) => {
    setSkipConflictIds(prev =>
      prev.includes(factId)
        ? prev.filter(id => id !== factId)
        : [...prev, factId]
    );
  };

  // Handle mismatch detection (user typed question but clicked Remember)
  const handleSwitchToAsk = () => {
    handleAsk();
  };

  const isLoading = askLoading || previewLoading || confirmLoading;

  return (
    <div className="raven-knowledge">
      {/* Input area (shown when idle or on result) */}
      {(mode === 'idle' || mode === 'result') && (
        <div className="raven-knowledge-input-section">
          <div className="raven-knowledge-scope-label">
            {scopeName || 'Knowledge'}
          </div>

          <div className="raven-knowledge-input-container">
            <textarea
              ref={inputRef}
              className="raven-knowledge-input"
              placeholder="Ask a question or share something to remember..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // Default to Ask when pressing Enter
                  handleAsk();
                }
              }}
              rows={3}
            />

            <div className="raven-knowledge-actions">
              <button
                className="raven-knowledge-btn ask"
                onClick={handleAsk}
                disabled={!input.trim() || isLoading}
              >
                {askLoading ? 'Asking...' : 'Ask'}
              </button>
              <button
                className="raven-knowledge-btn remember"
                onClick={handleRemember}
                disabled={!input.trim() || isLoading}
              >
                {previewLoading ? 'Checking...' : 'Remember'}
              </button>
            </div>
          </div>

          {error && (
            <div className="raven-knowledge-error">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {(mode === 'asking' || mode === 'remembering') && (
        <div className="raven-knowledge-loading">
          <div className="raven-knowledge-spinner" />
          <span>{mode === 'asking' ? 'Searching knowledge...' : 'Analyzing statement...'}</span>
        </div>
      )}

      {/* Remember Preview */}
      {mode === 'preview' && rememberPreview && (
        <div className="raven-knowledge-preview">
          {/* Mismatch warning */}
          {rememberPreview.isMismatch && (
            <div className="raven-knowledge-mismatch">
              <div className="mismatch-icon">?</div>
              <div className="mismatch-content">
                <p>{rememberPreview.mismatchSuggestion}</p>
                <button className="mismatch-switch" onClick={handleSwitchToAsk}>
                  Switch to Ask
                </button>
              </div>
            </div>
          )}

          <div className="preview-header">
            <h3>Review Before Saving</h3>
            <p className="preview-source">From: "{rememberPreview.sourceText}"</p>
          </div>

          {/* Extracted facts */}
          <div className="preview-facts">
            <h4>Facts to be saved:</h4>
            {rememberPreview.extractedFacts.map((fact, i) => (
              <div key={i} className="preview-fact">
                <span className="fact-content">{fact.content}</span>
                {fact.category && (
                  <span className="fact-category">{fact.category}</span>
                )}
              </div>
            ))}
          </div>

          {/* Conflicts */}
          {rememberPreview.conflicts.length > 0 && (
            <div className="preview-conflicts">
              <h4>Potential conflicts:</h4>
              {rememberPreview.conflicts.map((conflict, i) => (
                <div key={i} className="preview-conflict">
                  <div className="conflict-type">{conflict.conflictType}</div>
                  <div className="conflict-explanation">{conflict.explanation}</div>
                  <div className="conflict-existing">
                    Existing: {conflict.existingFact.content.substring(0, 100)}...
                  </div>
                  <label className="conflict-skip">
                    <input
                      type="checkbox"
                      checked={skipConflictIds.includes(conflict.existingFact.id)}
                      onChange={() => toggleSkipConflict(conflict.existingFact.id)}
                    />
                    Keep existing (skip update)
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Preview actions */}
          <div className="preview-actions">
            <button
              className="raven-knowledge-btn cancel"
              onClick={handleCancel}
              disabled={confirmLoading}
            >
              Cancel
            </button>
            <button
              className="raven-knowledge-btn confirm"
              onClick={handleConfirm}
              disabled={confirmLoading}
            >
              {confirmLoading ? 'Saving...' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      )}

      {/* Result display */}
      {mode === 'result' && (
        <div className="raven-knowledge-result">
          {/* Ask result */}
          {askResult && (
            <div className="result-ask">
              <div className="result-answer">
                <ReactMarkdown>{askResult.answer}</ReactMarkdown>
              </div>

              {askResult.factsUsed.length > 0 && (
                <div className="result-sources">
                  <h4>Sources:</h4>
                  {askResult.factsUsed.map(fact => (
                    <div key={fact.id} className="result-source">
                      <span className="source-content">{fact.content.substring(0, 100)}...</span>
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
                    <button
                      key={i}
                      className="followup-btn"
                      onClick={() => {
                        setInput(q);
                        setMode('idle');
                        setAskResult(null);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Remember result */}
          {rememberResult && (
            <div className="result-remember">
              <div className="result-success">
                <div className="success-icon">✓</div>
                <div className="success-message">{rememberResult.message}</div>
              </div>

              {rememberResult.factsCreated.length > 0 && (
                <div className="result-created">
                  <h4>New facts:</h4>
                  {rememberResult.factsCreated.map(fact => (
                    <div key={fact.id} className="result-fact">
                      {fact.content}
                    </div>
                  ))}
                </div>
              )}

              {rememberResult.factsUpdated.length > 0 && (
                <div className="result-updated">
                  <h4>Updated facts:</h4>
                  {rememberResult.factsUpdated.map(fact => (
                    <div key={fact.id} className="result-fact">
                      {fact.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* New interaction button */}
          <button className="raven-knowledge-new" onClick={reset}>
            Start New
          </button>
        </div>
      )}
    </div>
  );
}
