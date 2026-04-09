const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const router = express.Router();

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null });
});

// POST /register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.render('register', { error: 'Todos los campos son obligatorios.' });

  const normalEmail = email.toLowerCase().trim();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalEmail);
  if (existing)
    return res.render('register', { error: 'Ya existe una cuenta con ese correo.' });

  // El primer usuario siempre puede registrarse (se convierte en admin)
  const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (usersCount.count > 0) {
    const allowed = db.prepare('SELECT * FROM allowed_emails WHERE email = ? COLLATE NOCASE').get(normalEmail);
    if (!allowed)
      return res.render('register', { error: 'Tu correo no está autorizado para registrarse.' });
    if (!allowed.is_active)
      return res.render('register', { error: 'Tu correo ha sido deshabilitado. Contacta al administrador.' });
  }

  const hash = await bcrypt.hash(password, 10);
  const isAdmin = usersCount.count === 0 ? 1 : 0;

  const result = db.prepare(
    'INSERT INTO users (email, password, name, is_admin) VALUES (?, ?, ?, ?)'
  ).run(normalEmail, hash, name, isAdmin);

  req.session.user = { id: result.lastInsertRowid, email: normalEmail, name, is_admin: isAdmin };
  res.redirect('/');
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.render('login', { error: 'Correo o contraseña incorrectos.' });

  if (!user.is_active)
    return res.render('login', { error: 'Tu cuenta ha sido deshabilitada. Contacta al administrador.' });

  req.session.user = { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin };
  res.redirect('/');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
