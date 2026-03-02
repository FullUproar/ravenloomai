/**
 * FreshnessDashboard - Knowledge freshness monitoring and management
 */

import React, { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import './FreshnessDashboard.css';

const GET_FRESHNESS_STATS = gql`
  query GetFreshnessStats($teamId: ID!) {
    getFreshnessStats(teamId: $teamId) {
      fresh
      stale
      needsReview
      expired
      total
      avgConfidence
      oldestValidation
      olderThan90Days
      healthScore
    }
  }
`;

const GET_FACTS_NEEDING_REVIEW = gql`
  query GetFactsNeedingReview($teamId: ID!, $limit: Int, $offset: Int) {
    getFactsNeedingReview(teamId: $teamId, limit: $limit, offset: $offset) {
      id
      content
      category
      freshnessStatus
      lastValidatedAt
      confidence
      daysSinceValidation
      nodeName
      nodeType
      createdAt
    }
  }
`;

const GET_TEMPORALLY_OUTDATED = gql`
  query GetTemporallyOutdatedFacts($teamId: ID!, $limit: Int) {
    getTemporallyOutdatedFacts(teamId: $teamId, limit: $limit) {
      id
      content
      category
      pastYearsReferenced
      hasPastTenseWords
      nodeName
      freshnessStatus
      createdAt
    }
  }
`;

const MARK_STALE_KNOWLEDGE = gql`
  mutation MarkStaleKnowledge($teamId: ID!, $staleThresholdDays: Int) {
    markStaleKnowledge(teamId: $teamId, staleThresholdDays: $staleThresholdDays) {
      factsMarked
      nodesMarked
    }
  }
`;

const VALIDATE_FACTS = gql`
  mutation ValidateFacts($factIds: [ID!]!) {
    validateFacts(factIds: $factIds) {
      factsValidated
    }
  }
`;

const EXPIRE_FACT = gql`
  mutation ExpireFact($factId: ID!) {
    expireFact(factId: $factId)
  }
`;

function FreshnessDashboard({ teamId }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedFacts, setSelectedFacts] = useState(new Set());
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useQuery(GET_FRESHNESS_STATS, {
    variables: { teamId },
    skip: !teamId
  });

  const { data: reviewData, loading: reviewLoading, refetch: refetchReview } = useQuery(GET_FACTS_NEEDING_REVIEW, {
    variables: { teamId, limit: pageSize, offset: page * pageSize },
    skip: !teamId || activeTab !== 'review'
  });

  const { data: temporalData, loading: temporalLoading, refetch: refetchTemporal } = useQuery(GET_TEMPORALLY_OUTDATED, {
    variables: { teamId, limit: 50 },
    skip: !teamId || activeTab !== 'temporal'
  });

  const [markStale, { loading: markingStale }] = useMutation(MARK_STALE_KNOWLEDGE, {
    onCompleted: () => { refetchStats(); refetchReview(); }
  });

  const [validateFacts, { loading: validating }] = useMutation(VALIDATE_FACTS, {
    onCompleted: () => { setSelectedFacts(new Set()); refetchStats(); refetchReview(); }
  });

  const [expireFact] = useMutation(EXPIRE_FACT, {
    onCompleted: () => { refetchStats(); refetchReview(); refetchTemporal(); }
  });

  const stats = statsData?.getFreshnessStats;
  const factsNeedingReview = reviewData?.getFactsNeedingReview || [];
  const temporallyOutdated = temporalData?.getTemporallyOutdatedFacts || [];

  const handleToggleFact = (factId) => {
    setSelectedFacts(prev => {
      const next = new Set(prev);
      next.has(factId) ? next.delete(factId) : next.add(factId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedFacts(selectedFacts.size === factsNeedingReview.length ? new Set() : new Set(factsNeedingReview.map(f => f.id)));
  };

  const handleValidateSelected = () => {
    if (selectedFacts.size > 0) validateFacts({ variables: { factIds: Array.from(selectedFacts) } });
  };

  const handleExpire = (factId) => {
    if (window.confirm('Expire this fact? It will no longer be used in queries.')) {
      expireFact({ variables: { factId } });
    }
  };

  const getHealthColor = (score) => score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

  return (
    <div className="freshness-dashboard">
      <header className="freshness-header">
        <div className="header-content">
          <h2>Knowledge Freshness</h2>
          <p className="header-subtitle">Monitor and maintain the accuracy of your knowledge base</p>
        </div>
        <div className="header-actions">
          <button className="action-btn secondary" onClick={() => markStale({ variables: { teamId, staleThresholdDays: 90 } })} disabled={markingStale}>
            {markingStale ? 'Scanning...' : 'Scan for Stale'}
          </button>
        </div>
      </header>

      {!statsLoading && stats && (
        <div className="stats-grid">
          <div className="stat-card health">
            <div className="stat-value" style={{ color: getHealthColor(stats.healthScore) }}>{stats.healthScore}%</div>
            <div className="stat-label">Health Score</div>
          </div>
          <div className="stat-card fresh"><div className="stat-value">{stats.fresh}</div><div className="stat-label">Fresh</div></div>
          <div className="stat-card stale"><div className="stat-value">{stats.stale}</div><div className="stat-label">Stale</div></div>
          <div className="stat-card review"><div className="stat-value">{stats.needsReview}</div><div className="stat-label">Needs Review</div></div>
          <div className="stat-card expired"><div className="stat-value">{stats.expired}</div><div className="stat-label">Expired</div></div>
          <div className="stat-card total"><div className="stat-value">{stats.total}</div><div className="stat-label">Total Facts</div></div>
        </div>
      )}

      <div className="tab-nav">
        <button className={"tab-btn " + (activeTab === 'overview' ? 'active' : '')} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={"tab-btn " + (activeTab === 'review' ? 'active' : '')} onClick={() => setActiveTab('review')}>
          Needs Review {stats?.needsReview > 0 && <span className="tab-badge">{stats.needsReview}</span>}
        </button>
        <button className={"tab-btn " + (activeTab === 'temporal' ? 'active' : '')} onClick={() => setActiveTab('temporal')}>Temporal Issues</button>
      </div>

      <div className="tab-content">
        {activeTab === 'overview' && stats && (
          <div className="overview-content">
            <div className="overview-card">
              <h3>Knowledge Health Summary</h3>
              <div className="health-summary">
                <div className="health-bar">
                  <div className="health-fill fresh" style={{ width: ((stats.fresh / stats.total) * 100) + '%' }} />
                  <div className="health-fill stale" style={{ width: ((stats.stale / stats.total) * 100) + '%' }} />
                  <div className="health-fill expired" style={{ width: ((stats.expired / stats.total) * 100) + '%' }} />
                </div>
                <div className="health-legend">
                  <span className="legend-item fresh">Fresh ({stats.fresh})</span>
                  <span className="legend-item stale">Stale ({stats.stale})</span>
                  <span className="legend-item expired">Expired ({stats.expired})</span>
                </div>
                <div className="health-details">
                  <div className="detail-item"><span className="detail-label">Oldest validation:</span><span className="detail-value">{formatDate(stats.oldestValidation)}</span></div>
                  <div className="detail-item"><span className="detail-label">Older than 90 days:</span><span className="detail-value">{stats.olderThan90Days} facts</span></div>
                  <div className="detail-item"><span className="detail-label">Average confidence:</span><span className="detail-value">{stats.avgConfidence ? (stats.avgConfidence * 100).toFixed(0) + '%' : 'N/A'}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="review-content">
            <div className="bulk-actions">
              <label className="select-all">
                <input type="checkbox" checked={selectedFacts.size === factsNeedingReview.length && factsNeedingReview.length > 0} onChange={handleSelectAll} />
                Select All
              </label>
              <button className="action-btn primary" onClick={handleValidateSelected} disabled={selectedFacts.size === 0 || validating}>
                {validating ? 'Validating...' : 'Validate Selected (' + selectedFacts.size + ')'}
              </button>
            </div>
            {reviewLoading ? <div className="loading">Loading facts...</div> : factsNeedingReview.length === 0 ? (
              <div className="empty-state"><p>No facts need review at this time</p></div>
            ) : (
              <div className="facts-list">
                {factsNeedingReview.map(fact => (
                  <div key={fact.id} className={"fact-card " + (selectedFacts.has(fact.id) ? 'selected' : '')}>
                    <div className="fact-checkbox"><input type="checkbox" checked={selectedFacts.has(fact.id)} onChange={() => handleToggleFact(fact.id)} /></div>
                    <div className="fact-content">
                      <p className="fact-text">{fact.content}</p>
                      <div className="fact-meta">
                        {fact.nodeName && <span className="meta-node">{fact.nodeName}</span>}
                        {fact.category && <span className="meta-category">{fact.category}</span>}
                        <span className={"meta-status " + fact.freshnessStatus}>{fact.freshnessStatus}</span>
                        {fact.daysSinceValidation && <span className="meta-age">{fact.daysSinceValidation} days</span>}
                      </div>
                    </div>
                    <div className="fact-actions">
                      <button className="fact-action validate" onClick={() => validateFacts({ variables: { factIds: [fact.id] } })} title="Validate">V</button>
                      <button className="fact-action expire" onClick={() => handleExpire(fact.id)} title="Expire">X</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {factsNeedingReview.length >= pageSize && (
              <div className="pagination">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
                <span>Page {page + 1}</span>
                <button onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'temporal' && (
          <div className="temporal-content">
            <p className="section-description">Facts with past dates or outdated language that may need updating.</p>
            {temporalLoading ? <div className="loading">Analyzing...</div> : temporallyOutdated.length === 0 ? (
              <div className="empty-state"><p>No temporally outdated facts detected</p></div>
            ) : (
              <div className="facts-list">
                {temporallyOutdated.map(fact => (
                  <div key={fact.id} className="fact-card temporal">
                    <div className="fact-content">
                      <p className="fact-text">{fact.content}</p>
                      <div className="fact-meta">
                        {fact.nodeName && <span className="meta-node">{fact.nodeName}</span>}
                        {fact.pastYearsReferenced?.length > 0 && <span className="meta-years">Refs: {fact.pastYearsReferenced.join(', ')}</span>}
                        {fact.hasPastTenseWords && <span className="meta-tense">Past tense</span>}
                      </div>
                    </div>
                    <div className="fact-actions">
                      <button className="fact-action validate" onClick={() => validateFacts({ variables: { factIds: [fact.id] } })}>V</button>
                      <button className="fact-action expire" onClick={() => handleExpire(fact.id)}>X</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FreshnessDashboard;
