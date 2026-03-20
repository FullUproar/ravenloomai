/**
 * KnowledgeExplorer - Browse what Raven knows
 *
 * Simple, searchable view of confirmed facts. Dana-friendly:
 * - No jargon (no "entities", "nodes", "graph")
 * - Search by typing
 * - Filter by category
 * - See when each fact was confirmed and by whom
 */

import { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import './KnowledgeExplorer.css';

const GET_FACTS = gql`
  query GetFacts($teamId: ID!, $category: String, $limit: Int) {
    getFacts(teamId: $teamId, category: $category, limit: $limit) {
      id
      content
      category
      entityType
      entityName
      trustTier
      sourceQuote
      sourceUrl
      createdBy
      createdByUser {
        displayName
        email
      }
      validFrom
      validUntil
      createdAt
    }
  }
`;

const SEARCH_KNOWLEDGE = gql`
  query SearchKnowledge($teamId: ID!, $query: String!) {
    searchKnowledge(teamId: $teamId, query: $query) {
      answer
      confidence
      factsUsed {
        id
        content
        category
        sourceQuote
        sourceUrl
        createdAt
      }
    }
  }
`;

// Human-friendly category labels
const CATEGORY_LABELS = {
  product: 'Product',
  process: 'Process',
  people: 'People',
  policy: 'Policy',
  technical: 'Technical',
  sales: 'Sales',
  marketing: 'Marketing',
  general: 'General',
  financial: 'Financial',
  legal: 'Legal',
};

function categoryColor(cat) {
  const colors = {
    product: '#3A8DFF',
    process: '#4ADE80',
    people: '#FBBF24',
    policy: '#F472B6',
    technical: '#A78BFA',
    sales: '#34D399',
    marketing: '#FB923C',
    financial: '#60A5FA',
    legal: '#F87171',
  };
  return colors[cat] || '#8888a0';
}

export default function KnowledgeExplorer({ teamId, scopeId, onSwitchToHome }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [expandedFactId, setExpandedFactId] = useState(null);

  // Fetch all facts (with optional category filter)
  const { data: factsData, loading } = useQuery(GET_FACTS, {
    variables: {
      teamId,
      category: activeCategory,
      limit: 200
    },
    fetchPolicy: 'cache-and-network',
    pollInterval: 15000 // Auto-refresh every 15s — see new facts as they're added
  });

  const allFacts = factsData?.getFacts || [];

  // Client-side search filter
  const filteredFacts = searchQuery.trim()
    ? allFacts.filter(f =>
        f.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.entityName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.sourceQuote || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allFacts;

  // Extract unique categories from facts
  const categories = [...new Set(allFacts.map(f => f.category).filter(Boolean))].sort();

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="knowledge-explorer">
      {/* Search bar */}
      <div className="ke-search-container">
        <input
          type="text"
          className="ke-search-input"
          placeholder="Search what Raven knows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
        {searchQuery && (
          <button
            className="ke-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="ke-categories">
          <button
            className={`ke-category-btn ${!activeCategory ? 'active' : ''}`}
            onClick={() => setActiveCategory(null)}
          >
            All ({allFacts.length})
          </button>
          {categories.map(cat => {
            const count = allFacts.filter(f => f.category === cat).length;
            return (
              <button
                key={cat}
                className={`ke-category-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                style={{
                  '--cat-color': categoryColor(cat),
                  borderColor: activeCategory === cat ? categoryColor(cat) : undefined
                }}
              >
                <span className="ke-category-dot" style={{ background: categoryColor(cat) }} />
                {CATEGORY_LABELS[cat] || cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Facts list */}
      <div className="ke-facts-list">
        {loading && filteredFacts.length === 0 && (
          <div className="ke-loading">Loading knowledge...</div>
        )}

        {!loading && filteredFacts.length === 0 && (
          <div className="ke-empty">
            {searchQuery ? (
              <>
                <p className="ke-empty-title">No matches found</p>
                <p className="ke-empty-subtitle">Try a different search, or tell Raven something new.</p>
              </>
            ) : (
              <>
                <p className="ke-empty-title">Nothing here yet</p>
                <p className="ke-empty-subtitle">
                  Go back to Raven and paste some text to get started.
                </p>
                <button className="ke-empty-btn" onClick={onSwitchToHome}>
                  Tell Raven something
                </button>
              </>
            )}
          </div>
        )}

        {filteredFacts.map((fact) => (
          <div
            key={fact.id}
            className={`ke-fact-card ${expandedFactId === fact.id ? 'expanded' : ''}`}
            onClick={() => setExpandedFactId(expandedFactId === fact.id ? null : fact.id)}
          >
            <div className="ke-fact-main">
              <div className="ke-fact-content">{fact.content}</div>
              <div className="ke-fact-meta">
                {fact.category && (
                  <span
                    className="ke-fact-category"
                    style={{ color: categoryColor(fact.category) }}
                  >
                    {CATEGORY_LABELS[fact.category] || fact.category}
                  </span>
                )}
                {fact.trustTier && (
                  <span className={`ke-fact-tier ke-fact-tier--${fact.trustTier}`}>
                    {fact.trustTier === 'official' ? 'Official' : 'Team knowledge'}
                  </span>
                )}
                <span className="ke-fact-date">{formatDate(fact.createdAt)}</span>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedFactId === fact.id && (
              <div className="ke-fact-detail">
                {fact.sourceQuote && (
                  <div className="ke-fact-source">
                    <span className="ke-detail-label">Source:</span>
                    <span className="ke-detail-value">"{fact.sourceQuote}"</span>
                  </div>
                )}
                {fact.createdByUser && (
                  <div className="ke-fact-author">
                    <span className="ke-detail-label">Confirmed by:</span>
                    <span className="ke-detail-value">
                      {fact.createdByUser.displayName || fact.createdByUser.email}
                    </span>
                  </div>
                )}
                {fact.sourceUrl && (
                  <a
                    href={fact.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ke-fact-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View original source
                  </a>
                )}
                {fact.validUntil && (
                  <div className="ke-fact-expiry">
                    <span className="ke-detail-label">Valid until:</span>
                    <span className="ke-detail-value">{formatDate(fact.validUntil)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
