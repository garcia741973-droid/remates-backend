'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Test sin consultas a PostgreSQL real: se reemplaza pool.query en este proceso.
test('registro MiniCore sin empresa ni KYC obligatorio', async () => {
  const original = pool.query;
  const oldFlag = process.env.MINICORE_ESTANCIA_REGISTER_ENABLED;
  const oldKey = process.env.MINICORE_IDENTITY_SERVICE_KEY;
  const key = 'clave-de-test-unicamente-no-produccion-123456';
  process.env.MINICORE_ESTANCIA_REGISTER_ENABLED = 'true';
  process.env.MINICORE_IDENTITY_SERVICE_KEY = key;
  const statements = [];
  let existing = false;
  pool.query = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.startsWith('SELECT')) return { rows: existing ? [{ id: 9 }] : [] };
    if (sql.includes('INSERT INTO public.users')) return { rows: [{ id: 802 }] };
    throw new Error('SQL inesperado');
  };
  const app = express();
  app.use(express.json());
  app.use('/internal/minicore-identity', require('../src/routes/minicoreIdentityRoutes'));
  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}/internal/minicore-identity/register`;
  const call = (body, withKey = true) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withKey ? {'x-minicore-service-key': key} : {}) },
    body: JSON.stringify(body),
  });
  try {
    assert.equal((await call({ email: 'a@b.com', password: '1234567890' }, false)).status, 401);
    assert.equal((await call({ email: 'a@b.com', password: '123' })).status, 400);
    const created = await call({ email: ' GANADERO@EXAMPLE.COM ', password: 'ClaveFuerte123' });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user_id, 802);
    const insert = statements.find(s => s.sql.includes('INSERT INTO public.users'));
    assert.ok(insert);
    assert.equal(insert.params[0], 'ganadero@example.com');
    assert.ok(insert.params[1].startsWith('$2'));
    assert.equal(await bcrypt.compare('ClaveFuerte123', insert.params[1]), true);
    assert.equal(statements.filter(s => /user_companies/i.test(s.sql)).length, 0);
    existing = true;
    assert.equal((await call({ email: 'ganadero@example.com', password: 'ClaveFuerte123' })).status, 409);
    console.log('OK: 401, 400, 201, hash bcrypt, sin empresa, 409');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.query = original;
    if (oldFlag === undefined) delete process.env.MINICORE_ESTANCIA_REGISTER_ENABLED;
    else process.env.MINICORE_ESTANCIA_REGISTER_ENABLED = oldFlag;
    if (oldKey === undefined) delete process.env.MINICORE_IDENTITY_SERVICE_KEY;
    else process.env.MINICORE_IDENTITY_SERVICE_KEY = oldKey;
  }
});
