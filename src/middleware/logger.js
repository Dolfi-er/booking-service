function log(level, message, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields }));
}

module.exports = {
  info:  (msg, fields) => log('INFO',  msg, fields),
  warn:  (msg, fields) => log('WARN',  msg, fields),
  error: (msg, fields) => log('ERROR', msg, fields),
};