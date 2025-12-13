/**
 * Haptic Feedback Utility
 *
 * Provides tactile feedback on mobile devices for key interactions.
 * Falls back gracefully when Vibration API is not available.
 */

// Check if vibration is supported
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

/**
 * Trigger haptic feedback
 * @param {string} type - Type of feedback: 'light', 'medium', 'heavy', 'success', 'warning', 'error'
 */
export function haptic(type = 'light') {
  if (!canVibrate) return;

  const patterns = {
    // Simple taps
    light: 10,
    medium: 20,
    heavy: 30,

    // Feedback patterns
    success: [10, 50, 10],      // Double tap for success
    warning: [20, 100, 20],    // Longer pause for warning
    error: [50, 100, 50, 100, 50], // Triple vibration for error

    // Interactions
    tap: 10,
    swipe: 15,
    pull: [5, 10, 5],
    release: 25,
    selection: 8,
  };

  const pattern = patterns[type] || patterns.light;

  try {
    navigator.vibrate(pattern);
  } catch (e) {
    // Silently fail if vibration fails
  }
}

/**
 * Stop any ongoing vibration
 */
export function stopHaptic() {
  if (!canVibrate) return;
  try {
    navigator.vibrate(0);
  } catch (e) {
    // Silently fail
  }
}

/**
 * Check if haptic feedback is available
 */
export function isHapticAvailable() {
  return canVibrate;
}

export default {
  haptic,
  stopHaptic,
  isHapticAvailable,
};
