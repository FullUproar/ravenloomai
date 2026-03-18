/**
 * Onboarding - The First 5 Minutes (Brief Section 7)
 *
 * Designed for the Dana persona. Five screens:
 * 1. Paste - "Paste anything"
 * 2. Confirm - Review extracted facts
 * 3. Ask - Ask about what you just told Raven
 * 4. Simulate - See what a teammate would experience
 * 5. Tease - Light prompts for what's next
 *
 * Design principle: "Can I rely on this?" — answered seven different ways.
 */

import { useState, useRef, useEffect } from 'react';
import { gql, useMutation, useLazyQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './Onboarding.css';

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
        existingFact { id content createdAt }
        conflictType
        explanation
      }
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

const ASK_RAVEN = gql`
  query AskRaven($scopeId: ID!, $question: String!) {
    askRaven(scopeId: $scopeId, question: $question) {
      answer
      confidence
      factsUsed { id content sourceQuote sourceUrl createdAt }
      suggestedFollowups
    }
  }
`;

// Sample content for cold start
const SAMPLE_THREAD = `Meeting recap - March 14:
- We decided to go with Stripe for payment processing
- Launch date is set for June 15th
- Tyler is handling the landing page design
- Budget for the launch campaign is $5,000
- Dana will coordinate with the PR agency by end of month`;

