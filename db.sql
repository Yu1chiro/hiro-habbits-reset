-- Skema database untuk Little Forest (Neon Postgres)
-- Jalankan file ini sekali di database Neon kamu (lewat SQL editor Neon
-- atau `psql "$DATABASE_URL" -f schema.sql`).
-- Server (server.js) juga otomatis membuat tabel ini saat start jika belum ada.

CREATE TABLE IF NOT EXISTS app_state (
  id         INTEGER PRIMARY KEY,       -- selalu 1, hanya 1 baris (aplikasi single-user berbasis PIN)
  data       JSONB NOT NULL,            -- seluruh state: startDate, duration, habits, records, reflections
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);