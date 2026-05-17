const bookings = new Map();         // processKey → { state, data, createdAt }
const idempotencyCache = new Map(); // `${processKey}:${idempKey}` → cached response

function getBooking(processKey) {
  return bookings.get(processKey) ?? null;
}

function setBooking(processKey, booking) {
  bookings.set(processKey, booking);
}

function getCachedResponse(processKey, idempKey) {
  return idempotencyCache.get(`${processKey}:${idempKey}`) ?? null;
}

function setCachedResponse(processKey, idempKey, response) {
  idempotencyCache.set(`${processKey}:${idempKey}`, response);
}

function clear() {
  bookings.clear();
  idempotencyCache.clear();
}

module.exports = { getBooking, setBooking, getCachedResponse, setCachedResponse, clear };