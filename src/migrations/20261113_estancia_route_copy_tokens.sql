-- C03.5G: copias temporales de rutas compartidas expresamente por el usuario.
CREATE TABLE IF NOT EXISTS estancia_route_copy_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  route_points JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS estancia_route_copy_tokens_expiry_idx ON estancia_route_copy_tokens(expires_at);
-- Las lecturas rechazan registros vencidos. La limpieza física se programa aparte.
