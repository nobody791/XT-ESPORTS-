# E-Sports Association

This project is a starter scaffold for an e-Sports association website with:

- Premium, responsive EJS + Bootstrap templates
- Tournament registration forms (BGMI & Free Fire) with server-side validation
- Stripe Checkout integration for entry fee payments (test keys only in .env)
- Admin panel for tournament and user management
- File upload handling (banner images) saved to `/uploads/images`
- SQLite database stored at `/data/database.db`

Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill keys (Stripe test keys, session secret):

```bash
cp .env.example .env
```

# XT ESPORTS — E-Sports Association

This project provides a lightweight tournament registration site (BGMI & Free Fire) with:

- Responsive EJS + Bootstrap UI
- Admin panel to create tournaments and manage registrations
- Stripe Checkout support (optional) and manual UPI/QR payment flow
- Uploads stored in `/uploads/images`, SQLite DB by default at `/data/database.db`

Quick start (no secrets required)

1. Install dependencies:

```bash
npm install
```

2. Start server locally (no env is required — Stripe/SMTP will be optional):

```bash
npm start
```

3. Create an admin user (recommended) using the helper script:

```bash
ADMIN_USER=admin ADMIN_PASS=yourpassword npm run create-admin
```

Admin panel usage

- Open `http://localhost:3000/admin/tournaments` and log in as the admin user you created.
- Create tournaments with `Name`, `Game` (BGMI / Free Fire), `Entry fee` (in cents), and upload a `Banner`.
- In the right column "Payment Settings" you can enter your UPI ID (e.g. `8504092514@fam`) and upload a `payment_qr` image (scanner.jpg) and `site_banner` (xtesports.jpg). These appear to users on registration pages.
- View registrations in `Admin → View Registrations` and verify manual payments with the Verify button.

Payment flows

- Card (Stripe): if you provide `STRIPE_SECRET_KEY`, users can pay via Stripe Checkout and registrations are marked paid automatically.
- Manual UPI/QR: if you don't set Stripe (or user chooses manual), the site shows the QR and UPI ID. Users upload proof (screenshot + tx id). Admin receives a notification email (if SMTP is configured) and can then Verify the participant.

Environment variables (optional)

- `SESSION_SECRET` — session secret (recommended)
- `STRIPE_SECRET_KEY` — Stripe secret (optional). If not set, manual payment flow is used.
- SMTP (optional, for admin notifications): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`
- `ADMIN_EMAIL` — email to receive admin notifications (defaults to `nobodyknowns928@gmail.com`)

Admin creation options

- Use the included script: `ADMIN_USER=admin ADMIN_PASS=secret npm run create-admin`.
- Or use SQLite directly: open `data/database.db` and add a user with `is_admin = 1`. The script hashes passwords with `bcrypt` for you.

Deploying to Render (minimal)

1. Create a new Web Service on Render.
2. Set the build command to `npm install` and the start command to `npm start`.
3. Set environment variables in the Render dashboard if you plan to use Stripe/SMTP (optional).
4. Note: Render filesystem is ephemeral. Uploaded images stored in `/uploads/images` will be lost on redeploy. For persistent storage use S3 or another object store — I can add S3 support if you want.

Using the MongoDB connection you provided

You can switch to MongoDB but the app currently uses SQLite. Migrating requires code changes (models/queries). If you want, I can:

- Add MongoDB support and migrate tables to collections
- Or connect only for storing uploads/metadata

Tell me if you want the app converted to MongoDB now and I will prepare the migration plan.

Notes & next steps I can do for you

- Add S3-backed uploads so Render deployments are safe (recommended).
- Add email templates and participant confirmation emails.
- Migrate the app to MongoDB using the connection string you provided.

If you want me to proceed with any of those next steps (S3, MongoDB migration, email templates), tell me which and I will implement it.
