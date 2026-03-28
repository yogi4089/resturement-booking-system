const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Restaurant management app running on http://localhost:${PORT}`);
});
