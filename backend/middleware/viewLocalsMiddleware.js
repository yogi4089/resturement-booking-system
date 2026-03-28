function attachViewLocals(req, res, next) {
  res.locals.admin = Boolean(req.session.admin);
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

module.exports = {
  attachViewLocals
};
