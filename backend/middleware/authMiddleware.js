function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    req.session.flash = { type: "danger", text: "Admin login required." };
    return res.redirect("/admin/login");
  }

  return next();
}

module.exports = {
  requireAdmin
};
