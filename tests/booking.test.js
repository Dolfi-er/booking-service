const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('./helpers');
const store   = require('../src/services/store');
const metrics = require('../src/services/metrics');

beforeEach(() => {
  store.clear();
  metrics.reset();
  process.env.CONFIRM_FAIL_RATE = '0';
});

// ── Helpers ────────────────────────────────────────────────────────────────
const reserve = (key, body = {}) =>
  request.post(`/bookings/${key}/reserve`).send({ room: 'A1', ...body });

const notify = (key) =>
  request.post(`/bookings/${key}/notify`).send({ attendees: ['Bob'] });

const confirm = (key) =>
  request.post(`/bookings/${key}/confirm`);

async function fullyBook(key) {
  await reserve(key);
  await notify(key);
  return confirm(key);
}

// ── Reserve ────────────────────────────────────────────────────────────────
describe('POST /bookings/:key/reserve', () => {
  it('creates a booking and returns ROOM_RESERVED', async () => {
    const res = await reserve('p1');
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'ROOM_RESERVED');
    assert.equal(res.body.processKey, 'p1');
  });

  it('returns 400 when room is missing', async () => {
    const res = await request.post('/bookings/p1/reserve').send({});
    assert.equal(res.status, 400);
  });

  it('echoes X-Correlation-ID header', async () => {
    const res = await reserve('p1').set('X-Correlation-ID', 'corr-xyz');
    assert.equal(res.headers['x-correlation-id'], 'corr-xyz');
  });
});

// ── Notify ────────────────────────────────────────────────────────────────
describe('POST /bookings/:key/notify', () => {
  it('moves to ATTENDEES_NOTIFIED after reserve', async () => {
    await reserve('p1');
    const res = await notify('p1');
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'ATTENDEES_NOTIFIED');
  });

  it('returns 404 when booking does not exist', async () => {
    const res = await notify('ghost');
    assert.equal(res.status, 404);
  });

  it('returns 400 when attendees field is missing', async () => {
    await reserve('p1');
    const res = await request.post('/bookings/p1/notify').send({});
    assert.equal(res.status, 400);
  });
});

// ── Confirm ────────────────────────────────────────────────────────────────
describe('POST /bookings/:key/confirm', () => {
  it('reaches CONFIRMED after all three steps', async () => {
    const res = await fullyBook('p1');
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'CONFIRMED');
  });

  it('returns 409 when confirming from wrong state (ROOM_RESERVED)', async () => {
    await reserve('p1');
    const res = await confirm('p1');
    assert.equal(res.status, 409);
  });

  it('compensation: confirm failure moves booking to CANCELLED', async () => {
    process.env.CONFIRM_FAIL_RATE = '1';
    await reserve('p1');
    await notify('p1');
    const res = await confirm('p1');
    assert.equal(res.status, 500);
    assert.equal(res.body.state, 'CANCELLED');
  });
});

// ── Cancel ─────────────────────────────────────────────────────────────────
describe('POST /bookings/:key/cancel', () => {
  it('cancels a ROOM_RESERVED booking', async () => {
    await reserve('p1');
    const res = await request.post('/bookings/p1/cancel');
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'CANCELLED');
  });

  it('returns 409 when cancelling a CONFIRMED booking', async () => {
    await fullyBook('p1');
    const res = await request.post('/bookings/p1/cancel');
    assert.equal(res.status, 409);
  });
});

// ── GET state ──────────────────────────────────────────────────────────────
describe('GET /bookings/:key', () => {
  it('returns current booking state', async () => {
    await reserve('p1');
    const res = await request.get('/bookings/p1');
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'ROOM_RESERVED');
  });

  it('returns 404 for unknown processKey', async () => {
    const res = await request.get('/bookings/ghost');
    assert.equal(res.status, 404);
  });
});

// ── Idempotency ────────────────────────────────────────────────────────────
describe('Idempotency', () => {
  it('duplicate delivery with same key is ignored and marked duplicate', async () => {
    await reserve('p1').set('X-Idempotency-Key', 'idem-1');
    await notify('p1'); // advance state

    const dup = await reserve('p1').set('X-Idempotency-Key', 'idem-1');
    assert.equal(dup.status, 200);
    assert.equal(dup.body.duplicate, true);
    assert.equal(dup.body.state, 'ROOM_RESERVED'); // cached, not current
  });

  it('different idempotency keys are treated as different events', async () => {
    await reserve('p1').set('X-Idempotency-Key', 'key-1');
    const res = await reserve('p1').set('X-Idempotency-Key', 'key-2');
    assert.equal(res.status, 409); // already reserved
  });
});
