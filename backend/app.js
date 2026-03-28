require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const { pageRoutes, bookingRoutes, adminRoutes } = require("./routes");
const sessionConfig = require("./config/session");
const { attachViewLocals } = require("./middleware/viewLocalsMiddleware");
const { errorHandler, notFoundHandler } = require("./middleware/errorMiddleware");

const app = express();
const frontendRoot = path.join(__dirname, "..", "frontend");

app.set("view engine", "ejs");
app.set("views", path.join(frontendRoot, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session(sessionConfig));
app.use(express.static(path.join(frontendRoot, "public")));
app.use(attachViewLocals);

app.use(pageRoutes);
app.use(bookingRoutes);
app.use(adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
