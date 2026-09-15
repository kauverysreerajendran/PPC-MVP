-- Runs once on first cluster init (empty data dir), as POSTGRES_USER — so
-- these schemas are already owned by that user, same as `public`.
--
-- All services share this one physical database (`POSTGRES_DB`); each
-- microservice owns a dedicated schema so its tables never collide with, or
-- get queried directly by, another service. The backend monolith keeps using
-- the default `public` schema. Each service's own `alembic upgrade head` also
-- runs `CREATE SCHEMA IF NOT EXISTS` itself, so this file is just a fast path
-- for a brand-new volume — nothing here is required for migrations to work.
CREATE SCHEMA IF NOT EXISTS sap;
CREATE SCHEMA IF NOT EXISTS masterdata;
CREATE SCHEMA IF NOT EXISTS rack;
