const bookingModel = require("./bookingModel");
const dashboardModel = require("./dashboardModel");
const menuModel = require("./menuModel");
const queueModel = require("./queueModel");
const tableModel = require("./tableModel");

module.exports = {
  ...bookingModel,
  ...dashboardModel,
  ...menuModel,
  ...queueModel,
  ...tableModel
};
