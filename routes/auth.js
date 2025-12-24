const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// Access DB from `req.app.locals.db` inside handlers

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // If user exists in DB, verify with bcrypt
  if (user) {
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      // allow environment-admin fallback if configured
      if (process.env.ADMIN_USER && process.env.ADMIN_PASS && username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        req.session.user = { id: user.id, username: username, is_admin: true };
        return res.redirect('/admin');
      }
      return res.render('login', { error: 'Invalid credentials' });
    }
    req.session.user = { id: user.id, username: user.username, is_admin: !!user.is_admin };
    return res.redirect('/admin');
  }

  // If no DB user, allow admin login via env vars (convenience fallback)
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS && username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.user = { id: 0, username: username, is_admin: true };
    return res.redirect('/admin');
  }
  return res.render('login', { error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// route to create an initial admin (unsafe, one-time use) - remove in production
router.get('/create-admin', async (req, res) => {
  const db = req.app.locals.db;
  const exists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (exists) return res.send('Admin already exists');
  const hash = await bcrypt.hash('admin123', 10);
  db.prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)').run('admin', hash);
  res.send('Admin created: username "admin" password "admin123" — change immediately');
});

module.exports = router;
