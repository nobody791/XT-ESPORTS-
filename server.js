require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('express').urlencoded;
const methodOverride = require('method-override');
const Database = require('better-sqlite3');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const app = express();

// ensure data directories
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));
if (!fs.existsSync(path.join(__dirname, 'uploads', 'images'))) fs.mkdirSync(path.join(__dirname, 'uploads', 'images'));

// DB
const db = new Database(path.join(__dirname, 'data', 'database.db'));
// Create tables
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  is_admin INTEGER DEFAULT 0
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  game TEXT,
  entry_fee INTEGER,
  max_teams INTEGER,
  details TEXT,
  banner TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER,
  team_name TEXT,
  leader_name TEXT,
  leader_phone TEXT,
  leader_email TEXT,
  members TEXT,
  paid INTEGER DEFAULT 0,
  stripe_session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER,
  amount INTEGER,
  currency TEXT,
  stripe_id TEXT,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  original_name TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

// settings table for site-wide values like payment QR and UPI
db.prepare(`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`).run();

// ensure participants has ingame column (silent if exists)
try {
  db.prepare('ALTER TABLE participants ADD COLUMN ingame TEXT').run();
} catch (e) {
  // ignore if column exists
}

app.locals.db = db;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser({ extended: true }));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') })
}));

// simple auth helper
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Routes
app.get('/', (req, res) => {
  const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY id DESC').all();
  res.render('index', { tournaments });
});

app.use('/auth', require('./routes/auth'));
app.use('/tournaments', require('./routes/tournaments'));
app.use('/payments', require('./routes/payments'));
app.use('/admin', require('./routes/admin'));

// simple 404
app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
