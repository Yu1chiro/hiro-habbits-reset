require("dotenv").config();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const { DATABASE_URL, JWT_SECRET, APP_PIN, NODE_ENV } = process.env;

if (!DATABASE_URL) throw new Error("DATABASE_URL belum diset di file .env");
if (!JWT_SECRET) throw new Error("JWT_SECRET belum diset di file .env");
if (!APP_PIN) throw new Error("APP_PIN belum diset di file .env");

// Folder aset publik (halaman login) & folder halaman terproteksi (index.html asli)
const publicPath = path.join(__dirname, "public");
const protectedPath = path.join(__dirname, "dashboard");

const COOKIE_NAME = "lf_token";
const STATE_ROW_ID = 1;

// ---------------------------------------------------------------------------
// Database (Neon Postgres)
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getState() {
  const { rows } = await pool.query(
    "SELECT data FROM app_state WHERE id = $1",
    [STATE_ROW_ID]
  );
  return rows.length ? rows[0].data : null;
}

async function saveStateToDb(data) {
  await pool.query(
    `INSERT INTO app_state (id, data, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();`,
    [STATE_ROW_ID, data]
  );
}

// ---------------------------------------------------------------------------
// Middleware keamanan dasar
// ---------------------------------------------------------------------------
app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Batasi percobaan login untuk mencegah brute-force PIN
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
  },
});

// ---------------------------------------------------------------------------
// Autentikasi berbasis PIN + JWT (disimpan di cookie httpOnly)
// ---------------------------------------------------------------------------
function signToken() {
  return jwt.sign({ auth: true }, JWT_SECRET, {
    expiresIn: "12h",
  });
}

function requireAuthPage(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.redirect("/login");
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    return res.redirect("/login");
  }
}

function requireAuthApi(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }
}

// ---------------------------------------------------------------------------
// Aset publik & halaman login (tidak butuh autentikasi)
// ---------------------------------------------------------------------------
app.use(express.static(publicPath, { index: false }));

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicPath, "login.html"));
});

app.post("/api/login", loginLimiter, (req, res) => {
  const { pin } = req.body || {};

  if (typeof pin !== "string" || pin !== APP_PIN) {
    return res.status(401).json({
      error: "PIN salah.",
    });
  }

  const token = signToken();

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });

  res.json({
    ok: true,
  });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);

  res.json({
    ok: true,
  });
});

// ---------------------------------------------------------------------------
// Halaman utama — terproteksi PIN + JWT
// ---------------------------------------------------------------------------
app.get("/", requireAuthPage, (req, res) => {
  res.sendFile(path.join(protectedPath, "index.html"));
});

// ---------------------------------------------------------------------------
// API data — terproteksi, membaca/menulis ke Neon Postgres
// ---------------------------------------------------------------------------
app.get("/api/state", requireAuthApi, async (req, res) => {
  try {
    const data = await getState();

    res.json({
      data,
    });
  } catch (err) {
    console.error("Gagal memuat state:", err);

    res.status(500).json({
      error: "Gagal memuat data.",
    });
  }
});

app.post("/api/state", requireAuthApi, async (req, res) => {
  try {
    const data = req.body;

    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.habits)
    ) {
      return res.status(400).json({
        error: "Format data tidak valid.",
      });
    }

    await saveStateToDb(data);

    res.json({
      ok: true,
    });
  } catch (err) {
    console.error("Gagal menyimpan state:", err);

    res.status(500).json({
      error: "Gagal menyimpan data.",
    });
  }
});

// ---------------------------------------------------------------------------
// Jalankan server setelah memastikan skema database siap
// ---------------------------------------------------------------------------
ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Gagal menyiapkan skema database:", err);
    process.exit(1);
  });