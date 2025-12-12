/**
 * DigestPage - Priority-ordered user digest / landing page
 *
 * Shows the user exactly what they need to know, sorted by priority:
 * 1. Unread messages
 * 2. Events today
 * 3. Tasks due today
 * 4. Updated items (projects, goals, tasks)
 * 5. Events tomorrow
 * 6. Tasks due 1-7 days
 *
 * Features TOP 3 items prominently, with drill-down to see more.
 */

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState, useEffect } from 'react';
import './DigestPage.css';

const GET_USER_DIGEST = gql`
  query GetUserDigest($teamId: ID!) {
    getUserDigest(teamId: $teamId) {
      briefing {
        briefing
        cached
        generatedAt
      }
      items {
        priority
        type
        sortKey
        channel {
          id
          name
          channelType
        }
        event {
          id
          title
          description
          location
          startAt
          endAt
          isAllDay
        }
        task {
          id
          title
          status
          priority
          dueAt
          isBlocked
          blockedReason
          blockedAt
          blockedByUser {
            displayName
          }
          project {
            id
            name
          }
          assignedToUser {
            id
            displayName
          }
        }
        goal {
          id
          title
          status
          progress
        }
        project {
          id
          name
          status
        }
        spotlight {
          id
          itemType
          itemTitle
          customTitle
          customDescription
          setByName
        }
        focusItem {
          id
          itemType
          itemId
          itemTitle
          itemStatus
          focusOrder
        }
        unreadCount
        latestMessage {
          content
          userId
        }
      }
      top3 {
        priority
        type
        sortKey
        channel {
          id
          name
          channelType
        }
        event {
          id
          title
          description
          location
          startAt
          endAt
          isAllDay
        }
        task {
          id
          title
          status
          priority
          dueAt
          isBlocked
          blockedReason
          blockedAt
          blockedByUser {
            displayName
          }
          project {
            id
            name
          }
          assignedToUser {
            id
            displayName
          }
        }
        goal {
          id
          title
          status
          progress
        }
        project {
          id
          name
          status
        }
        spotlight {
          id
          itemType
          itemTitle
          customTitle
          customDescription
          setByName
        }
        focusItem {
          id
          itemType
          itemId
          itemTitle
          itemStatus
          focusOrder
        }
        unreadCount
        latestMessage {
          content
          userId
        }
      }
      totalCount
      hasMore
    }
  }
`;

const MARK_DIGEST_VIEWED = gql`
  mutation MarkDigestViewed($teamId: ID!) {
    markDigestViewed(teamId: $teamId)
  }
`;

const MARK_CHANNEL_SEEN = gql`
  mutation MarkChannelSeen($channelId: ID!) {
    markChannelSeen(channelId: $channelId)
  }
`;

const MARK_ITEM_VIEWED = gql`
  mutation MarkDigestItemViewed($itemType: String!, $itemId: ID!) {
    markDigestItemViewed(itemType: $itemType, itemId: $itemId)
  }
`;

const REGENERATE_BRIEFING = gql`
  mutation RegenerateDigestBriefing($teamId: ID!) {
    regenerateDigestBriefing(teamId: $teamId) {
      briefing
      cached
      generatedAt
    }
  }
`;

