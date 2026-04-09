const express = require('express');
const db = require('../database/db');
const { isAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(isAdmin);

// Dashboard
router.get('/', (req, res) => {
  const quizzes = db.prepare('SELECT * FROM quizzes ORDER BY created_at DESC').all();
  res.render('admin/dashboard', { user: req.session.user, quizzes });
});

// --- QUIZZES ---
router.post('/quizzes', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.redirect('/admin');
  db.prepare('INSERT INTO quizzes (title, description) VALUES (?, ?)').run(title, description || '');
  res.redirect('/admin');
});

router.post('/quizzes/:id/edit', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.redirect('/admin');
  db.prepare('UPDATE quizzes SET title = ?, description = ? WHERE id = ?').run(title, description || '', req.params.id);
  res.redirect('/admin');
});

router.post('/quizzes/:id/duplicate', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.redirect('/admin');

  const newQuiz = db.prepare(
    'INSERT INTO quizzes (title, description, is_active) VALUES (?, ?, 0)'
  ).run(`${quiz.title} (copia)`, quiz.description || '');

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY sort_order').all(quiz.id);
  const insertQuestion = db.prepare('INSERT INTO questions (quiz_id, text, type, sort_order) VALUES (?, ?, ?, ?)');
  const insertOption = db.prepare('INSERT INTO options (question_id, text) VALUES (?, ?)');

  questions.forEach(q => {
    const newQ = insertQuestion.run(newQuiz.lastInsertRowid, q.text, q.type, q.sort_order);
    const options = db.prepare('SELECT * FROM options WHERE question_id = ?').all(q.id);
    options.forEach(o => insertOption.run(newQ.lastInsertRowid, o.text));
  });

  res.redirect('/admin');
});

router.post('/quizzes/:id/toggle', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (quiz) db.prepare('UPDATE quizzes SET is_active = ? WHERE id = ?').run(quiz.is_active ? 0 : 1, quiz.id);
  res.redirect('/admin');
});

router.post('/quizzes/:id/delete', (req, res) => {
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- QUESTIONS ---
router.get('/quizzes/:id/questions', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) return res.redirect('/admin');
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY sort_order').all(quiz.id);
  const questionsWithOptions = questions.map(q => ({
    ...q,
    options: db.prepare('SELECT * FROM options WHERE question_id = ?').all(q.id)
  }));
  res.render('admin/questions', { user: req.session.user, quiz, questions: questionsWithOptions });
});

