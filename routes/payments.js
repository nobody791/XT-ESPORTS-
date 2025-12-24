const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const nodemailer = require('nodemailer');

router.get('/create-checkout', async (req, res) => {
  const db = req.app.locals.db;
  const participantId = req.query.participant;
  const tournamentId = req.query.tournament;
  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!participant || !tournament) return res.status(400).send('Invalid request');
  const domain = `${req.protocol}://${req.get('host')}`;
  // If Stripe is not configured, fall back to manual payment flow
  if (!stripe) {
    return res.redirect(`/tournaments/${tournamentId}/manual-pay?participant=${participantId}`);
  }
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'usd', product_data: { name: tournament.name }, unit_amount: tournament.entry_fee }, quantity: 1 }],
      mode: 'payment',
      success_url: `${domain}/payments/success?session_id={CHECKOUT_SESSION_ID}&participant=${participantId}`,
      cancel_url: `${domain}/payments/cancel?participant=${participantId}`
    });
    // save session id
    db.prepare('UPDATE participants SET stripe_session_id = ? WHERE id = ?').run(session.id, participantId);
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).send('Payment creation failed');
  }
});

router.get('/success', async (req, res) => {
  const db = req.app.locals.db;
  const sessionId = req.query.session_id;
  const participantId = req.query.participant;
  if (!sessionId) return res.status(400).send('Missing session');
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // record payment
    const amount = session.amount_total || 0;
    db.prepare('INSERT INTO payments (participant_id, amount, currency, stripe_id, status) VALUES (?, ?, ?, ?, ?)')
      .run(participantId, amount, session.currency || 'usd', session.payment_intent || session.id, session.payment_status || 'paid');
    db.prepare('UPDATE participants SET paid = 1 WHERE id = ?').run(participantId);
    // notify admin about successful payment and send confirmation to participant (if SMTP configured)
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
      });
      const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId);
      const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(participant.tournament_id);
      const adminEmail = process.env.ADMIN_EMAIL || 'nobodyknowns928@gmail.com';
      const adminMail = {
        from: process.env.SMTP_FROM || 'no-reply@xtesports',
        to: adminEmail,
        subject: `New registration paid — ${tournament ? tournament.name : 'tournament'}`,
        html: `<p>Participant <strong>${participant.team_name}</strong> has completed payment for <strong>${tournament ? tournament.name : ''}</strong>.</p>
               <p>Leader: ${participant.leader_name} (${participant.leader_email} / ${participant.leader_phone})</p>
               <p>Check admin panel: <a href="${req.protocol}://${req.get('host')}/admin/participants">Registrations</a></p>`
      };
      transporter.sendMail(adminMail).catch(e => console.error('Mail send error (admin)', e));

      if (participant && participant.leader_email) {
        const userMail = {
          from: process.env.SMTP_FROM || 'no-reply@xtesports',
          to: participant.leader_email,
          subject: `Registration confirmed — ${tournament ? tournament.name : ''}`,
          html: `<p>Hi ${participant.leader_name},</p>
                 <p>Your registration for <strong>${tournament ? tournament.name : ''}</strong> is confirmed. Team: <strong>${participant.team_name}</strong>. In-game: <strong>${participant.ingame || '-'}</strong>.</p>
                 <p>Join tournament updates: <a href="https://chat.whatsapp.com/KWLpkWsD9wOBcPINmFCbIx">WhatsApp group</a>.</p>
                 <p>See your registration in the admin panel once logged in.</p>`
        };
        transporter.sendMail(userMail).catch(e => console.error('Mail send error (participant)', e));
      }
    } catch (e) {
      console.error('Error sending payment notification', e);
    }
    res.render('index', { tournaments: db.prepare('SELECT * FROM tournaments').all(), message: 'Payment successful — registration complete' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error confirming payment');
  }
});

router.get('/cancel', (req, res) => {
  res.send('Payment canceled. You can retry the registration from your tournaments page.');
});

module.exports = router;
