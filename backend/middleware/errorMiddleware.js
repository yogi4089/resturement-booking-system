function notFoundHandler(req, res) {
  res.status(404).render("404", {
    title: "Page Not Found"
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);
  res.status(500).render("500", {
    title: "Server Error",
    error
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
