const express = require("express");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
    res.send("Project Mosaic is alive.");
});

app.listen(PORT, () => {
    console.log(`Project Mosaic running on port ${PORT}`);
});
