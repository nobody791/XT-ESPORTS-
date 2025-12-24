const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads', 'images')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/auth/login');
  next();
}

router.get('/', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY id DESC').all();
  res.render('admin/dashboard', { tournaments });
});

router.get('/tournaments', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const tournaments = db.prepare('SELECT * FROM tournaments').all();
  // read settings
  const getSetting = (k) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
    return row ? row.value : null;
  };
  const settings = { upi: getSetting('upi'), payment_qr: getSetting('payment_qr'), site_banner: getSetting('site_banner') };
  res.render('admin/tournaments', { tournaments, errors: null, settings });
});

router.post('/tournaments', requireAdmin, upload.single('banner'), (req, res) => {
  const db = req.app.locals.db;
  const banner = req.file ? `/uploads/images/${req.file.filename}` : null;
  db.prepare('INSERT INTO tournaments (name, game, entry_fee, max_teams, details, banner) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.body.name, req.body.game, parseInt(req.body.entry_fee || 0), parseInt(req.body.max_teams || 0), req.body.details || '', banner);
  res.redirect('/admin/tournaments');
});

// Save site settings: payment QR, upi, site banner
router.post('/settings', requireAdmin, upload.fields([{ name: 'payment_qr' }, { name: 'site_banner' }]), (req, res) => {
  const db = req.app.locals.db;
  const upi = req.body.upi || '';
  if (upi) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('upi', upi);
  if (req.files && req.files.payment_qr && req.files.payment_qr[0]) {
    const file = req.files.payment_qr[0];
    const pathVal = `/uploads/images/${file.filename}`;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('payment_qr', pathVal);
  }
  if (req.files && req.files.site_banner && req.files.site_banner[0]) {
    const file = req.files.site_banner[0];
    const pathVal = `/uploads/images/${file.filename}`;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('site_banner', pathVal);
  }
  res.redirect('/admin/tournaments');
});

// Participants list and verification
router.get('/participants', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const participants = db.prepare(`SELECT p.*, t.name as tournament_name FROM participants p LEFT JOIN tournaments t ON p.tournament_id = t.id ORDER BY p.created_at DESC`).all();
  res.render('admin/participants', { participants });
});

router.post('/participants/:id/verify', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const id = req.params.id;
  db.prepare('UPDATE participants SET paid = 1 WHERE id = ?').run(id);
  db.prepare('UPDATE payments SET status = ? WHERE participant_id = ?').run('confirmed', id);
  res.redirect('/admin/participants');
});

router.get('/users', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT id, username, is_admin FROM users').all();
  res.render('admin/users', { users });
});

router.get('/uploads', requireAdmin, (req, res) => {
  const fs = require('fs');
  const uploadDir = path.join(__dirname, '..', 'uploads', 'images');
  const files = fs.readdirSync(uploadDir).map(f => ({ path: `/uploads/images/${f}`, name: f }));
  res.json(files);
});

module.exports = router;