export default function Onboarding({ scopeId, onComplete, onFactsChanged }) {
  const [step, setStep] = useState(1); // 1-5
  const [input, setInput] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [confirmedFacts, setConfirmedFacts] = useState([]);
  const [askQuestion, setAskQuestion] = useState('');
  const [askResult, setAskResult] = useState(null);
  const [simulateResult, setSimulateResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const [previewRemember, { loading: previewLoading }] = useMutation(PREVIEW_REMEMBER);
  const [confirmRemember, { loading: confirmLoading }] = useMutation(CONFIRM_REMEMBER);
  const [askRaven, { loading: askLoading }] = useLazyQuery(ASK_RAVEN, { fetchPolicy: 'network-only' });

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  // ── Step 1: Paste ──────────────────────────────────────────────────────────
  const handlePaste = async () => {
    if (!input.trim()) return;
    setError(null);

    try {
      const { data } = await previewRemember({
        variables: { scopeId, statement: input.trim() }
      });
      setPreviewData(data.previewRemember);
      setStep(2);
    } catch (err) {
      setError('Something went wrong extracting facts. Try again.');
      console.error('Onboarding paste error:', err);
    }
  };

  const handleUseSample = () => {
    setInput(SAMPLE_THREAD);
  };

  // ── Step 2: Confirm ────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!previewData) return;
    setError(null);

    try {
      const { data } = await confirmRemember({
        variables: { previewId: previewData.previewId }
      });
      const created = data.confirmRemember.factsCreated || [];
      const updated = data.confirmRemember.factsUpdated || [];
      setConfirmedFacts([...created, ...updated]);
      onFactsChanged?.();
      setStep(3);
    } catch (err) {
      setError('Failed to save facts. Try again.');
      console.error('Onboarding confirm error:', err);
    }
  };

  // ── Step 3: Ask ────────────────────────────────────────────────────────────
  const handleAsk = async () => {
    if (!askQuestion.trim()) return;
    setError(null);

    try {
      const { data } = await askRaven({
        variables: { scopeId, question: askQuestion.trim() }
      });
      setAskResult(data.askRaven);
      setStep(4);
    } catch (err) {
      setError('Failed to get an answer. Try again.');
      console.error('Onboarding ask error:', err);
    }
  };

  // ── Step 4: Simulate ──────────────────────────────────────────────────────
  const handleSimulate = async () => {
    // Pick a question based on confirmed facts
    const sampleQ = confirmedFacts.length > 0
      ? `What do we know about ${confirmedFacts[0].content.split(' ').slice(0, 4).join(' ')}?`
      : 'What has been decided recently?';

    try {
      const { data } = await askRaven({
        variables: { scopeId, question: sampleQ }
      });
      setSimulateResult({ question: sampleQ, ...data.askRaven });
    } catch (err) {
      console.error('Onboarding simulate error:', err);
    }
  };

  useEffect(() => {
    if (step === 4 && !simulateResult) {
      handleSimulate();
    }
  }, [step]);

  // ── Step 5: Tease ─────────────────────────────────────────────────────────
  const handleFinish = () => {
    onComplete?.();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const progressWidth = `${(step / 5) * 100}%`;

  return (
    <div className="onboarding">
      {/* Progress bar */}
      <div className="onboarding-progress">
        <div className="onboarding-progress-fill" style={{ width: progressWidth }} />
      </div>

      <div className="onboarding-content">
        {/* Step 1: Paste */}
        {step === 1 && (
          <div className="onboarding-step onboarding-step-paste">
            <h1 className="onboarding-headline">
              Stop answering the same questions twice.
            </h1>
            <p className="onboarding-subtext">
              Paste anything — a Slack thread, meeting notes, an email. Raven turns it into answers your team can reuse.
            </p>

            <div className="onboarding-input-container">
              <textarea
                ref={inputRef}
                className="onboarding-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste a thread, meeting notes, or any text with useful information..."
                rows={6}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePaste();
                }}
              />
              <div className="onboarding-input-actions">
                {!input && (
                  <button className="onboarding-btn-ghost" onClick={handleUseSample}>
                    Use a sample instead
                  </button>
                )}
                <button
                  className="onboarding-btn-primary"
                  onClick={handlePaste}
                  disabled={!input.trim() || previewLoading}
                >
                  {previewLoading ? 'Reading...' : 'Let Raven read this'}
                </button>
              </div>
            </div>

            {error && <p className="onboarding-error">{error}</p>}
          </div>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && previewData && (
          <div className="onboarding-step onboarding-step-confirm">
            <h2 className="onboarding-step-title">
              Raven found {previewData.extractedFacts.length} {previewData.extractedFacts.length === 1 ? 'thing' : 'things'} worth remembering.
            </h2>
            <p className="onboarding-subtext">
              Review and confirm. Nothing enters your knowledge base without your approval.
            </p>

            <div className="onboarding-facts-list">
              {previewData.extractedFacts.map((fact, i) => (
                <div key={i} className="onboarding-fact-card">
                  <div className="onboarding-fact-content">{fact.content}</div>
                  <div className="onboarding-fact-meta">
                    {fact.category && (
                      <span className="onboarding-fact-category">{fact.category}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="onboarding-actions">
              <button
                className="onboarding-btn-primary"
                onClick={handleConfirm}
                disabled={confirmLoading}
              >
                {confirmLoading ? 'Saving...' : 'Confirm all'}
              </button>
              <button className="onboarding-btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
            </div>

            {error && <p className="onboarding-error">{error}</p>}
          </div>
        )}

        {/* Step 3: Ask */}
        {step === 3 && (
          <div className="onboarding-step onboarding-step-ask">
            <div className="onboarding-success-badge">
              Raven knows {confirmedFacts.length} new {confirmedFacts.length === 1 ? 'thing' : 'things'}.
            </div>

            <h2 className="onboarding-step-title">
              Now ask me something about what you just told me.
            </h2>

            {confirmedFacts.length > 0 && (
              <div className="onboarding-suggestions">
                {confirmedFacts.slice(0, 3).map((fact, i) => {
                  const words = fact.content.split(' ').slice(0, 5).join(' ');
                  const suggestion = `What do we know about ${words}?`;
                  return (
                    <button
                      key={i}
                      className="onboarding-suggestion"
                      onClick={() => setAskQuestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="onboarding-ask-container">
              <input
                ref={inputRef}
                type="text"
                className="onboarding-ask-input"
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="Ask a question..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAsk();
                }}
              />
              <button
                className="onboarding-btn-primary"
                onClick={handleAsk}
                disabled={!askQuestion.trim() || askLoading}
              >
                {askLoading ? 'Thinking...' : 'Ask'}
              </button>
            </div>

            {error && <p className="onboarding-error">{error}</p>}
          </div>
        )}

        {/* Step 4: Simulate Teammate */}
        {step === 4 && (
          <div className="onboarding-step onboarding-step-simulate">
            {/* Show the user's answer first */}
            {askResult && (
              <div className="onboarding-answer-card">
                <div className="onboarding-answer-label">Your answer</div>
                <div className="onboarding-answer-text">
                  <ReactMarkdown>{askResult.answer}</ReactMarkdown>
                </div>
                {askResult.factsUsed?.length > 0 && (
                  <div className="onboarding-sources">
                    {askResult.factsUsed.map((fact, i) => (
                      <span key={i} className="onboarding-source-chip">
                        {fact.content.substring(0, 60)}...
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="onboarding-simulate-divider">
              <span>Now imagine a teammate asks:</span>
            </div>

            {simulateResult ? (
              <div className="onboarding-simulate-card">
                <div className="onboarding-simulate-question">
                  "{simulateResult.question}"
                </div>
                <div className="onboarding-answer-text">
                  <ReactMarkdown>{simulateResult.answer}</ReactMarkdown>
                </div>
                <div className="onboarding-simulate-punchline">
                  Next time someone asks this, you don't answer — Raven does.
                </div>
              </div>
            ) : (
              <div className="onboarding-loading">Simulating...</div>
            )}

            <div className="onboarding-actions">
              <button className="onboarding-btn-primary" onClick={() => setStep(5)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Tease */}
        {step === 5 && (
          <div className="onboarding-step onboarding-step-tease">
            <h2 className="onboarding-step-title">You're all set.</h2>
            <p className="onboarding-subtext">
              The more you tell Raven, the more your team can find without asking you.
            </p>

            <div className="onboarding-tease-cards">
              <div className="onboarding-tease-card">
                <div className="onboarding-tease-icon">+</div>
                <div className="onboarding-tease-text">
                  <strong>Add more knowledge</strong>
                  <span>Paste more threads, notes, or documents.</span>
                </div>
              </div>
              <div className="onboarding-tease-card">
                <div className="onboarding-tease-icon">&#x1f4c4;</div>
                <div className="onboarding-tease-text">
                  <strong>Connect Google Drive</strong>
                  <span>Raven reads your docs so nobody else has to.</span>
                </div>
              </div>
              <div className="onboarding-tease-card">
                <div className="onboarding-tease-icon">&#x1f465;</div>
                <div className="onboarding-tease-text">
                  <strong>Invite your team</strong>
                  <span>They paste and confirm. Raven handles the rest.</span>
                </div>
              </div>
            </div>

            <button className="onboarding-btn-primary" onClick={handleFinish}>
              Start using Raven
            </button>
          </div>
        )}
      </div>

      {/* Skip button (always available) */}
      {step < 5 && (
        <button className="onboarding-skip" onClick={handleFinish}>
          Skip intro
        </button>
      )}
    </div>
  );
}
