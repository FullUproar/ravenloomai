/**
 * CalendarView - Calendar component with Month, Week, and Work-Week views
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import EventModal from './EventModal';
import './CalendarView.css';

const GET_CALENDAR_ITEMS = gql`
  query GetCalendarItems($teamId: ID!, $startDate: DateTime!, $endDate: DateTime!) {
    getCalendarItems(teamId: $teamId, startDate: $startDate, endDate: $endDate) {
      events {
        id
        title
        description
        location
        startAt
        endAt
        isAllDay
        color
        taskId
        projectId
        googleEventId
        syncStatus
        createdByUser {
          id
          displayName
        }
      }
      tasksDue {
        id
        title
        status
        priority
        dueAt
        projectId
        project {
          id
          name
          color
        }
      }
    }
  }
`;

const IMPORT_FROM_GOOGLE = gql`
  mutation ImportCalendarFromGoogle($teamId: ID!, $calendarId: String, $daysBack: Int, $daysForward: Int) {
    importCalendarFromGoogle(teamId: $teamId, calendarId: $calendarId, daysBack: $daysBack, daysForward: $daysForward) {
      id
      title
      startAt
      endAt
    }
  }
`;

const CREATE_EVENT = gql`
  mutation CreateEvent($teamId: ID!, $input: CreateEventInput!) {
    createEvent(teamId: $teamId, input: $input) {
      id
      title
      startAt
      endAt
      isAllDay
      color
    }
  }
`;

const UPDATE_EVENT = gql`
  mutation UpdateEvent($eventId: ID!, $input: UpdateEventInput!) {
    updateEvent(eventId: $eventId, input: $input) {
      id
      title
      startAt
      endAt
      isAllDay
      color
    }
  }
`;

const DELETE_EVENT = gql`
  mutation DeleteEvent($eventId: ID!) {
    deleteEvent(eventId: $eventId)
  }
`;

// Helper functions
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const formatTime = (date) => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};
const isSameDay = (d1, d2) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

export default function CalendarView({ teamId }) {
  const [viewMode, setViewMode] = useState('month'); // month, week, work-week
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventDate, setNewEventDate] = useState(null);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'month') {
      // Get full weeks that overlap with the month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const start = new Date(firstDay);
      start.setDate(start.getDate() - firstDay.getDay());
      const end = new Date(lastDay);
      end.setDate(end.getDate() + (6 - lastDay.getDay()));
      return { start, end };
    } else {
      // Week view - get the week containing currentDate
      const dayOfWeek = currentDate.getDay();
      const start = new Date(currentDate);
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }, [currentDate, viewMode]);

  const { data, loading, refetch } = useQuery(GET_CALENDAR_ITEMS, {
    variables: {
      teamId,
      startDate: dateRange.start.toISOString(),
      endDate: dateRange.end.toISOString()
    },
    skip: !teamId
  });

  const [createEvent] = useMutation(CREATE_EVENT);
  const [updateEvent] = useMutation(UPDATE_EVENT);
  const [deleteEvent] = useMutation(DELETE_EVENT);
  const [importFromGoogle, { loading: importing }] = useMutation(IMPORT_FROM_GOOGLE);

  const events = data?.getCalendarItems?.events || [];
  const tasksDue = data?.getCalendarItems?.tasksDue || [];

  // Auto-sync from Google Calendar on mount and poll every 30s while tab is visible
  const isSyncing = useRef(false);

  const doGoogleSync = useCallback(async () => {
    if (!teamId || isSyncing.current) return;
    isSyncing.current = true;
    try {
      await importFromGoogle({
        variables: { teamId, daysBack: 30, daysForward: 90 }
      });
      await refetch();
    } catch (err) {
      console.log('Google sync skipped:', err.message);
    } finally {
      isSyncing.current = false;
    }
  }, [teamId, importFromGoogle, refetch]);

  useEffect(() => {
    if (!teamId) return;

    // Initial sync on mount
    doGoogleSync();

    // Poll every 30 seconds, but only when tab is visible
    const POLL_INTERVAL = 30000;
    let intervalId = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(doGoogleSync, POLL_INTERVAL);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        doGoogleSync(); // Sync immediately when tab becomes visible
        startPolling();
      }
    };

    // Start polling if tab is visible
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [teamId, doGoogleSync]);

  // Combine events and tasks for display
  const getItemsForDay = (date) => {
    const dayEvents = events.filter(event => isSameDay(event.startAt, date));
    const dayTasks = tasksDue.filter(task => isSameDay(task.dueAt, date));
    return { events: dayEvents, tasks: dayTasks };
  };

  // Import from Google Calendar
  const handleImportFromGoogle = async () => {
    try {
      await importFromGoogle({
        variables: {
          teamId,
          daysBack: 30,
          daysForward: 90
        }
      });
      await refetch();
    } catch (err) {
      console.error('Error importing from Google:', err);
    }
  };

  // Get events for a specific day
  const getEventsForDay = (date) => {
    return events.filter(event => isSameDay(event.startAt, date));
  };

  // Get events for a specific hour on a day
  const getEventsForHour = (date, hour) => {
    return events.filter(event => {
      if (event.isAllDay) return false;
      const eventDate = new Date(event.startAt);
      return isSameDay(event.startAt, date) && eventDate.getHours() === hour;
    });
  };

  // Navigation
  const goToToday = () => setCurrentDate(new Date());

  const goToPrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  // Event handlers
  const handleDayClick = (date) => {
    setNewEventDate(date);
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (event, e) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setNewEventDate(null);
    setShowEventModal(true);
  };

  const handleSaveEvent = async (eventData) => {
    try {
      if (selectedEvent) {
        await updateEvent({
          variables: {
            eventId: selectedEvent.id,
            input: eventData
          }
        });
      } else {
        await createEvent({
          variables: {
            teamId,
            input: eventData
          }
        });
      }
      await refetch();
      setShowEventModal(false);
      setSelectedEvent(null);
      setNewEventDate(null);
    } catch (err) {
      console.error('Error saving event:', err);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    try {
      await deleteEvent({ variables: { eventId: selectedEvent.id } });
      await refetch();
      setShowEventModal(false);
      setSelectedEvent(null);
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  // Generate calendar grid for month view
  const generateMonthGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getFirstDayOfMonth(year, month);

    const days = [];

    // Previous month days
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      days.push({
        date: new Date(prevYear, prevMonth, daysInPrevMonth - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next month days
    const remainingDays = 42 - days.length; // 6 rows x 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      days.push({
        date: new Date(nextYear, nextMonth, i),
        isCurrentMonth: false
      });
    }

    return days;
  };

  // Generate week grid
  const generateWeekGrid = () => {
    const days = [];
    const start = new Date(dateRange.start);

    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      days.push({
        date,
        dayName: DAYS[date.getDay()],
        isToday: isSameDay(date, new Date())
      });
    }

    return viewMode === 'work-week' ? days.slice(1, 6) : days;
  };

  const today = new Date();

  return (
    <div className="calendar-view">
      {/* Header */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="btn btn-secondary" onClick={goToToday}>Today</button>
          <button className="btn btn-icon" onClick={goToPrev}>&lt;</button>
          <button className="btn btn-icon" onClick={goToNext}>&gt;</button>
          <h2 className="calendar-title">
            {viewMode === 'month'
              ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : `Week of ${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
          </h2>
        </div>
        <div className="calendar-actions">
          <button
            className="btn btn-secondary"
            onClick={handleImportFromGoogle}
            disabled={importing}
          >
            {importing ? 'Syncing...' : 'Sync from Google'}
          </button>
        </div>
        <div className="calendar-view-toggle">
          <button
            className={`btn ${viewMode === 'work-week' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('work-week')}
          >
            Work Week
          </button>
          <button
            className={`btn ${viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('week')}
          >
            Week
          </button>
          <button
            className={`btn ${viewMode === 'month' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('month')}
          >
            Month
          </button>
        </div>
      </div>

      {loading && <div className="calendar-loading">Loading events...</div>}

      {/* Month View */}
      {viewMode === 'month' && (
        <div className="calendar-month">
          <div className="calendar-weekdays">
            {DAYS.map(day => (
              <div key={day} className="calendar-weekday">{day}</div>
            ))}
          </div>
          <div className="calendar-days">
            {generateMonthGrid().map(({ date, isCurrentMonth }, index) => {
              const { events: dayEvents, tasks: dayTasks } = getItemsForDay(date);
              const isToday = isSameDay(date, today);
              const totalItems = dayEvents.length + dayTasks.length;

              return (
                <div
                  key={index}
                  className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => handleDayClick(date)}
                >
                  <span className="day-number">{date.getDate()}</span>
                  <div className="day-events">
                    {/* Show events */}
                    {dayEvents.slice(0, 2).map(event => (
                      <div
                        key={event.id}
                        className="event-chip"
                        style={{ backgroundColor: event.color || '#3B82F6' }}
                        onClick={(e) => handleEventClick(event, e)}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {/* Show task due dates */}
                    {dayTasks.slice(0, dayEvents.length >= 2 ? 1 : 2).map(task => (
                      <div
                        key={`task-${task.id}`}
                        className="event-chip task-chip"
                        style={{ backgroundColor: task.project?.color || '#F59E0B' }}
                        title={`Task due: ${task.title}`}
                      >
                        <span className="task-icon">✓</span> {task.title}
                      </div>
                    ))}
                    {totalItems > 3 && (
                      <div className="more-events">+{totalItems - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week / Work-Week View */}
      {(viewMode === 'week' || viewMode === 'work-week') && (
        <div className="calendar-week">
          <div className="week-header">
            <div className="time-column-header"></div>
            {generateWeekGrid().map(({ date, dayName, isToday }) => (
              <div key={date.toISOString()} className={`week-day-header ${isToday ? 'today' : ''}`}>
                <span className="week-day-name">{dayName}</span>
                <span className="week-day-date">{date.getDate()}</span>
              </div>
            ))}
          </div>

          {/* All-day events and task due dates row */}
          <div className="week-allday-row">
            <div className="time-label">All day</div>
            {generateWeekGrid().map(({ date }) => {
              const allDayEvents = events.filter(e => e.isAllDay && isSameDay(e.startAt, date));
              const dayTasks = tasksDue.filter(task => isSameDay(task.dueAt, date));
              return (
                <div key={date.toISOString()} className="week-allday-cell" onClick={() => handleDayClick(date)}>
                  {allDayEvents.map(event => (
                    <div
                      key={event.id}
                      className="event-chip allday"
                      style={{ backgroundColor: event.color || '#3B82F6' }}
                      onClick={(e) => handleEventClick(event, e)}
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayTasks.map(task => (
                    <div
                      key={`task-${task.id}`}
                      className="event-chip allday task-chip"
                      style={{ backgroundColor: task.project?.color || '#F59E0B' }}
                      title={`Task due: ${task.title}`}
                    >
                      <span className="task-icon">✓</span> {task.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="week-grid">
            {HOURS.map(hour => (
              <div key={hour} className="week-row">
                <div className="time-label">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                {generateWeekGrid().map(({ date }) => {
                  const hourEvents = getEventsForHour(date, hour);
                  return (
                    <div
                      key={`${date.toISOString()}-${hour}`}
                      className="week-cell"
                      onClick={() => {
                        const clickDate = new Date(date);
                        clickDate.setHours(hour, 0, 0, 0);
                        handleDayClick(clickDate);
                      }}
                    >
                      {hourEvents.map(event => (
                        <div
                          key={event.id}
                          className="event-block"
                          style={{ backgroundColor: event.color || '#3B82F6' }}
                          onClick={(e) => handleEventClick(event, e)}
                        >
                          <span className="event-time">{formatTime(event.startAt)}</span>
                          <span className="event-title">{event.title}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <EventModal
          event={selectedEvent}
          initialDate={newEventDate}
          onSave={handleSaveEvent}
          onDelete={selectedEvent ? handleDeleteEvent : null}
          onClose={() => {
            setShowEventModal(false);
            setSelectedEvent(null);
            setNewEventDate(null);
          }}
        />
      )}
    </div>
  );
}
