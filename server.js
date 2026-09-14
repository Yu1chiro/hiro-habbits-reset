
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Folder public
const publicPath = path.join(__dirname, "public");

// Sajikan file statis
app.use(express.static(publicPath));

// Root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});