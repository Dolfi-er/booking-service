const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  STATES, applyTransition, InvalidTransitionError, StepFailureError,
} = require('../src/services/stateMachine');

const idle      = () => ({ state: STATES.IDLE,                data: {} });
const reserved  = () => ({ state: STATES.ROOM_RESERVED,       data: {} });
const notified  = () => ({ state: STATES.ATTENDEES_NOTIFIED,  data: {} });
const confirmed = () => ({ state: STATES.CONFIRMED,           data: {} });

// Restore env after each group
before(() => { process.env.CONFIRM_FAIL_RATE = '0'; });
after(()  => { process.env.CONFIRM_FAIL_RATE = '0'; });

describe('State machine — happy path', () => {
  it('IDLE → ROOM_RESERVED on reserve', () => {
    const { nextState } = applyTransition(idle(), 'reserve', { room: 'A1' });
    assert.equal(nextState, STATES.ROOM_RESERVED);
  });

  it('stepData contains room and requestedBy', () => {
    const { stepData } = applyTransition(idle(), 'reserve', { room: 'B2', requestedBy: 'Alice' });
    assert.equal(stepData.room, 'B2');
    assert.equal(stepData.requestedBy, 'Alice');
  });

  it('ROOM_RESERVED → ATTENDEES_NOTIFIED on notify', () => {
    const { nextState } = applyTransition(reserved(), 'notify', { attendees: ['Bob'] });
    assert.equal(nextState, STATES.ATTENDEES_NOTIFIED);
  });

  it('stepData contains attendees', () => {
    const { stepData } = applyTransition(reserved(), 'notify', { attendees: ['Bob', 'Carol'] });
    assert.deepEqual(stepData.attendees, ['Bob', 'Carol']);
  });

  it('ATTENDEES_NOTIFIED → CONFIRMED on confirm (no failures)', () => {
    process.env.CONFIRM_FAIL_RATE = '0';
    const { nextState } = applyTransition(notified(), 'confirm', {});
    assert.equal(nextState, STATES.CONFIRMED);
  });
});

describe('State machine — compensation', () => {
  it('confirm with fail rate 1 throws StepFailureError', () => {
    process.env.CONFIRM_FAIL_RATE = '1';
    assert.throws(
      () => applyTransition(notified(), 'confirm', {}),
      StepFailureError,
    );
    process.env.CONFIRM_FAIL_RATE = '0';
  });

  it('compensate moves booking to CANCELLED', () => {
    const { nextState } = applyTransition(notified(), 'compensate', {});
    assert.equal(nextState, STATES.CANCELLED);
  });

  it('compensate stepData has a reason field', () => {
    const { stepData } = applyTransition(notified(), 'compensate', {});
    assert.ok(stepData.reason, 'stepData.reason should be set');
  });
});

describe('State machine — manual cancellation', () => {
  it('ROOM_RESERVED can be cancelled', () => {
    const { nextState } = applyTransition(reserved(), 'cancel', {});
    assert.equal(nextState, STATES.CANCELLED);
  });

  it('ATTENDEES_NOTIFIED can be cancelled', () => {
    const { nextState } = applyTransition(notified(), 'cancel', {});
    assert.equal(nextState, STATES.CANCELLED);
  });

  it('CONFIRMED cannot be cancelled', () => {
    assert.throws(() => applyTransition(confirmed(), 'cancel', {}), InvalidTransitionError);
  });

  it('IDLE cannot be cancelled', () => {
    assert.throws(() => applyTransition(idle(), 'cancel', {}), InvalidTransitionError);
  });
});

describe('State machine — invalid transitions', () => {
  it('cannot reserve from ROOM_RESERVED', () => {
    assert.throws(() => applyTransition(reserved(), 'reserve', { room: 'X' }), InvalidTransitionError);
  });

  it('cannot notify from IDLE', () => {
    assert.throws(() => applyTransition(idle(), 'notify', { attendees: [] }), InvalidTransitionError);
  });

  it('cannot confirm from ROOM_RESERVED', () => {
    assert.throws(() => applyTransition(reserved(), 'confirm', {}), InvalidTransitionError);
  });

  it('unknown action throws InvalidTransitionError', () => {
    assert.throws(() => applyTransition(idle(), 'launch_rocket', {}), InvalidTransitionError);
  });
});