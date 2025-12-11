/**
 * Time Blocks View - Focus Time Scheduling
 * Shows scheduled blocks of focused work time
 *
 * Can be removed by deleting this file and removing imports from TeamDashboard
 */

import { gql, useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';

const GET_MY_TIME_BLOCKS = gql`
  query GetMyTimeBlocks($teamId: ID!, $startDate: String!, $endDate: String!) {
    getMyTimeBlocks(teamId: $teamId, startDate: $startDate, endDate: $endDate) {
      id
      title
      startTime
      endTime
      status
      focusScore
      task {
        id
        title
      }
    }
  }
`;

const CREATE_TIME_BLOCK = gql`
  mutation CreateTimeBlock($teamId: ID!, $input: TimeBlockInput!) {
    createTimeBlock(teamId: $teamId, input: $input) {
      id
      title
      startTime
      endTime
      status
    }
  }
`;

const START_TIME_BLOCK = gql`
  mutation StartTimeBlock($blockId: ID!) {
    startTimeBlock(blockId: $blockId) {
      id
      status
    }
  }
`;

const COMPLETE_TIME_BLOCK = gql`
  mutation CompleteTimeBlock($blockId: ID!, $focusScore: Int, $notes: String) {
    completeTimeBlock(blockId: $blockId, focusScore: $focusScore, notes: $notes) {
      id
      status
      focusScore
    }
  }
`;

function TimeBlocks({ teamId, onClose }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Get start and end of day
  const startOfDay = new Date(currentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(currentDate);
  endOfDay.setHours(23, 59, 59, 999);

  const { data, loading, error, refetch } = useQuery(GET_MY_TIME_BLOCKS, {
    variables: {
      teamId,
      startDate: startOfDay.toISOString(),
      endDate: endOfDay.toISOString()
    },
    fetchPolicy: 'cache-and-network'
  });

  const [startTimeBlock] = useMutation(START_TIME_BLOCK);
  const [completeTimeBlock] = useMutation(COMPLETE_TIME_BLOCK);

  const blocks = data?.getMyTimeBlocks || [];

  const hours = Array.from({ length: 12 }, (_, i) => i + 7); // 7 AM to 6 PM

  const formatDate = (date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const goToPrevDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getBlockPosition = (block) => {
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);

    // Calculate position relative to 7 AM
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;

    const top = (startHour - 7) * 60; // 60px per hour
    const height = (endHour - startHour) * 60;

    return { top: `${top}px`, height: `${Math.max(height, 30)}px` };
  };

  const formatBlockTime = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  };

  const handleStartBlock = async (blockId) => {
    try {
      await startTimeBlock({ variables: { blockId } });
      refetch();
    } catch (err) {
      console.error('Error starting block:', err);
    }
  };

  const handleCompleteBlock = async (blockId) => {
    try {
      await completeTimeBlock({
        variables: { blockId, focusScore: 8 } // Default focus score
      });
      refetch();
    } catch (err) {
      console.error('Error completing block:', err);
    }
  };

  if (loading && blocks.length === 0) {
    return (
      <main className="timeblocks-area">
        <header className="timeblocks-header">
          <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
            <span></span><span></span><span></span>
          </button>
          <h3>Time Blocks</h3>
        </header>
        <div className="timeblocks-content">
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading time blocks...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="timeblocks-area">
      <header className="timeblocks-header">
        <button className="mobile-menu-btn" onClick={onClose} aria-label="Close">
          <span></span><span></span><span></span>
        </button>
        <h3>Time Blocks</h3>
        <div className="timeblocks-controls">
          <button className="timeblocks-nav-btn" onClick={goToPrevDay}>←</button>
          <button className="timeblocks-date" onClick={goToToday}>
            {formatDate(currentDate)}
          </button>
          <button className="timeblocks-nav-btn" onClick={goToNextDay}>→</button>
        </div>
        <div className="header-spacer"></div>
      </header>

      <div className="timeblocks-content">
        {error ? (
          <div className="error-screen">
            <p>Error loading time blocks: {error.message}</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="timeblocks-empty">
            <div className="timeblocks-empty-icon">📅</div>
            <h4>No time blocks for {formatDate(currentDate)}</h4>
            <p>Schedule focused work time by creating a time block</p>
          </div>
        ) : (
          <div className="timeblocks-calendar">
            <div className="timeblocks-timeline">
              {hours.map((hour) => (
                <div key={hour} className="timeline-hour">
                  {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                </div>
              ))}
            </div>
            <div className="timeblocks-day">
              {blocks.map((block) => {
                const position = getBlockPosition(block);
                return (
                  <div
                    key={block.id}
                    className={`timeblock-slot ${block.status}`}
                    style={position}
                    onClick={() => {
                      if (block.status === 'scheduled') handleStartBlock(block.id);
                      else if (block.status === 'in_progress') handleCompleteBlock(block.id);
                    }}
                  >
                    <div className="timeblock-title">
                      {block.title || block.task?.title || 'Focus Time'}
                    </div>
                    <div className="timeblock-time">
                      {formatBlockTime(block.startTime, block.endTime)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default TimeBlocks;
