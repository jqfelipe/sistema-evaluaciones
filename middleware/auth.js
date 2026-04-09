function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_admin) return next();
  res.status(403).send('Acceso denegado');
}

module.exports = { isAuthenticated, isAdmin };