router.post('/quizzes/:id/questions', (req, res) => {
  const { text, type, options } = req.body;
  if (!text || !type) return res.redirect(`/admin/quizzes/${req.params.id}/questions`);

  const count = db.prepare('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?').get(req.params.id);
  const result = db.prepare(
    'INSERT INTO questions (quiz_id, text, type, sort_order) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, text, type, count.c);

  if (type === 'multiple_choice' && options) {
    const optList = Array.isArray(options) ? options : [options];
    const insert = db.prepare('INSERT INTO options (question_id, text) VALUES (?, ?)');
    optList.forEach(o => { if (o.trim()) insert.run(result.lastInsertRowid, o.trim()); });
  }
  res.redirect(`/admin/quizzes/${req.params.id}/questions`);
});

router.post('/questions/:id/delete', (req, res) => {
  const q = db.prepare('SELECT quiz_id FROM questions WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.redirect(q ? `/admin/quizzes/${q.quiz_id}/questions` : '/admin');
});

router.post('/questions/:id/edit', (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.redirect('/admin');

  const { text, type } = req.body;
  if (!text || !type) return res.redirect(`/admin/quizzes/${q.quiz_id}/questions`);

  db.prepare('UPDATE questions SET text = ?, type = ? WHERE id = ?').run(text, type, q.id);

  // Actualizar textos de opciones existentes
  const existingIds = Object.keys(req.body)
    .filter(k => k.startsWith('opt_text_'))
    .map(k => k.replace('opt_text_', ''));

  existingIds.forEach(optId => {
    const optText = req.body[`opt_text_${optId}`]?.trim();
    const shouldDelete = req.body[`delete_opt_${optId}`] === '1';
    if (shouldDelete) {
      // Poner NULL en respuestas que usaban esta opción antes de borrarla
      db.prepare('UPDATE answers SET selected_option_id = NULL WHERE selected_option_id = ?').run(optId);
      db.prepare('DELETE FROM options WHERE id = ?').run(optId);
    } else if (optText) {
      db.prepare('UPDATE options SET text = ? WHERE id = ?').run(optText, optId);
    }
  });

  // Si cambió a open_ended, eliminar todas las opciones
  if (type === 'open_ended') {
    const opts = db.prepare('SELECT id FROM options WHERE question_id = ?').all(q.id);
    opts.forEach(o => {
      db.prepare('UPDATE answers SET selected_option_id = NULL WHERE selected_option_id = ?').run(o.id);
    });
    db.prepare('DELETE FROM options WHERE question_id = ?').run(q.id);
  }

  // Agregar nuevas opciones
  if (type === 'multiple_choice') {
    const newOptions = req.body.new_options;
    if (newOptions) {
      const list = Array.isArray(newOptions) ? newOptions : [newOptions];
      const insert = db.prepare('INSERT INTO options (question_id, text) VALUES (?, ?)');
      list.forEach(o => { if (o?.trim()) insert.run(q.id, o.trim()); });
    }
  }

  res.redirect(`/admin/quizzes/${q.quiz_id}/questions`);
});

// --- RESULTS ---
router.get('/results', (req, res) => {
  const quizzes = db.prepare('SELECT * FROM quizzes ORDER BY created_at DESC').all();
  res.render('admin/results', { user: req.session.user, quizzes, submissions: [], selectedQuiz: null });
});

router.get('/results/:quizId', (req, res) => {
  const quizzes = db.prepare('SELECT * FROM quizzes ORDER BY created_at DESC').all();
  const selectedQuiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.quizId);
  if (!selectedQuiz) return res.redirect('/admin/results');

  const submissions = db.prepare(`
    SELECT s.id, s.submitted_at, u.email, u.name
    FROM submissions s JOIN users u ON s.user_id = u.id
    WHERE s.quiz_id = ? ORDER BY s.submitted_at DESC
  `).all(req.params.quizId);

  const submissionsWithAnswers = submissions.map(sub => {
    const answers = db.prepare(`
      SELECT a.text_answer, a.selected_option_id, q.text as question_text, q.type,
             o.text as option_text
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      LEFT JOIN options o ON a.selected_option_id = o.id
      WHERE a.submission_id = ?
      ORDER BY q.sort_order
    `).all(sub.id);
    return { ...sub, answers };
  });

  res.render('admin/results', { user: req.session.user, quizzes, submissions: submissionsWithAnswers, selectedQuiz });
});

// --- USERS ---
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
  const allowed = db.prepare('SELECT * FROM allowed_emails ORDER BY created_at DESC').all();
  res.render('admin/users', { user: req.session.user, users, allowed, error: null, success: null });
});

router.post('/users/:id/toggle-admin', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.redirect('/admin/users');

  // Proteger: no quitar admin si es el único
  if (target.is_admin) {
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1 AND is_active = 1').get();
    if (adminCount.c <= 1)
      return res.redirect('/admin/users?error=last_admin');
  }

  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(target.is_admin ? 0 : 1, target.id);

  // Actualizar sesión si el admin se está quitando sus propios permisos
  if (req.session.user.id === target.id)
    req.session.user.is_admin = target.is_admin ? 0 : 1;

  res.redirect('/admin/users');
});

router.post('/users/:id/toggle-active', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.redirect('/admin/users');

  // No puede deshabilitarse a sí mismo
  if (req.session.user.id === target.id)
    return res.redirect('/admin/users?error=self');

  // No deshabilitar al último admin activo
  if (target.is_admin && target.is_active) {
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1 AND is_active = 1').get();
    if (adminCount.c <= 1)
      return res.redirect('/admin/users?error=last_admin');
  }

  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(target.is_active ? 0 : 1, target.id);
  res.redirect('/admin/users');
});

// --- ALLOWED EMAILS ---
router.post('/allowed-emails', (req, res) => {
  const { email } = req.body;
  if (!email) return res.redirect('/admin/users');
  const normalEmail = email.toLowerCase().trim();
  const exists = db.prepare('SELECT id FROM allowed_emails WHERE email = ? COLLATE NOCASE').get(normalEmail);
  if (!exists)
    db.prepare('INSERT INTO allowed_emails (email) VALUES (?)').run(normalEmail);
  res.redirect('/admin/users');
});

router.post('/allowed-emails/:id/toggle', (req, res) => {
  const entry = db.prepare('SELECT * FROM allowed_emails WHERE id = ?').get(req.params.id);
  if (entry) db.prepare('UPDATE allowed_emails SET is_active = ? WHERE id = ?').run(entry.is_active ? 0 : 1, entry.id);
  res.redirect('/admin/users');
});

router.post('/allowed-emails/:id/delete', (req, res) => {
  db.prepare('DELETE FROM allowed_emails WHERE id = ?').run(req.params.id);
  res.redirect('/admin/users');
});

module.exports = router;
