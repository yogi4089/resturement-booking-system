const express = require("express");
const {
  findBookingStatus,
  renderHomePage,
  renderMenuPage,
  renderStatusPage
} = require("../controllers/pageController");

const router = express.Router();

router.get("/", renderHomePage);
router.get("/menu", renderMenuPage);
router.get("/status", renderStatusPage);
router.post("/status", findBookingStatus);

module.exports = router;
