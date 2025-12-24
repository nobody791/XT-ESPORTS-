const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

// List tournament
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).send('Tournament not found');
  // load settings for manual payment (upi, qr)
  const settings = {};
  const upiRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('upi');
  const qrRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('payment_qr');
  const siteBanner = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_banner');
  settings.upi = upiRow ? upiRow.value : null;
  settings.payment_qr = qrRow ? qrRow.value : null;
  settings.site_banner = siteBanner ? siteBanner.value : null;
  res.render('register_' + (t.game === 'BGMI' ? 'bgmi' : 'ff'), { tournament: t, errors: null, formData: {}, settings });
});

// Registration POST for BGMI and FF (same endpoint)
router.post('/:id/register', [
  body('team_name').trim().notEmpty().withMessage('Team name is required'),
  body('leader_name').trim().notEmpty().withMessage('Leader name is required'),
  body('leader_phone').trim().isLength({ min: 6 }).withMessage('Phone required'),
  body('leader_email').trim().isEmail().withMessage('Valid email required')
], async (req, res) => {
  const db = req.app.locals.db;
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).send('Tournament not found');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const upiRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('upi');
    const qrRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('payment_qr');
    const settings = { upi: upiRow ? upiRow.value : null, payment_qr: qrRow ? qrRow.value : null };
    return res.render('register_' + (t.game === 'BGMI' ? 'bgmi' : 'ff'), { tournament: t, errors: errors.array(), formData: req.body, settings });
  }
  // Store participant
  const members = req.body.members || '';
  const info = db.prepare('INSERT INTO participants (tournament_id, team_name, leader_name, leader_phone, leader_email, members, ingame, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
    .run(t.id, req.body.team_name, req.body.leader_name, req.body.leader_phone, req.body.leader_email, members, req.body.ingame || '');
  const participantId = info.lastInsertRowid;
  // If user selected manual payment, redirect to manual payment form
  if (req.body.pay_method === 'manual') {
    return res.redirect(`/tournaments/${t.id}/manual-pay?participant=${participantId}`);
  }
  // Default: stripe checkout
  res.redirect(`/payments/create-checkout?participant=${participantId}&tournament=${t.id}`);
});

// Render manual payment upload form
router.get('/:id/manual-pay', (req, res) => {
  const db = req.app.locals.db;
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).send('Tournament not found');
  const participantId = req.query.participant;
  if (!participantId) return res.status(400).send('Missing participant id');
  const settings = {};
  const upiRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('upi');
  const qrRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('payment_qr');
  settings.upi = upiRow ? upiRow.value : null;
  settings.payment_qr = qrRow ? qrRow.value : null;
  res.render('manual_pay', { tournament: t, participantId, settings });
});

// Manual payment proof upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads', 'images')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

router.post('/:id/manual-pay', upload.single('proof'), (req, res) => {
  const db = req.app.locals.db;
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).send('Tournament not found');
  // insert participant first (if not exists). Expect participant_id when user submitted registration flow.
  const participantId = req.body.participant_id;
  if (!participantId) return res.status(400).send('Missing participant id');
  const amount = t.entry_fee;
  const filePath = req.file ? `/uploads/images/${req.file.filename}` : null;
  // create payment record with pending status
  db.prepare('INSERT INTO payments (participant_id, amount, currency, stripe_id, status) VALUES (?, ?, ?, ?, ?)')
    .run(participantId, amount, 'INR', null, 'pending');
  // attach proof into uploads table
  if (req.file) {
    db.prepare('INSERT INTO uploads (filename, original_name) VALUES (?, ?)').run(req.file.filename, req.file.originalname);
  }
  // notify admin by email (if SMTP configured)
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
    const tournament = t;
    const adminEmail = process.env.ADMIN_EMAIL || 'nobodyknowns928@gmail.com';
    const mail = {
      from: process.env.SMTP_FROM || 'no-reply@xtesports',
      to: adminEmail,
      subject: `Payment proof uploaded — ${tournament.name}`,
      html: `<p>Participant <strong>${participant.team_name}</strong> uploaded a payment proof for <strong>${tournament.name}</strong>.</p>
             <p>Leader: ${participant.leader_name} (${participant.leader_email} / ${participant.leader_phone})</p>
             <p>View proof: ${filePath ? `${req.protocol}://${req.get('host')}${filePath}` : 'No file'}</p>
             <p><a href="${req.protocol}://${req.get('host')}/admin/participants">Open participants (admin)</a></p>`
    };
    transporter.sendMail(mail).catch(e => console.error('Mail send error', e));

    // send acknowledgement to participant if email available
    try {
      if (participant && participant.leader_email) {
        const userMail = {
          from: process.env.SMTP_FROM || 'no-reply@xtesports',
          to: participant.leader_email,
          subject: `Payment proof received — ${tournament.name}`,
          html: `<p>Hi ${participant.leader_name},</p>
                 <p>We received your payment proof for <strong>${tournament.name}</strong>. Our admin will verify and confirm your registration shortly.</p>
                 <p>Join updates: <a href="https://chat.whatsapp.com/KWLpkWsD9wOBcPINmFCbIx">WhatsApp group</a>.</p>`
        };
        transporter.sendMail(userMail).catch(e => console.error('Mail send error (participant)', e));
      }
    } catch (e) {
      console.error('Error sending participant acknowledgement', e);
    }
  } catch (e) {
    console.error('Error sending email', e);
  }
  res.render('index', { tournaments: db.prepare('SELECT * FROM tournaments').all(), message: 'Payment proof uploaded. Admin will verify soon.' });
});

module.exports = router;
