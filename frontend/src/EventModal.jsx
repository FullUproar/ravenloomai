/**
 * EventModal - Modal for creating/editing calendar events
 */

import { useState, useEffect } from 'react';
import './EventModal.css';

const COLOR_OPTIONS = [
  { value: '#3B82F6', name: 'Blue' },
  { value: '#10B981', name: 'Green' },
  { value: '#F59E0B', name: 'Yellow' },
  { value: '#EF4444', name: 'Red' },
  { value: '#8B5CF6', name: 'Purple' },
  { value: '#EC4899', name: 'Pink' },
  { value: '#6366F1', name: 'Indigo' },
  { value: '#14B8A6', name: 'Teal' }
];

// Format date for datetime-local input
const formatDateTimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Format date for date input
const formatDateOnly = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function EventModal({ event, initialDate, onSave, onDelete, onClose }) {
  const isEditing = !!event;

  // Initialize form state
  const getInitialStartDate = () => {
    if (event?.startAt) return new Date(event.startAt);
    if (initialDate) return new Date(initialDate);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now;
  };

  const getInitialEndDate = () => {
    if (event?.endAt) return new Date(event.endAt);
    const start = getInitialStartDate();
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return end;
  };

  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [location, setLocation] = useState(event?.location || '');
  const [startAt, setStartAt] = useState(getInitialStartDate());
  const [endAt, setEndAt] = useState(getInitialEndDate());
  const [isAllDay, setIsAllDay] = useState(event?.isAllDay || false);
  const [color, setColor] = useState(event?.color || '#3B82F6');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Update end time when start time changes
  useEffect(() => {
    if (startAt >= endAt) {
      const newEnd = new Date(startAt);
      newEnd.setHours(newEnd.getHours() + 1);
      setEndAt(newEnd);
    }
  }, [startAt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        isAllDay,
        color
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal event-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Event' : 'New Event'}</h2>
          <button className="btn btn-icon" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Title */}
            <div className="form-group">
              <label htmlFor="event-title">Title *</label>
              <input
                id="event-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                autoFocus
                required
              />
            </div>

            {/* All Day Toggle */}
            <div className="form-group form-group-inline">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                />
                <span>All day event</span>
              </label>
            </div>

            {/* Date/Time */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="event-start">Start</label>
                {isAllDay ? (
                  <input
                    id="event-start"
                    type="date"
                    value={formatDateOnly(startAt)}
                    onChange={(e) => setStartAt(new Date(e.target.value + 'T00:00:00'))}
                    required
                  />
                ) : (
                  <input
                    id="event-start"
                    type="datetime-local"
                    value={formatDateTimeLocal(startAt)}
                    onChange={(e) => setStartAt(new Date(e.target.value))}
                    required
                  />
                )}
              </div>
              <div className="form-group">
                <label htmlFor="event-end">End</label>
                {isAllDay ? (
                  <input
                    id="event-end"
                    type="date"
                    value={formatDateOnly(endAt)}
                    onChange={(e) => setEndAt(new Date(e.target.value + 'T23:59:59'))}
                    required
                  />
                ) : (
                  <input
                    id="event-end"
                    type="datetime-local"
                    value={formatDateTimeLocal(endAt)}
                    onChange={(e) => setEndAt(new Date(e.target.value))}
                    required
                  />
                )}
              </div>
            </div>

            {/* Location */}
            <div className="form-group">
              <label htmlFor="event-location">Location</label>
              <input
                id="event-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
              />
            </div>

            {/* Description */}
            <div className="form-group">
              <label htmlFor="event-description">Description</label>
              <textarea
                id="event-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description"
                rows={3}
              />
            </div>

            {/* Color */}
            <div className="form-group">
              <label>Color</label>
              <div className="color-picker">
                {COLOR_OPTIONS.map(({ value, name }) => (
                  <button
                    key={value}
                    type="button"
                    className={`color-option ${color === value ? 'selected' : ''}`}
                    style={{ backgroundColor: value }}
                    onClick={() => setColor(value)}
                    title={name}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {isEditing && onDelete && (
              <button
                type="button"
                className={`btn btn-danger ${confirmDelete ? 'confirm' : ''}`}
                onClick={handleDelete}
              >
                {confirmDelete ? 'Click again to confirm' : 'Delete'}
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !title.trim()}>
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
