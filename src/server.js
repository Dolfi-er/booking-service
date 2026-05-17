const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(), level: 'INFO',
    message: `Booking service listening on port ${PORT}`,
  }));
});