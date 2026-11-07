#!/bin/sh
# Runs once, when the Postgres volume is first created.
# Prepares the database for Supabase Auth (GoTrue) and enables pgvector.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS vector;

  -- Roles Supabase Auth's migrations expect to exist.
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD '${AUTH_DB_PASSWORD}';
    END IF;
  END
  \$\$;

  CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
  GRANT CREATE ON DATABASE ${POSTGRES_DB} TO supabase_auth_admin;
  ALTER ROLE supabase_auth_admin SET search_path = auth;
EOSQL
