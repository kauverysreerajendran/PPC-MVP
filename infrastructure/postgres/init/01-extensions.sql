-- Runs once on first cluster init (empty data dir).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";       -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
