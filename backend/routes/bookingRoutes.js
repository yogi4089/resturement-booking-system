const express = require("express");
const {
  cancelBooking,
  createBooking,
  createBookingFromAlternative,
  getBookings,
  getQueue,
  getWaitEstimate,
  joinWaitingList
} = require("../controllers/bookingController");

const router = express.Router();

router.post("/bookings", createBooking);
router.post("/bookings/waitlist", joinWaitingList);
router.post("/bookings/alternative", createBookingFromAlternative);
router.post("/bookings/:id/cancel", cancelBooking);
router.get(["/bookings", "/api/bookings"], getBookings);
router.get(["/queue", "/api/queue"], getQueue);
router.get("/api/wait-estimate", getWaitEstimate);

module.exports = router;
