/**
 * RavenKnowledge - Chat-style Ask/Remember Interface
 *
 * Conversational flow:
 * - Input always visible at bottom
 * - Messages scroll up, newest at bottom
 * - Auto-detect correction vs question
 * - Remember previews appear inline with confirm/cancel
 * - Seamless topic switching — no scrolling needed
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { gql, useMutation, useLazyQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './RavenKnowledge.css';

// ── GraphQL ─────────────────────────────────────────────────────────────────

const ASK_RAVEN = gql`
  query AskRaven($scopeId: ID!, $question: String!, $conversationHistory: [ConversationMessageInput!]) {
    askRaven(scopeId: $scopeId, question: $question, conversationHistory: $conversationHistory) {
      answer
      confidence
      factsUsed { id content sourceQuote sourceUrl createdAt }
      suggestedFollowups
      traversalPath {
        steps {
          phase
          timestamp
          nodesVisited { id subjectId objectId subjectName objectName relationship similarity displayText }
        }
        totalDurationMs
        sstScope { id name }
      }
    }
  }
`;

const PREVIEW_REMEMBER = gql`
  mutation PreviewRemember($scopeId: ID!, $statement: String!, $sourceUrl: String) {
    previewRemember(scopeId: $scopeId, statement: $statement, sourceUrl: $sourceUrl) {
      previewId
      sourceText
      extractedTriples {
        subject subjectType relationship object objectType
        contexts { name type }
        confidence trustTier displayText isNew
        challengeFlags { type detail severity }
      }
      triageLevel
      conflicts { existingDisplayText conflictType explanation }
      isMismatch mismatchSuggestion
    }
  }
`;

const CONFIRM_REMEMBER = gql`
  mutation ConfirmRemember($previewId: ID!, $skipConflictIds: [ID!]) {
    confirmRemember(previewId: $previewId, skipConflictIds: $skipConflictIds) {
      success
      factsCreated { id content }
      factsUpdated { id content }
      message
    }
  }
`;

const CANCEL_REMEMBER = gql`
  mutation CancelRemember($previewId: ID!) { cancelRemember(previewId: $previewId) }
`;

const LOG_CORRECTION = gql`
  mutation LogCorrection($teamId: ID!, $question: String!, $wrongAnswer: String!, $correctInfo: String, $tripleIds: [ID!]) {
    logCorrection(teamId: $teamId, question: $question, wrongAnswer: $wrongAnswer, correctInfo: $correctInfo, tripleIds: $tripleIds) { success }
  }
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function looksLikeQuestion(text) {
  const t = text.trim().toLowerCase();
  // Explicit question marks
  if (/[?]$/.test(t)) return true;
  // Question words
  if (/^(what|when|where|who|why|how|is |are |do |does |can |will |should |tell |show |list |give )/.test(t)) return true;
  // Implied questions — statements that are really queries
  if (/\b(i forget|i forgot|remind me|i need to know|i('m| am) not sure|i('m| am) unsure|i don'?t remember|what'?s (our|the|my)|i('m| am) looking for|i('m| am) trying to find|help me (find|understand|figure)|do we have|have we)\b/.test(t)) return true;
  return false;
}

function looksLikeCorrection(text) {
  const t = text.trim().toLowerCase();
  // Explicit correction signals
  if (/^(no[,. ]|nope|wrong|incorrect|actually|that's not|thats not|not quite|correction|update:|fyi |the answer is|it's actually|its actually|should be|it is )/.test(t)) return true;
  // If it's a question (including implied), it's NOT a correction
  if (looksLikeQuestion(t)) return false;
  // Remaining statements after an answer are likely corrections/additions
  return true;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ThinkingBubble({ mode }) {
  // mode can be a status message string from streaming, or 'asking'/'remembering'
  const isStreaming = typeof mode === 'string' && mode !== 'asking' && mode !== 'remembering';
  const displayMsg = isStreaming ? mode : (
    mode === 'asking' ? 'Searching your knowledge...' : 'Extracting knowledge...'
  );

  return (
    <div className="chat-msg chat-msg--raven">
      <div className="chat-bubble chat-bubble--raven chat-bubble--thinking">
        <div className="thinking-dot" />
        <span>{displayMsg}</span>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }) {
  if (confidence == null) return null;
  let level, label;
  if (confidence >= 0.7) { level = 'high'; label = 'Strong match'; }
  else if (confidence >= 0.4) { level = 'medium'; label = 'Partial match'; }
  else { level = 'low'; label = 'Low confidence'; }
  return (
    <span className={`confidence-badge confidence-badge--${level}`}>
      <span className="confidence-dot" />
      {label}
    </span>
  );
}

function TriplePreview({ triple }) {
  const flags = triple.challengeFlags || [];
  const hasFlag = flags.length > 0;
  return (
    <div className={`triple-preview ${hasFlag ? 'triple-preview--flagged' : ''}`}>
      <div className="triple-structure">
        <span className="triple-subject">{triple.subject}</span>
        <span className="triple-rel">{triple.relationship}</span>
        <span className="triple-object">{triple.object}</span>
      </div>
      {triple.contexts?.length > 0 && (
        <div className="triple-contexts">
          {triple.contexts.map((c, i) => <span key={i} className="ctx-badge">{c.name}</span>)}
        </div>
      )}
      {flags.map((f, i) => (
        <div key={i} className={`challenge-flag challenge-flag--${f.severity}`}>
          {f.severity === 'hard' ? '!' : '?'} {f.detail}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function RavenKnowledge({ scopeId, scopeName, onFactsChanged, teamId, onShowTraversal, onTraversalEvent }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // { id, role, type, content, data }
  const [pendingPreview, setPendingPreview] = useState(null); // active remember preview
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState(null); // 'asking' | 'remembering'

  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  const msgIdRef = useRef(0);

  const [askRaven] = useLazyQuery(ASK_RAVEN, { fetchPolicy: 'network-only', errorPolicy: 'all' });
  const [previewRemember] = useMutation(PREVIEW_REMEMBER);
  const [confirmRemember] = useMutation(CONFIRM_REMEMBER);
  const [cancelRemember] = useMutation(CANCEL_REMEMBER);
  const [logCorrectionMutation] = useMutation(LOG_CORRECTION);

  const nextId = () => ++msgIdRef.current;

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, pendingPreview]);

  // Focus input on mount and scope change
  useEffect(() => {
    inputRef.current?.focus();
    setMessages([]);
    setPendingPreview(null);
  }, [scopeId]);

  // Add a message to the chat
  const addMsg = useCallback((role, type, content, data = null) => {
    const msg = { id: nextId(), role, type, content, data };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  // Build conversation history for backend context
  const getConversationHistory = useCallback(() => {
    return messages
      .filter(m => m.type === 'ask' || m.type === 'answer')
      .slice(-6)
      .map(m => ({ role: m.role === 'raven' ? 'assistant' : 'user', content: m.content }));
  }, [messages]);

  // ── Ask ──────────────────────────────────────────────────────────────────

  const doAsk = useCallback(async (question) => {
    if (!question.trim() || !scopeId || isLoading) return;
    const q = question.trim();

    addMsg('user', 'ask', q);
    setInput('');
    setIsLoading(true);
    setLoadingMode('asking');

    // Signal parent to open split view for real-time animation
    onTraversalEvent?.({ type: 'start' });

    try {
      const history = getConversationHistory();
      const userId = localStorage.getItem('userId');

      // Use streaming endpoint for real-time traversal
      const response = await fetch('/api/ask-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
        body: JSON.stringify({ scopeId, question: q, conversationHistory: history }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalAnswer = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.substring(6));

              if (currentEvent === 'phase') {
                // Real-time: emit traversal phase to graph
                onTraversalEvent?.({ type: 'phase', data });
              } else if (currentEvent === 'status') {
                // Update loading message
                setLoadingMode(data.message || 'asking');
              } else if (currentEvent === 'answer') {
                finalAnswer = data;
              } else if (currentEvent === 'error') {
                throw new Error(data.message);
              }
            } catch (parseErr) {
              if (currentEvent === 'error') throw parseErr;
            }
            currentEvent = null;
          }
        }
      }

      if (finalAnswer) {
        addMsg('raven', 'answer', finalAnswer.answer, {
          confidence: finalAnswer.confidence,
          factsUsed: finalAnswer.factsUsed,
          suggestedFollowups: finalAnswer.suggestedFollowups,
          originalQuestion: q,
        });
        onTraversalEvent?.({ type: 'complete' });
      } else {
        throw new Error('No answer received');
      }
    } catch (err) {
      console.error('Ask error:', err);
      addMsg('raven', 'error', err.message?.includes('timeout')
        ? 'That took too long — try again in a moment.'
        : `Something went wrong: ${err.message || 'Unknown error'}`);
      onTraversalEvent?.({ type: 'error' });
    } finally {
      setIsLoading(false);
      setLoadingMode(null);
      inputRef.current?.focus();
    }
  }, [scopeId, isLoading, addMsg, getConversationHistory, onTraversalEvent]);

  // ── Remember ─────────────────────────────────────────────────────────────

  const doRemember = useCallback(async (text) => {
    if (!text.trim() || !scopeId || isLoading) return;
    const t = text.trim();

    addMsg('user', 'remember', t);
    setInput('');
    setIsLoading(true);
    setLoadingMode('remembering');

    try {
      const { data } = await previewRemember({ variables: { scopeId, statement: t } });
      setPendingPreview(data.previewRemember);
    } catch (err) {
      console.error('Remember error:', err);
      addMsg('raven', 'error', 'Something went wrong reading that. Try again?');
    } finally {
      setIsLoading(false);
      setLoadingMode(null);
    }
  }, [scopeId, isLoading, addMsg, previewRemember]);

  const doConfirm = useCallback(async (skipIds = []) => {
    if (!pendingPreview?.previewId) return;
    setIsLoading(true);

    try {
      const { data } = await confirmRemember({
        variables: { previewId: pendingPreview.previewId, skipConflictIds: skipIds }
      });
      const r = data.confirmRemember;
      const saved = [...(r.factsCreated || []), ...(r.factsUpdated || [])];
      addMsg('raven', 'confirmed', r.message || `Saved ${saved.length} knowledge triples.`, { saved });
      onFactsChanged?.();
    } catch (err) {
      console.error('Confirm error:', err);
      addMsg('raven', 'error', 'Something went wrong saving. Try again?');
    } finally {
      setPendingPreview(null);
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [pendingPreview, addMsg, confirmRemember, onFactsChanged]);

  const doCancel = useCallback(async () => {
    if (pendingPreview?.previewId) {
      cancelRemember({ variables: { previewId: pendingPreview.previewId } }).catch(() => {});
    }
    addMsg('raven', 'system', 'Cancelled — nothing saved.');
    setPendingPreview(null);
    inputRef.current?.focus();
  }, [pendingPreview, addMsg, cancelRemember]);

  // ── Correction (follow-up that corrects a previous answer) ───────────

  const doCorrection = useCallback(async (text) => {
    // Find the last answer to get context
    const lastAnswer = [...messages].reverse().find(m => m.type === 'answer');
    if (lastAnswer?.data && teamId) {
      logCorrectionMutation({
        variables: {
          teamId,
          question: lastAnswer.data.originalQuestion || '',
          wrongAnswer: lastAnswer.content,
          correctInfo: text,
          tripleIds: (lastAnswer.data.factsUsed || []).map(f => f.id).filter(Boolean),
        }
      }).catch(() => {});
    }
    // Treat the correction as a Remember
    doRemember(text);
  }, [messages, teamId, logCorrectionMutation, doRemember]);

  // ── Input handler ────────────────────────────────────────────────────────

  const handleSubmit = useCallback((mode = 'auto') => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (mode === 'remember') {
      doRemember(text);
    } else if (mode === 'ask') {
      doAsk(text);
    } else {
      // Auto-detect: if there's a previous answer, check for correction
      const hasAnswer = messages.some(m => m.type === 'answer');
      if (hasAnswer && looksLikeCorrection(text)) {
        doCorrection(text);
      } else {
        doAsk(text);
      }
    }
  }, [input, isLoading, doAsk, doRemember, doCorrection, messages]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="raven-chat">
      {/* Chat messages */}
      <div className="raven-chat-messages">
        {messages.length === 0 && !isLoading && (
          <div className="raven-chat-empty">
            <div className="raven-chat-empty-icon">&#x1F56E;</div>
            <p>Ask me anything, or tell me something to remember.</p>
            {scopeName && <p className="raven-chat-scope">Scope: {scopeName}</p>}
          </div>
        )}

        {messages.map(msg => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="chat-msg chat-msg--user">
                <div className="chat-bubble chat-bubble--user">
                  <span className="chat-mode-label">{msg.type === 'remember' ? 'Remember' : msg.type === 'ask' ? 'Ask' : ''}</span>
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.type === 'answer') {
            return (
              <div key={msg.id} className="chat-msg chat-msg--raven">
                <div className="chat-bubble chat-bubble--raven">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  <ConfidenceBadge confidence={msg.data?.confidence} />

                  {msg.data?.factsUsed?.length > 0 && (
                    <details className="chat-sources">
                      <summary>{msg.data.factsUsed.length} source{msg.data.factsUsed.length !== 1 ? 's' : ''}</summary>
                      {msg.data.factsUsed.map(f => (
                        <div key={f.id} className="chat-source-item">{(f.content || '').substring(0, 150)}</div>
                      ))}
                    </details>
                  )}

                  {msg.data?.traversalPath && onShowTraversal && (
                    <button
                      className="chat-traversal-btn"
                      onClick={() => onShowTraversal(msg.data.traversalPath)}
                    >
                      <span className="traversal-btn-icon">&#x2728;</span>
                      Watch Raven think
                    </button>
                  )}

                  {msg.data?.suggestedFollowups?.length > 0 && (
                    <div className="chat-followups">
                      {msg.data.suggestedFollowups.map((q, i) => (
                        <button key={i} className="chat-followup-btn" onClick={() => setInput(q)}>{q}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (msg.type === 'confirmed') {
            return (
              <div key={msg.id} className="chat-msg chat-msg--raven">
                <div className="chat-bubble chat-bubble--raven chat-bubble--success">
                  <span className="confirmed-icon">&#10003;</span> {msg.content}
                  {msg.data?.saved?.length > 0 && (
                    <div className="confirmed-list">
                      {msg.data.saved.map(f => <div key={f.id} className="confirmed-fact">{f.content}</div>)}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (msg.type === 'error') {
            return (
              <div key={msg.id} className="chat-msg chat-msg--raven">
                <div className="chat-bubble chat-bubble--raven chat-bubble--error">{msg.content}</div>
              </div>
            );
          }

          if (msg.type === 'system') {
            return (
              <div key={msg.id} className="chat-msg chat-msg--system">
                <span>{msg.content}</span>
              </div>
            );
          }

          return null;
        })}

        {/* Loading indicator */}
        {isLoading && !pendingPreview && (
          <ThinkingBubble mode={loadingMode} />
        )}

        {/* Inline remember preview */}
        {pendingPreview && (
          <div className="chat-msg chat-msg--raven">
            <div className="chat-bubble chat-bubble--raven chat-bubble--preview">
              {pendingPreview.isMismatch && (
                <div className="preview-mismatch">
                  <p>{pendingPreview.mismatchSuggestion || "This looks like a question."}</p>
                  <button className="preview-switch-btn" onClick={() => {
                    const txt = pendingPreview.sourceText;
                    doCancel();
                    doAsk(txt);
                  }}>Switch to Ask</button>
                </div>
              )}

              <div className="preview-label">Review before saving:</div>

              {(pendingPreview.extractedTriples || []).map((t, i) => (
                <TriplePreview key={i} triple={t} />
              ))}

              {pendingPreview.conflicts?.length > 0 && (
                <div className="preview-conflicts">
                  {pendingPreview.conflicts.map((c, i) => (
                    <div key={i} className="preview-conflict">
                      <span className="conflict-type">{c.conflictType}:</span> {c.explanation}
                    </div>
                  ))}
                </div>
              )}

              <div className="preview-actions">
                <button className="preview-btn preview-btn--cancel" onClick={doCancel} disabled={isLoading}>Cancel</button>
                <button className="preview-btn preview-btn--confirm" onClick={() => doConfirm([])} disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input — always visible at bottom */}
      <div className="raven-chat-input">
        <textarea
          ref={inputRef}
          className="chat-input-field"
          placeholder="Ask something, or tell Raven to remember..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit('auto');
            }
          }}
          rows={1}
          disabled={isLoading || !!pendingPreview}
        />
        <div className="chat-input-actions">
          <button
            className="chat-action-btn chat-action-btn--ask"
            onClick={() => handleSubmit('ask')}
            disabled={!input.trim() || isLoading || !!pendingPreview}
          >
            Ask
          </button>
          <button
            className="chat-action-btn chat-action-btn--remember"
            onClick={() => handleSubmit('remember')}
            disabled={!input.trim() || isLoading || !!pendingPreview}
          >
            Remember
          </button>
        </div>
      </div>
    </div>
  );
}
