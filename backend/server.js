const app = require("./app");
const { autoAssignReadyTables } = require("./utils/queueUtils");

const PORT = process.env.PORT || 3000;

setInterval(autoAssignReadyTables, 10000);

app.listen(PORT, () => {
  console.log(`Restaurant management app running on http://localhost:${PORT}`);
});
