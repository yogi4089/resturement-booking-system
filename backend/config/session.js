module.exports = {
  secret: process.env.SESSION_SECRET || "restaurant-secret",
  resave: false,
  saveUninitialized: false
};
