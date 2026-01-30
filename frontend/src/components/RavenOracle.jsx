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

const PROCESS_DOCUMENT = gql`
  mutation ProcessDocument($teamId: ID!, $title: String!, $content: String, $url: String) {
    processDocumentContent(teamId: $teamId, title: $title, content: $content, url: $url) {
      success
      title
      nodesCreated
      edgesCreated
      chunksCreated
      factsExtracted
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
function ConstellationCanvas({ facts, onAddParticles, onFactCount, highlightIds, onSelectFact }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const clustersRef = useRef({});
  const animationRef = useRef(null);
  const [selectedParticle, setSelectedParticle] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const highlightSet = useRef(new Set());

  // Drag state refs (not state to avoid re-renders during drag)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // Update highlight set when highlightIds changes
  useEffect(() => {
    highlightSet.current = new Set(highlightIds || []);
  }, [highlightIds]);

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
      // Clear completely (zoom requires full clear)
      ctx.fillStyle = 'rgba(13, 13, 13, 1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply pan and zoom transform
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

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

        // Check if this particle should be highlighted
        const isHighlighted = highlightSet.current.has(p.id);
        const isSelected = selectedParticle?.id === p.id;
        const isHovered = hoveredParticle?.id === p.id;

        // Draw with highlight effects
        ctx.beginPath();
        const size = p.currentSize * (isHighlighted || isSelected ? 2 : 1) * (isHovered ? 1.3 : 1);
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);

        if (isHighlighted || isSelected) {
          // Bright glow for highlighted/selected
          ctx.fillStyle = `rgba(255, 220, 100, ${p.currentAlpha + 0.4})`;
          ctx.shadowColor = 'rgba(255, 220, 100, 0.8)';
          ctx.shadowBlur = 15;
        } else if (isHovered) {
          ctx.fillStyle = `rgba(${p.color.r + 50}, ${p.color.g + 50}, ${p.color.b + 50}, ${p.currentAlpha + 0.2})`;
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.currentAlpha})`;
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw cluster labels
      Object.values(clustersRef.current).forEach(cluster => {
        ctx.font = `${12 / zoom}px Inter, sans-serif`;
        ctx.fillStyle = `rgba(${cluster.color.r}, ${cluster.color.g}, ${cluster.color.b}, 0.5)`;
        ctx.textAlign = 'center';
        ctx.fillText(cluster.name, cluster.x, cluster.y - 100);
      });

      ctx.restore();
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

  // Mouse interaction handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      // Transform screen coords to canvas coords accounting for pan and zoom
      const canvasX = (clientX - rect.left - pan.x - canvas.width / 2) / zoom + canvas.width / 2;
      const canvasY = (clientY - rect.top - pan.y - canvas.height / 2) / zoom + canvas.height / 2;
      return { x: canvasX, y: canvasY, screenX: clientX - rect.left, screenY: clientY - rect.top };
    };

    const findParticleAt = (pos, threshold = 20) => {
      for (const p of particlesRef.current) {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshold / zoom) {
          return p;
        }
      }
      return null;
    };

    const handleMouseDown = (e) => {
      if (e.button !== 0 && !e.touches) return; // Only left click or touch
      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragStartRef.current = { x: clientX, y: clientY };
      panStartRef.current = { ...pan };
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e) => {
      if (isDraggingRef.current) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;

        // Mark as dragged if moved more than 5px
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          hasDraggedRef.current = true;
        }

        setPan({
          x: panStartRef.current.x + dx,
          y: panStartRef.current.y + dy
        });
      } else {
        // Check if hovering over a particle for cursor feedback
        const pos = getMousePos(e);
        const particle = findParticleAt(pos);
        canvas.style.cursor = particle ? 'pointer' : 'grab';
      }
    };

    const handleMouseUp = (e) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        canvas.style.cursor = 'grab';

        // If didn't drag significantly, treat as click
        if (!hasDraggedRef.current) {
          const pos = getMousePos(e.changedTouches ? e.changedTouches[0] : e);
          const particle = findParticleAt(pos);
          if (particle) {
            setSelectedParticle(particle);
            if (onSelectFact) {
              onSelectFact(particle.fact);
            }
          } else {
            setSelectedParticle(null);
          }
        }
      }
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom factor
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.3, Math.min(5, zoom * delta));
      const zoomRatio = newZoom / zoom;

      // Adjust pan to zoom toward mouse position
      const newPanX = mouseX - (mouseX - pan.x) * zoomRatio;
      const newPanY = mouseY - (mouseY - pan.y) * zoomRatio;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    // Double-click to zoom in and center on point
    const handleDoubleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Check if clicking on a particle
      const pos = getMousePos(e);
      const particle = findParticleAt(pos);

      if (particle) {
        // Zoom in on particle
        const newZoom = Math.min(zoom * 1.5, 5);
        setZoom(newZoom);
        // Center on particle
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        setPan({
          x: centerX - (particle.x - centerX) * newZoom - centerX + canvas.width / 2,
          y: centerY - (particle.y - centerY) * newZoom - centerY + canvas.height / 2
        });
        setSelectedParticle(particle);
        if (onSelectFact) onSelectFact(particle.fact);
      } else {
        // Reset zoom and pan
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };

    // Touch pinch zoom
    let lastTouchDist = 0;
    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1) {
        handleMouseDown(e);
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (lastTouchDist > 0) {
          const scale = dist / lastTouchDist;
          const newZoom = Math.max(0.3, Math.min(5, zoom * scale));
          setZoom(newZoom);
        }
        lastTouchDist = dist;
      } else if (e.touches.length === 1) {
        handleMouseMove(e);
      }
    };

    const handleTouchEnd = (e) => {
      lastTouchDist = 0;
      handleMouseUp(e);
    };

    // Mouse events
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDoubleClick);

    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    // Set initial cursor
    canvas.style.cursor = 'grab';

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [zoom, pan, onSelectFact]);

  return (
    <>
      <canvas ref={canvasRef} className="constellation-canvas" />
      {/* Selected particle detail panel */}
      {selectedParticle && (
        <div className="constellation-detail">
          <button className="detail-close" onClick={() => setSelectedParticle(null)}>×</button>
          <div className="detail-category">{selectedParticle.fact.category || 'General'}</div>
          <div className="detail-content">{selectedParticle.fact.content}</div>
          {selectedParticle.fact.entityName && (
            <div className="detail-entity">
              {selectedParticle.fact.entityType}: {selectedParticle.fact.entityName}
            </div>
          )}
        </div>
      )}
      {/* Zoom/pan indicator */}
      {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
        <div className="constellation-zoom">
          {Math.round(zoom * 100)}%
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
        </div>
      )}
      {/* Controls hint */}
      <div className="constellation-hint">
        Scroll to zoom • Drag to pan • Click to inspect • Double-click to reset
      </div>
    </>
  );
}

