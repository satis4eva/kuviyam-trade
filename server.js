'use strict';
const http = require('node:http');
const { open } = require('./src/db');
const { seedDemo } = require('./src/seed');
const { createApp } = require('./src/app');

const db = open();
if (process.env.SEED_DEMO === '1' && seedDemo(db)) console.log('Seeded demo data.');

const server = http.createServer(createApp(db));
server.requestTimeout = 60_000;
const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`Trade Hub running on port ${port}`));

const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
