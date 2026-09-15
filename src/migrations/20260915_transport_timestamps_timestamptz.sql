-- Migración: normalizar timestamps de transporte a timestamptz.
-- Fecha: 2026-09-15
--
-- Los valores históricos fueron almacenados en UTC aunque las columnas
-- eran "timestamp without time zone".
-- Por eso se interpretan explícitamente como UTC durante la conversión.
--
-- event_local_time NO se modifica porque representa la hora local
-- capturada por el dispositivo.

BEGIN;

ALTER TABLE transport_guides
  ALTER COLUMN created_at
  TYPE timestamptz
  USING created_at AT TIME ZONE 'UTC',

  ALTER COLUMN official_uploaded_at
  TYPE timestamptz
  USING official_uploaded_at AT TIME ZONE 'UTC';


ALTER TABLE transport_negotiations
  ALTER COLUMN created_at
  TYPE timestamptz
  USING created_at AT TIME ZONE 'UTC',

  ALTER COLUMN trip_started_at
  TYPE timestamptz
  USING trip_started_at AT TIME ZONE 'UTC',

  ALTER COLUMN delivered_at
  TYPE timestamptz
  USING delivered_at AT TIME ZONE 'UTC',

  ALTER COLUMN chat_available_until
  TYPE timestamptz
  USING chat_available_until AT TIME ZONE 'UTC';


ALTER TABLE transport_trip_events
  ALTER COLUMN created_at
  TYPE timestamptz
  USING created_at AT TIME ZONE 'UTC';

COMMIT;
