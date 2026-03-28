const { query } = require("../config/db");

async function getAvailableMenuItems() {
  const result = await query("SELECT * FROM menu_items WHERE availability = TRUE ORDER BY name ASC");
  return result.rows;
}

async function getAllMenuItems() {
  const result = await query("SELECT * FROM menu_items ORDER BY availability DESC, name ASC");
  return result.rows;
}

async function createMenuItem({ name, price }) {
  await query("INSERT INTO menu_items (name, price, availability) VALUES ($1, $2, TRUE)", [name, price]);
}

async function toggleMenuAvailability(itemId) {
  await query("UPDATE menu_items SET availability = NOT availability WHERE id = $1", [itemId]);
}

async function deleteMenuItem(itemId) {
  await query("DELETE FROM menu_items WHERE id = $1", [itemId]);
}

module.exports = {
  createMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  getAvailableMenuItems,
  toggleMenuAvailability
};
