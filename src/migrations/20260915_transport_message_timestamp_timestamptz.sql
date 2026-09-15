-- Migración: normalizar timestamp del chat de transporte.
-- Fecha: 2026-09-15
--
-- Los valores históricos de created_at fueron almacenados en UTC
-- aunque la columna era timestamp without time zone.

BEGIN;

ALTER TABLE transport_negotiation_messages
  ALTER COLUMN created_at
  TYPE timestamptz
  USING created_at AT TIME ZONE 'UTC';

COMMIT;
