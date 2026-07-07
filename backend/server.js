const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

const frontendPath = path.join(__dirname, "..", "frontend");

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Project Mosaic running at http://localhost:${PORT}`);
});