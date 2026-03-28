const express = require("express");
const {
  completeAdminBooking,
  addAdminWaitingTime,
  createAdminMenuItem,
  deleteAdminMenuItem,
  extendAdminBooking,
  loginAdmin,
  logoutAdmin,
  promoteAdminQueueBooking,
  redirectAdminRoot,
  renderAdminLogin,
  renderAdminMenuPage,
  renderAdminTablesPage,
  renderAdminWaitingListPage,
  resetDoneAdminTable,
  seatNowAdminBooking,
  toggleAdminMenuItem,
  updateAdminTableStatus
} = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/admin/login", renderAdminLogin);
router.post("/admin/login", loginAdmin);
router.post("/admin/logout", logoutAdmin);
router.get("/admin", requireAdmin, redirectAdminRoot);
router.get("/admin/tables", requireAdmin, renderAdminTablesPage);
router.get("/admin/waiting-list", requireAdmin, renderAdminWaitingListPage);
router.get("/admin/menu", requireAdmin, renderAdminMenuPage);

router.post("/admin/tables/:id/status", requireAdmin, updateAdminTableStatus);
router.post("/admin/tables/:id/reset-done", requireAdmin, resetDoneAdminTable);
router.post("/admin/bookings/:id/complete", requireAdmin, completeAdminBooking);
router.post("/admin/bookings/:id/seat", requireAdmin, seatNowAdminBooking);
router.post("/admin/bookings/:id/extend", requireAdmin, extendAdminBooking);
router.post("/admin/queue/:bookingId/promote", requireAdmin, promoteAdminQueueBooking);
router.post("/admin/queue/:bookingId/wait/add", requireAdmin, addAdminWaitingTime);

router.post("/admin/menu", requireAdmin, createAdminMenuItem);
router.post("/admin/menu/:id/toggle", requireAdmin, toggleAdminMenuItem);
router.post("/admin/menu/:id/delete", requireAdmin, deleteAdminMenuItem);

module.exports = router;


