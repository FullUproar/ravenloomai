/**
 * RavenOracle - Immersive knowledge constellation interface
 *
 * A radically different UX for knowledge management:
 * - Full-screen constellation visualization
 * - Single input - Raven detects intent (ask vs remember)
 * - Knowledge clusters emerge organically
 * - Scopes appear as labeled regions in the constellation
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { gql, useMutation, useLazyQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './RavenOracle.css';

// Reuse existing GraphQL operations
const ASK_RAVEN = gql`
  query AskRaven($scopeId: ID!, $question: String!) {
    askRaven(scopeId: $scopeId, question: $question) {
      answer
      confidence
      factsUsed {
        id
        content
      }
      suggestedFollowups
    }
  }
`;

const PREVIEW_REMEMBER = gql`
  mutation PreviewRemember($scopeId: ID!, $statement: String!) {
    previewRemember(scopeId: $scopeId, statement: $statement) {
      previewId
      extractedFacts {
        content
        category
      }
      isMismatch
      mismatchSuggestion
    }
  }
`;

const CONFIRM_REMEMBER = gql`
  mutation ConfirmRemember($previewId: ID!) {
    confirmRemember(previewId: $previewId) {
      success
      factsCreated {
        id
        content
      }
      message
    }
  }
`;

// Particle system for constellation
class Particle {
  constructor(canvas, cluster = null) {
    this.canvas = canvas;
    this.cluster = cluster;
    this.reset();
  }

  reset() {
    const ctx = this.canvas.getContext('2d');
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    if (this.cluster) {
      // Clustered particle - orbit around cluster center
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 60;
      this.x = this.cluster.x + Math.cos(angle) * radius;
      this.y = this.cluster.y + Math.sin(angle) * radius;
      this.baseX = this.x;
      this.baseY = this.y;
    } else {
      // Free-floating particle
      this.x = Math.random() * this.canvas.width;
      this.y = Math.random() * this.canvas.height;
      this.baseX = this.x;
      this.baseY = this.y;
    }

    this.size = Math.random() * 2 + 0.5;
    this.alpha = Math.random() * 0.5 + 0.1;
    this.speed = Math.random() * 0.5 + 0.1;
    this.angle = Math.random() * Math.PI * 2;
    this.orbitRadius = Math.random() * 20 + 5;
    this.orbitSpeed = (Math.random() - 0.5) * 0.02;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.pulseSpeed = Math.random() * 0.02 + 0.01;
  }

  update() {
    // Gentle orbital motion
    this.angle += this.orbitSpeed;
    this.x = this.baseX + Math.cos(this.angle) * this.orbitRadius;
    this.y = this.baseY + Math.sin(this.angle) * this.orbitRadius;

    // Subtle pulse
    this.pulsePhase += this.pulseSpeed;
    this.currentAlpha = this.alpha * (0.7 + Math.sin(this.pulsePhase) * 0.3);
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(147, 130, 195, ${this.currentAlpha})`;
    ctx.fill();
  }
}

// Constellation canvas component
function ConstellationCanvas({ clusters, onAddParticles }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    const particleCount = 150;
    particlesRef.current = [];
    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push(new Particle(canvas));
    }

    // Animation loop
    const animate = () => {
      ctx.fillStyle = 'rgba(13, 13, 13, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw connections between nearby particles
      particlesRef.current.forEach((p1, i) => {
        particlesRef.current.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(147, 130, 195, ${0.1 * (1 - dist / 100)})`;
            ctx.stroke();
          }
        });
      });

      // Update and draw particles
      particlesRef.current.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      // Draw cluster labels
      clusters.forEach(cluster => {
        ctx.font = '14px Inter, sans-serif';
        ctx.fillStyle = 'rgba(147, 130, 195, 0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(cluster.name, cluster.x, cluster.y - 80);
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [clusters]);

  // Add burst of particles when knowledge is added
  useEffect(() => {
    if (onAddParticles) {
      onAddParticles.current = (x, y, count = 5) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        for (let i = 0; i < count; i++) {
          const p = new Particle(canvas);
          p.baseX = x || canvas.width / 2;
          p.baseY = y || canvas.height / 2;
          p.x = p.baseX;
          p.y = p.baseY;
          p.alpha = 0.8; // Brighter initially
          p.size = 3;
          particlesRef.current.push(p);
        }
      };
    }
  }, [onAddParticles]);

  return <canvas ref={canvasRef} className="constellation-canvas" />;
}

export default function RavenOracle({ scopeId, teamId }) {
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [clusters, setClusters] = useState([]);
  const inputRef = useRef(null);
  const addParticlesRef = useRef(null);
  const conversationEndRef = useRef(null);

  // GraphQL operations
  const [askRaven] = useLazyQuery(ASK_RAVEN, { fetchPolicy: 'network-only' });
  const [previewRemember] = useMutation(PREVIEW_REMEMBER);
  const [confirmRemember] = useMutation(CONFIRM_REMEMBER);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Detect if input is a question or information
  const detectIntent = (text) => {
    const trimmed = text.trim().toLowerCase();

    // Question indicators
    if (trimmed.endsWith('?')) return 'ask';
    const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'should', 'tell me'];
    if (questionWords.some(w => trimmed.startsWith(w))) return 'ask';

    // Default to remember for statements
    return 'remember';
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userInput = input.trim();
    setInput('');
    setIsProcessing(true);

    const intent = detectIntent(userInput);

    // Add user message to conversation
    setConversation(prev => [...prev, {
      type: 'user',
      content: userInput,
      timestamp: new Date()
    }]);

    try {
      if (intent === 'ask') {
        // Handle as question
        const { data } = await askRaven({
          variables: { scopeId, question: userInput }
        });

        if (data?.askRaven) {
          setConversation(prev => [...prev, {
            type: 'raven',
            intent: 'answer',
            content: data.askRaven.answer,
            confidence: data.askRaven.confidence,
            sources: data.askRaven.factsUsed,
            followups: data.askRaven.suggestedFollowups,
            timestamp: new Date()
          }]);
        }
      } else {
        // Handle as knowledge to remember
        const { data: previewData } = await previewRemember({
          variables: { scopeId, statement: userInput }
        });

        if (previewData?.previewRemember) {
          const preview = previewData.previewRemember;

          if (preview.isMismatch) {
            // It looked like a question - ask for clarification
            setConversation(prev => [...prev, {
              type: 'raven',
              intent: 'clarify',
              content: preview.mismatchSuggestion || "That sounds like a question. Would you like me to answer it instead?",
              originalInput: userInput,
              timestamp: new Date()
            }]);
          } else {
            // Auto-confirm for now (could add preview step later)
            const { data: confirmData } = await confirmRemember({
              variables: { previewId: preview.previewId }
            });

            if (confirmData?.confirmRemember?.success) {
              // Add particles burst for visual feedback
              if (addParticlesRef.current) {
                addParticlesRef.current(null, null, 8);
              }

              const factsCount = confirmData.confirmRemember.factsCreated?.length || 0;
              setConversation(prev => [...prev, {
                type: 'raven',
                intent: 'remembered',
                content: factsCount === 1
                  ? "I've woven that into my memory."
                  : `I've woven ${factsCount} insights into my memory.`,
                facts: confirmData.confirmRemember.factsCreated,
                timestamp: new Date()
              }]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Oracle error:', error);
      setConversation(prev => [...prev, {
        type: 'raven',
        intent: 'error',
        content: "I couldn't process that. Please try again.",
        timestamp: new Date()
      }]);
    }

    setIsProcessing(false);
  };

  const handleFollowup = (question) => {
    setInput(question);
    // Auto-submit after a brief delay
    setTimeout(() => {
      handleSubmit();
    }, 100);
  };

  return (
    <div className="raven-oracle">
      <ConstellationCanvas
        clusters={clusters}
        onAddParticles={addParticlesRef}
      />

      <div className="oracle-content">
        {/* Conversation thread */}
        <div className="oracle-conversation">
          {conversation.length === 0 && (
            <div className="oracle-welcome">
              <div className="welcome-glow" />
              <p className="welcome-text">What would you like to know... or remember?</p>
            </div>
          )}

          {conversation.map((msg, i) => (
            <div key={i} className={`oracle-message ${msg.type}`}>
              {msg.type === 'user' ? (
                <p className="user-text">{msg.content}</p>
              ) : (
                <div className="raven-response">
                  <div className="response-content">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>

                  {msg.intent === 'answer' && msg.followups?.length > 0 && (
                    <div className="response-followups">
                      {msg.followups.map((q, j) => (
                        <button
                          key={j}
                          className="followup-chip"
                          onClick={() => handleFollowup(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.intent === 'remembered' && msg.facts?.length > 0 && (
                    <div className="remembered-facts">
                      {msg.facts.map((f, j) => (
                        <div key={j} className="fact-chip">
                          {f.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isProcessing && (
            <div className="oracle-message raven">
              <div className="raven-thinking">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            </div>
          )}

          <div ref={conversationEndRef} />
        </div>

        {/* Input area */}
        <form className="oracle-input-area" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="oracle-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything or share what you know..."
            disabled={isProcessing}
          />
          <button
            type="submit"
            className="oracle-submit"
            disabled={!input.trim() || isProcessing}
          >
            <span className="submit-icon">&#x279C;</span>
          </button>
        </form>
      </div>
    </div>
  );
}