function DigestPage({ teamId, onNavigateToChannel, onNavigateToTask, onNavigateToGoal, onNavigateToProject, onNavigateToCalendar }) {
  const [showAll, setShowAll] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const { data, loading, error, refetch } = useQuery(GET_USER_DIGEST, {
    variables: { teamId },
    fetchPolicy: 'cache-and-network',
    pollInterval: 60000 // Refresh every minute
  });

  const [markDigestViewed] = useMutation(MARK_DIGEST_VIEWED);
  const [markChannelSeen] = useMutation(MARK_CHANNEL_SEEN);
  const [markItemViewed] = useMutation(MARK_ITEM_VIEWED);
  const [regenerateBriefing] = useMutation(REGENERATE_BRIEFING);

  // Mark digest as viewed when component mounts
  useEffect(() => {
    if (teamId) {
      markDigestViewed({ variables: { teamId } }).catch(console.error);
    }
  }, [teamId, markDigestViewed]);

  // Refresh when window gains focus
  useEffect(() => {
    const handleFocus = () => refetch();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  const digest = data?.getUserDigest;
  const briefing = digest?.briefing;
  const top3 = digest?.top3 || [];
  const allItems = digest?.items || [];
  const moreItems = showAll ? allItems.slice(3) : allItems.slice(3, 8);

  const handleRegenerateBriefing = async () => {
    if (briefingLoading) return;
    setBriefingLoading(true);
    try {
      await regenerateBriefing({
        variables: { teamId },
        update: (cache, { data: mutationData }) => {
          // Update the cache with the new briefing
          const existingData = cache.readQuery({
            query: GET_USER_DIGEST,
            variables: { teamId }
          });
          if (existingData && mutationData?.regenerateDigestBriefing) {
            cache.writeQuery({
              query: GET_USER_DIGEST,
              variables: { teamId },
              data: {
                getUserDigest: {
                  ...existingData.getUserDigest,
                  briefing: mutationData.regenerateDigestBriefing
                }
              }
            });
          }
        }
      });
    } catch (err) {
      console.error('Failed to regenerate briefing:', err);
    } finally {
      setBriefingLoading(false);
    }
  };

  const formatBriefingTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const handleItemClick = async (item) => {
    // Mark item as viewed and navigate
    if (item.type === 'unread_channel' && item.channel) {
      await markChannelSeen({ variables: { channelId: item.channel.id } });
      onNavigateToChannel?.(item.channel.id);
    } else if (item.type.includes('event') && item.event) {
      onNavigateToCalendar?.(item.event.id);
    } else if ((item.type.includes('task') || item.type === 'blocked_task') && item.task) {
      await markItemViewed({ variables: { itemType: 'task', itemId: item.task.id } });
      onNavigateToTask?.(item.task.id);
    } else if (item.type === 'updated_goal' && item.goal) {
      await markItemViewed({ variables: { itemType: 'goal', itemId: item.goal.id } });
      onNavigateToGoal?.(item.goal.id);
    } else if (item.type === 'updated_project' && item.project) {
      await markItemViewed({ variables: { itemType: 'project', itemId: item.project.id } });
      onNavigateToProject?.(item.project.id);
    } else if (item.type === 'focus_item' && item.focusItem) {
      // Navigate based on focus item type
      const { itemType, itemId } = item.focusItem;
      if (itemType === 'task') onNavigateToTask?.(itemId);
      else if (itemType === 'goal') onNavigateToGoal?.(itemId);
      else if (itemType === 'project') onNavigateToProject?.(itemId);
    } else if (item.type === 'team_spotlight' && item.spotlight) {
      // Navigate based on spotlight type
      const { itemType, itemId } = item.spotlight;
      if (itemType === 'task') onNavigateToTask?.(itemId);
      else if (itemType === 'goal') onNavigateToGoal?.(itemId);
      else if (itemType === 'project') onNavigateToProject?.(itemId);
      // custom spotlights don't navigate anywhere
    }
    refetch();
  };

  const getItemIcon = (item) => {
    switch (item.type) {
      case 'team_spotlight': return '🔦';
      case 'blocked_task': return '🚫';
      case 'focus_item': return '📌';
      case 'unread_channel': return '💬';
      case 'event_today': return '📅';
      case 'event_tomorrow': return '📆';
      case 'task_today': return '⚡';
      case 'task_week': return '📋';
      case 'updated_goal': return '🎯';
      case 'updated_project': return '📁';
      case 'updated_task': return '✏️';
      default: return '📌';
    }
  };

  const getItemTitle = (item) => {
    if (item.spotlight) return item.spotlight.itemTitle || item.spotlight.customTitle || 'Spotlight';
    if (item.focusItem) return item.focusItem.itemTitle || 'Focus Item';
    if (item.channel) return `#${item.channel.name}`;
    if (item.event) return item.event.title;
    if (item.task) return item.task.title;
    if (item.goal) return item.goal.title;
    if (item.project) return item.project.name;
    return 'Unknown item';
  };

  const getItemSubtitle = (item) => {
    if (item.type === 'team_spotlight' && item.spotlight) {
      const desc = item.spotlight.customDescription;
      const setBy = item.spotlight.setByName ? `Set by ${item.spotlight.setByName}` : '';
      return desc || setBy || 'Team priority';
    }
    if (item.type === 'blocked_task' && item.task) {
      const assignee = item.task.assignedToUser?.displayName || 'Someone';
      const reason = item.task.blockedReason;
      return reason ? `${assignee} is blocked: ${reason}` : `${assignee} is blocked`;
    }
    if (item.type === 'focus_item' && item.focusItem) {
      return `Your focus #${item.focusItem.focusOrder} - ${item.focusItem.itemType}`;
    }
    if (item.type === 'unread_channel') {
      return `${item.unreadCount} unread message${item.unreadCount !== 1 ? 's' : ''}`;
    }
    if (item.event) {
      const time = formatTime(item.event.startAt);
      const location = item.event.location ? ` - ${item.event.location}` : '';
      return `${time}${location}`;
    }
    if (item.task) {
      const dueText = item.task.dueAt ? `Due ${formatRelativeDate(item.task.dueAt)}` : '';
      const projectText = item.task.project ? item.task.project.name : '';
      return [projectText, dueText].filter(Boolean).join(' - ');
    }
    if (item.goal) {
      return `Progress: ${item.goal.progress || 0}%`;
    }
    if (item.project) {
      return `Status: ${item.project.status}`;
    }
    return '';
  };

  const getItemDetail = (item) => {
    if (item.latestMessage?.content) {
      return item.latestMessage.content;
    }
    if (item.event?.description) {
      return item.event.description;
    }
    if (item.type === 'blocked_task' && item.task?.blockedReason) {
      return item.task.blockedReason;
    }
    if (item.spotlight?.customDescription) {
      return item.spotlight.customDescription;
    }
    return null;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatRelativeDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays < 7) return `in ${diffDays} days`;
    return date.toLocaleDateString();
  };

  const getPriorityClass = (item) => {
    // New priority tiers with float values
    if (item.priority <= 0.5) return 'priority-critical';  // spotlights and blocked tasks
    if (item.priority <= 1) return 'priority-urgent';      // unread messages
    if (item.priority <= 1.5) return 'priority-high';      // focus items
    if (item.priority <= 3) return 'priority-medium';      // events and tasks today
    if (item.priority <= 4) return 'priority-normal';      // updated items
    return 'priority-low';                                 // tomorrow and week items
  };

  if (loading && !data) {
    return (
      <div className="digest-page">
        <div className="digest-loading">
          <div className="loading-spinner"></div>
          <p>Loading your digest...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="digest-page">
        <div className="digest-error">
          <p>Failed to load digest</p>
          <button onClick={() => refetch()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-page">
      <header className="digest-header">
        <h2>Your Digest</h2>
        <button className="refresh-btn" onClick={() => refetch()} title="Refresh">
          🔄
        </button>
      </header>

      {/* Raven's AI Briefing */}
      {briefing?.briefing && (
        <section className="digest-briefing">
          <div className="briefing-header">
            <span className="briefing-icon">🪶</span>
            <span className="briefing-title">Raven's Briefing</span>
            <button
              className="briefing-refresh-btn"
              onClick={handleRegenerateBriefing}
              disabled={briefingLoading}
              title="Regenerate briefing"
            >
              {briefingLoading ? '...' : '↻'}
            </button>
          </div>
          <div className="briefing-content">
            {briefing.briefing}
          </div>
          {briefing.generatedAt && (
            <span className="briefing-cached">
              {briefing.cached ? 'Cached ' : 'Generated '}{formatBriefingTime(briefing.generatedAt)}
            </span>
          )}
        </section>
      )}

      {digest?.totalCount === 0 ? (
        <div className="digest-empty">
          <div className="empty-icon">🪶</div>
          <h3>All clear for now</h3>
          <p>No urgent items need your attention. Raven will let you know when something comes up.</p>
        </div>
      ) : (
        <>
          {/* Top 3 Items - Large Cards */}
          <section className="digest-top3">
            {top3.map((item, index) => (
              <div
                key={`${item.type}-${index}`}
                className={`digest-card digest-card-large ${getPriorityClass(item)}`}
                onClick={() => handleItemClick(item)}
              >
                <div className="card-rank">{index + 1}</div>
                <div className="card-icon">{getItemIcon(item)}</div>
                <div className="card-content">
                  <h3 className="card-title">{getItemTitle(item)}</h3>
                  <p className="card-subtitle">{getItemSubtitle(item)}</p>
                  {getItemDetail(item) && (
                    <p className="card-detail">{getItemDetail(item)}</p>
                  )}
                </div>
                <div className="card-type-badge">{item.type.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </section>

          {/* More Items */}
          {allItems.length > 3 && (
            <section className="digest-more">
              <div className="more-header">
                <h3>More Items ({allItems.length - 3})</h3>
                {allItems.length > 8 && (
                  <button
                    className="show-all-btn"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Show Less' : 'Show All'}
                  </button>
                )}
              </div>
              <div className="more-list">
                {moreItems.map((item, index) => (
                  <div
                    key={`${item.type}-${index + 3}`}
                    className={`digest-item ${getPriorityClass(item)}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="item-rank">{index + 4}.</span>
                    <span className="item-icon">{getItemIcon(item)}</span>
                    <span className="item-title">{getItemTitle(item)}</span>
                    <span className="item-subtitle">{getItemSubtitle(item)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default DigestPage;
