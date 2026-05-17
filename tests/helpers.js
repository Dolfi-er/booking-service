const supertest = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();
const request = supertest(app);

module.exports = { request };