const express = require('express');
const db = require('../database/db');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();

// GET / - lista de exámenes activos
router.get('/', isAuthenticated, (req, res) => {
  const quizzes = db.prepare(`
    SELECT q.*, COUNT(qu.id) as question_count
    FROM quizzes q
    LEFT JOIN questions qu ON qu.quiz_id = q.id
    WHERE q.is_active = 1
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `).all();

  // Marcar cuáles ya fueron respondidos por este usuario
  const quizzesWithStatus = quizzes.map(q => ({
    ...q,
    already_submitted: !!db.prepare(
      'SELECT id FROM submissions WHERE quiz_id = ? AND user_id = ?'
    ).get(q.id, req.session.user.id)
  }));

  res.render('index', { user: req.session.user, quizzes: quizzesWithStatus });
});

// GET /quiz/:id - abrir un examen específico
router.get('/quiz/:id', isAuthenticated, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!quiz) return res.redirect('/');

  const existing = db.prepare(
    'SELECT submitted_at FROM submissions WHERE quiz_id = ? AND user_id = ?'
  ).get(quiz.id, req.session.user.id);

  if (existing)
    return res.render('already-submitted', { user: req.session.user, quiz, submitted_at: existing.submitted_at });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY sort_order').all(quiz.id);
  const questionsWithOptions = questions.map(q => ({
    ...q,
    options: db.prepare('SELECT * FROM options WHERE question_id = ?').all(q.id)
  }));
  res.render('quiz', { user: req.session.user, quiz, questions: questionsWithOptions });
});

// POST /quiz/submit
router.post('/quiz/submit', isAuthenticated, (req, res) => {
  const { quiz_id, ...answers } = req.body;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND is_active = 1').get(quiz_id);
  if (!quiz) return res.redirect('/');

  // Prevenir doble envío
  const existing = db.prepare(
    'SELECT id FROM submissions WHERE quiz_id = ? AND user_id = ?'
  ).get(quiz_id, req.session.user.id);
  if (existing) return res.redirect(`/quiz/${quiz_id}`);

  const submission = db.prepare(
    'INSERT INTO submissions (quiz_id, user_id) VALUES (?, ?)'
  ).run(quiz_id, req.session.user.id);

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ?').all(quiz_id);
  const insertAnswer = db.prepare(
    'INSERT INTO answers (submission_id, question_id, selected_option_id, text_answer) VALUES (?, ?, ?, ?)'
  );

  questions.forEach(q => {
    const key = `q_${q.id}`;
    if (q.type === 'multiple_choice') {
      const optId = answers[key] ? parseInt(answers[key]) : null;
      insertAnswer.run(submission.lastInsertRowid, q.id, optId, null);
    } else {
      insertAnswer.run(submission.lastInsertRowid, q.id, null, answers[key] || '');
    }
  });

  res.render('submitted', { user: req.session.user });
});

module.exports = router;