export default function RavenOracle({ scopeId, teamId }) {
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [factCount, setFactCount] = useState(0);
  const [highlightIds, setHighlightIds] = useState([]);
  const [selectedFact, setSelectedFact] = useState(null);
  const [exploreMode, setExploreMode] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const addParticlesRef = useRef(null);
  const conversationEndRef = useRef(null);

  // Fetch existing facts to populate constellation
  const { data: factsData, refetch: refetchFacts } = useQuery(GET_FACTS, {
    variables: { teamId, limit: 500 },
    fetchPolicy: 'cache-and-network'
  });
  const facts = factsData?.getFacts || [];

  // Clear highlights after a delay
  useEffect(() => {
    if (highlightIds.length > 0) {
      const timer = setTimeout(() => setHighlightIds([]), 10000);
      return () => clearTimeout(timer);
    }
  }, [highlightIds]);

  // GraphQL operations
  const [askRaven] = useLazyQuery(ASK_RAVEN, { fetchPolicy: 'network-only' });
  const [previewRemember] = useMutation(PREVIEW_REMEMBER);
  const [confirmRemember] = useMutation(CONFIRM_REMEMBER);
  const [processDocument] = useMutation(PROCESS_DOCUMENT);

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
          // Highlight facts used in the constellation
          const usedIds = data.askRaven.factsUsed?.map(f => f.id) || [];
          setHighlightIds(usedIds);

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
              const newFacts = confirmData.confirmRemember.factsCreated || [];
              if (addParticlesRef.current && newFacts.length > 0) {
                addParticlesRef.current(newFacts);
              }

              // Generate conversational recap
              const factsCount = newFacts.length;
              let recap = "";
              if (factsCount === 0) {
                recap = "I didn't find any new information to store from that.";
              } else if (factsCount === 1) {
                recap = `Got it. I now know: **${newFacts[0].content}**`;
              } else {
                recap = `I've captured ${factsCount} pieces of knowledge:\n\n` +
                  newFacts.map(f => `• ${f.content}`).join('\n');
              }

              setConversation(prev => [...prev, {
                type: 'raven',
                intent: 'remembered',
                content: recap,
                facts: newFacts,
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

  // Handle file upload
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
      setUploadContent(event.target.result);
      setUploadUrl('');
      setShowUploadModal(true);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Process document upload
  const handleUploadSubmit = async () => {
    if (!uploadTitle.trim() || (!uploadContent.trim() && !uploadUrl.trim())) return;

    setIsUploading(true);
    try {
      const { data } = await processDocument({
        variables: {
          teamId,
          title: uploadTitle.trim(),
          content: uploadContent.trim() || null,
          url: uploadUrl.trim() || null
        }
      });

      if (data?.processDocumentContent) {
        const result = data.processDocumentContent;
        setConversation(prev => [...prev, {
          type: 'raven',
          intent: 'document',
          content: result.success
            ? `**Processed "${result.title}"**\n\n${result.factsExtracted} facts extracted, ${result.nodesCreated} entities identified.`
            : `Failed to process document: ${result.message}`,
          timestamp: new Date()
        }]);

        if (result.success) {
          // Refresh facts to show new particles
          refetchFacts();
        }
      }
    } catch (error) {
      console.error('Document upload error:', error);
      setConversation(prev => [...prev, {
        type: 'raven',
        intent: 'error',
        content: `Failed to process document: ${error.message}`,
        timestamp: new Date()
      }]);
    }

    setIsUploading(false);
    setShowUploadModal(false);
    setUploadTitle('');
    setUploadContent('');
    setUploadUrl('');
  };

  return (
    <div className={`raven-oracle ${exploreMode ? 'explore-mode' : ''}`}>
      <ConstellationCanvas
        facts={facts}
        onAddParticles={addParticlesRef}
        onFactCount={setFactCount}
        highlightIds={highlightIds}
        onSelectFact={setSelectedFact}
      />

      {/* Explore toggle */}
      <button
        className="explore-toggle"
        onClick={() => setExploreMode(!exploreMode)}
        title={exploreMode ? 'Show chat' : 'Explore constellation'}
      >
        {exploreMode ? '💬' : '✨'}
      </button>

      <div className={`oracle-content ${exploreMode ? 'collapsed' : ''}`}>
        {/* Conversation thread */}
        <div className="oracle-conversation">
          {conversation.length === 0 && !exploreMode && (
            <div className="oracle-welcome">
              <div className="welcome-glow" />
              {factCount === 0 ? (
                <p className="welcome-text">Your knowledge constellation awaits.<br />Share something to begin.</p>
              ) : (
                <p className="welcome-text">
                  {factCount} {factCount === 1 ? 'memory' : 'memories'} in your constellation.<br />
                  Click ✨ to explore, or ask below.
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Upload button */}
          <button
            type="button"
            className="oracle-upload-btn"
            onClick={() => setShowUploadModal(true)}
            title="Add documents or links"
          >
            <span>+</span>
          </button>

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

      {/* Upload modal */}
      {showUploadModal && (
        <div className="upload-modal-overlay" onClick={() => !isUploading && setShowUploadModal(false)}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="upload-modal-header">
              <h3>Add Knowledge</h3>
              <button
                className="upload-modal-close"
                onClick={() => !isUploading && setShowUploadModal(false)}
                disabled={isUploading}
              >
                ×
              </button>
            </div>

            <div className="upload-modal-body">
              <div className="upload-field">
                <label>Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Document title"
                  disabled={isUploading}
                />
              </div>

              <div className="upload-tabs">
                <button
                  type="button"
                  className={`upload-tab ${!uploadUrl && uploadContent ? 'active' : ''}`}
                  onClick={() => { setUploadUrl(''); }}
                >
                  Paste Text
                </button>
                <button
                  type="button"
                  className={`upload-tab ${uploadUrl ? 'active' : ''}`}
                  onClick={() => { setUploadContent(''); }}
                >
                  From URL
                </button>
                <button
                  type="button"
                  className={`upload-tab`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload File
                </button>
              </div>

              {uploadUrl || (!uploadContent && !uploadUrl) ? (
                <div className="upload-field">
                  <label>URL (Google Docs, web pages)</label>
                  <input
                    type="url"
                    value={uploadUrl}
                    onChange={(e) => setUploadUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    disabled={isUploading}
                  />
                  <p className="upload-hint">Paste a Google Doc URL or any web page</p>
                </div>
              ) : (
                <div className="upload-field">
                  <label>Content</label>
                  <textarea
                    value={uploadContent}
                    onChange={(e) => setUploadContent(e.target.value)}
                    placeholder="Paste your text here..."
                    disabled={isUploading}
                    rows={8}
                  />
                </div>
              )}
            </div>

            <div className="upload-modal-footer">
              <button
                type="button"
                className="upload-cancel"
                onClick={() => setShowUploadModal(false)}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="upload-submit"
                onClick={handleUploadSubmit}
                disabled={isUploading || !uploadTitle.trim() || (!uploadContent.trim() && !uploadUrl.trim())}
              >
                {isUploading ? 'Processing...' : 'Add Knowledge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
