/**
 * RavenOracle - Immersive knowledge constellation interface
 *
 * A radically different UX for knowledge management:
 * - Full-screen constellation visualization where each particle is a fact
 * - Single input - Raven detects intent (ask vs remember)
 * - Knowledge clusters emerge organically by category
 * - Empty on day 1 - grows as you add knowledge
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { gql, useMutation, useLazyQuery, useQuery } from '@apollo/client';
import ReactMarkdown from 'react-markdown';
import './RavenOracle.css';

// Fetch existing knowledge
const GET_FACTS = gql`
  query GetFacts($teamId: ID!, $limit: Int) {
    getFacts(teamId: $teamId, limit: $limit) {
      id
      content
      category
      entityType
      entityName
    }
  }
`;

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
        category
      }
      message
    }
  }
`;

// Category colors for visual grouping
const CATEGORY_COLORS = {
  general: { r: 147, g: 130, b: 195 },      // Purple (default)
  product: { r: 100, g: 180, b: 230 },      // Blue
  process: { r: 130, g: 195, b: 147 },      // Green
  people: { r: 230, g: 160, b: 100 },       // Orange
  policy: { r: 195, g: 130, b: 147 },       // Pink
  technical: { r: 180, g: 180, b: 130 },    // Yellow-ish
  sales: { r: 130, g: 175, b: 195 },        // Teal
  marketing: { r: 195, g: 147, b: 180 },    // Magenta
};

// Knowledge particle - represents a single fact
class KnowledgeParticle {
  constructor(canvas, fact, clusterCenter) {
    this.canvas = canvas;
    this.fact = fact;
    this.id = fact.id;

    // Get color from category
    const category = fact.category?.toLowerCase() || 'general';
    this.color = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;

    // Position near cluster center with some spread
    const angle = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 80;
    this.baseX = clusterCenter.x + Math.cos(angle) * radius;
    this.baseY = clusterCenter.y + Math.sin(angle) * radius;
    this.x = this.baseX;
    this.y = this.baseY;

    // Visual properties
    this.size = 2.5 + Math.random() * 1.5;
    this.alpha = 0.4 + Math.random() * 0.3;
    this.angle = Math.random() * Math.PI * 2;
    this.orbitRadius = 8 + Math.random() * 12;
    this.orbitSpeed = (Math.random() - 0.5) * 0.015;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.pulseSpeed = 0.01 + Math.random() * 0.01;

    // For new particles - start bright and fade to normal
    this.isNew = false;
    this.newFade = 1;
  }

  update() {
    // Gentle orbital motion
    this.angle += this.orbitSpeed;
    this.x = this.baseX + Math.cos(this.angle) * this.orbitRadius;
    this.y = this.baseY + Math.sin(this.angle) * this.orbitRadius;

    // Subtle pulse
    this.pulsePhase += this.pulseSpeed;
    const pulse = 0.7 + Math.sin(this.pulsePhase) * 0.3;

    // New particle effect
    if (this.isNew && this.newFade > 0) {
      this.newFade -= 0.005;
      this.currentAlpha = this.alpha * pulse + this.newFade * 0.5;
      this.currentSize = this.size + this.newFade * 3;
    } else {
      this.isNew = false;
      this.currentAlpha = this.alpha * pulse;
      this.currentSize = this.size;
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.currentAlpha})`;
    ctx.fill();
  }
}

// Constellation canvas component - now driven by actual facts
function ConstellationCanvas({ facts, onAddParticles, onFactCount }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const clustersRef = useRef({});
  const animationRef = useRef(null);

  // Build particles from facts
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Group facts by category to create clusters
    const categories = {};
    facts.forEach(fact => {
      const cat = fact.category?.toLowerCase() || 'general';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(fact);
    });

    // Calculate cluster positions in a circle around center
    const categoryNames = Object.keys(categories);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const clusterRadius = Math.min(canvas.width, canvas.height) * 0.25;

    clustersRef.current = {};
    categoryNames.forEach((cat, i) => {
      const angle = (i / categoryNames.length) * Math.PI * 2 - Math.PI / 2;
      clustersRef.current[cat] = {
        name: cat.charAt(0).toUpperCase() + cat.slice(1),
        x: centerX + Math.cos(angle) * clusterRadius,
        y: centerY + Math.sin(angle) * clusterRadius,
        color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.general
      };
    });

    // Create particles for facts we don't already have
    const existingIds = new Set(particlesRef.current.map(p => p.id));
    facts.forEach(fact => {
      if (!existingIds.has(fact.id)) {
        const cat = fact.category?.toLowerCase() || 'general';
        const cluster = clustersRef.current[cat] || { x: centerX, y: centerY };
        const particle = new KnowledgeParticle(canvas, fact, cluster);
        particlesRef.current.push(particle);
      }
    });

    // Report fact count
    if (onFactCount) {
      onFactCount(facts.length);
    }
  }, [facts, onFactCount]);

  // Initialize canvas and animation
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

    // Animation loop
    const animate = () => {
      // Clear with slight trail effect
      ctx.fillStyle = 'rgba(13, 13, 13, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw connections between nearby particles (same cluster)
      particlesRef.current.forEach((p1, i) => {
        particlesRef.current.slice(i + 1).forEach(p2 => {
          // Only connect particles of the same category
          if (p1.fact.category !== p2.fact.category) return;

          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            const alpha = 0.15 * (1 - dist / 80);
            ctx.strokeStyle = `rgba(${p1.color.r}, ${p1.color.g}, ${p1.color.b}, ${alpha})`;
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
      Object.values(clustersRef.current).forEach(cluster => {
        ctx.font = '12px Inter, sans-serif';
        ctx.fillStyle = `rgba(${cluster.color.r}, ${cluster.color.g}, ${cluster.color.b}, 0.5)`;
        ctx.textAlign = 'center';
        ctx.fillText(cluster.name, cluster.x, cluster.y - 100);
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
  }, []);

  // Expose function to add new particles
  useEffect(() => {
    if (onAddParticles) {
      onAddParticles.current = (newFacts) => {
        const canvas = canvasRef.current;
        if (!canvas || !newFacts?.length) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        newFacts.forEach(fact => {
          const cat = fact.category?.toLowerCase() || 'general';
          let cluster = clustersRef.current[cat];

          // Create new cluster if needed
          if (!cluster) {
            const existingCount = Object.keys(clustersRef.current).length;
            const angle = (existingCount / (existingCount + 1)) * Math.PI * 2 - Math.PI / 2;
            const clusterRadius = Math.min(canvas.width, canvas.height) * 0.25;
            cluster = {
              name: cat.charAt(0).toUpperCase() + cat.slice(1),
              x: centerX + Math.cos(angle) * clusterRadius,
              y: centerY + Math.sin(angle) * clusterRadius,
              color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.general
            };
            clustersRef.current[cat] = cluster;
          }

          const particle = new KnowledgeParticle(canvas, fact, cluster);
          particle.isNew = true;
          particlesRef.current.push(particle);
        });
      };
    }
  }, [onAddParticles]);

  return <canvas ref={canvasRef} className="constellation-canvas" />;
}

export default function RavenOracle({ scopeId, teamId }) {
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [factCount, setFactCount] = useState(0);
  const inputRef = useRef(null);
  const addParticlesRef = useRef(null);
  const conversationEndRef = useRef(null);

  // Fetch existing facts to populate constellation
  const { data: factsData } = useQuery(GET_FACTS, {
    variables: { teamId, limit: 500 },
    fetchPolicy: 'cache-and-network'
  });
  const facts = factsData?.getFacts || [];

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
              // Add new fact particles to constellation
              if (addParticlesRef.current && confirmData.confirmRemember.factsCreated) {
                addParticlesRef.current(confirmData.confirmRemember.factsCreated);
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
        facts={facts}
        onAddParticles={addParticlesRef}
        onFactCount={setFactCount}
      />

      <div className="oracle-content">
        {/* Conversation thread */}
        <div className="oracle-conversation">
          {conversation.length === 0 && (
            <div className="oracle-welcome">
              <div className="welcome-glow" />
              {factCount === 0 ? (
                <p className="welcome-text">Your knowledge constellation awaits.<br />Share something to begin.</p>
              ) : (
                <p className="welcome-text">
                  {factCount} {factCount === 1 ? 'memory' : 'memories'} in your constellation.<br />
                  Ask anything or add more.
                </p>
              )}
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
