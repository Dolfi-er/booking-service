const STATES = {
  IDLE: 'IDLE',
  ROOM_RESERVED: 'ROOM_RESERVED',
  ATTENDEES_NOTIFIED: 'ATTENDEES_NOTIFIED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
};

// Set CONFIRM_FAIL_RATE=1 environment variable to always trigger compensation in tests.
const getFailRate = () => parseFloat(process.env.CONFIRM_FAIL_RATE || '0');

class InvalidTransitionError extends Error {
  constructor(msg) { super(msg); this.name = 'InvalidTransitionError'; }
}

class StepFailureError extends Error {
  constructor(msg) { super(msg); this.name = 'StepFailureError'; }
}

// Each handler returns { nextState, stepData } or throws.
const handlers = {
  reserve(booking, payload) {
    if (booking.state !== STATES.IDLE)
      throw new InvalidTransitionError(`Cannot reserve from "${booking.state}"`);
    return {
      nextState: STATES.ROOM_RESERVED,
      stepData: { room: payload.room, requestedBy: payload.requestedBy ?? null },
    };
  },

  notify(booking, payload) {
    if (booking.state !== STATES.ROOM_RESERVED)
      throw new InvalidTransitionError(`Cannot notify from "${booking.state}"`);
    return {
      nextState: STATES.ATTENDEES_NOTIFIED,
      stepData: { attendees: payload.attendees },
    };
  },

  confirm(booking) {
    if (booking.state !== STATES.ATTENDEES_NOTIFIED)
      throw new InvalidTransitionError(`Cannot confirm from "${booking.state}"`);
    if (Math.random() < getFailRate())
      throw new StepFailureError('Confirm step failed (simulated)');
    return {
      nextState: STATES.CONFIRMED,
      stepData: { confirmedAt: new Date().toISOString() },
    };
  },

  compensate(_booking) {
    return {
      nextState: STATES.CANCELLED,
      stepData: { reason: 'Compensation after confirm failure' },
    };
  },

  cancel(booking) {
    const allowed = [STATES.ROOM_RESERVED, STATES.ATTENDEES_NOTIFIED];
    if (!allowed.includes(booking.state))
      throw new InvalidTransitionError(`Cannot cancel from "${booking.state}"`);
    return {
      nextState: STATES.CANCELLED,
      stepData: { reason: 'Manual cancellation' },
    };
  },
};

function applyTransition(booking, action, payload = {}) {
  const handler = handlers[action];
  if (!handler) throw new InvalidTransitionError(`Unknown action "${action}"`);
  return handler(booking, payload);
}

module.exports = { STATES, applyTransition, InvalidTransitionError, StepFailureError };