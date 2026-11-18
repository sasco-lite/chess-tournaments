const express = require('express');
const path = require('node:path');
const db = require('./lib/db');
const adminRouter = require('./admin');
const registrationRouter = require('./registration');
const resultRouter = require('./result');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Static assets & local vendor bundles
app.use('/assets/images', express.static(path.join(__dirname, 'src', 'assets', 'images')));
app.use(
  '/vendor/lucide.min.js',
  express.static(path.join(__dirname, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'))
);
app.use(express.static(path.join(__dirname, 'public')));

// API Routers
app.use('/api/admin', adminRouter);
app.use('/api/registration', registrationRouter);
app.use('/api/result', resultRouter);

app.get('/api/health', async (_req, res) => {
  const status = await db.getDbStatus();
  res.json({ ok: true, db: status, node: process.version });
});

// Clean Page Routes
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/registration', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registration.html'));
});

app.get('/result', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Express 5 catch-all 404 / SPA fallback
app.all(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found.' });
  }
  return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Grandmaster Arena server listening on http://localhost:${PORT} (Node ${process.version})`);
  });
}

module.exports = app;
