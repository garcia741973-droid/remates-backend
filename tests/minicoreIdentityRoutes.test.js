'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');

// Prueba aislada: reemplaza la conexion a PostgreSQL por una respuesta en memoria.
// No abre una conexion a la base de datos ni crea usuarios reales.
test('API de identidad: acceso autorizado y credenciales', async () => {
  const serviceKey = 'clave-exclusivamente-local-para-test-123456789';
  const email = 'ganadero@example.test';
  const password = 'PruebaLocalSegura123!';
  const passwordHash = await bcrypt.hash(password, 4);
  let consultas = 0;

  const dbModule = require.resolve('../src/config/db');
  const previousDbModule = require.cache[dbModule];
  require.cache[dbModule] = {
    id: dbModule,
    filename: dbModule,
    loaded: true,
    exports: {
      pool: {
        query: async (sql, params) => {
          consultas += 1;
          assert.match(sql, /is_active\s*=\s*true/i);
          return {
            rows: params[0] === email
              ? [{ id: 424242, password: passwordHash }]
              : [],
          };
        },
      },
    },
  };

  const previousKey = process.env.MINICORE_IDENTITY_SERVICE_KEY;
  process.env.MINICORE_IDENTITY_SERVICE_KEY = serviceKey;

  const app = express();
  app.use(express.json());
  app.use('/internal/minicore-identity', require('../src/routes/minicoreIdentityRoutes'));
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const url = `http://127.0.0.1:${server.address().port}/internal/minicore-identity/verify`;
    async function send(data, key = serviceKey) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-minicore-service-key': key,
        },
        body: JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    }

    const blocked = await send({ email, password }, 'clave-incorrecta');
    assert.equal(blocked.status, 401);
    assert.equal(consultas, 0, 'No debe consultar la base con una clave de servicio incorrecta');

    const invalid = await send({ email, password: '' });
    assert.equal(invalid.status, 400);
    assert.equal(consultas, 0, 'No debe consultar la base con datos invalidos');

    const correct = await send({ email: email.toUpperCase(), password });
    assert.equal(correct.status, 200);
    assert.deepEqual(correct.body, { success: true, user_id: 424242 });

    const wrongPassword = await send({ email, password: 'ClaveEquivocada' });
    assert.equal(wrongPassword.status, 401);

    const unknown = await send({ email: 'otro@example.test', password });
    assert.equal(unknown.status, 401);

    console.log('PRUEBA LOCAL OK: 401 clave, 400 datos, 200 login, 401 password, 401 usuario');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousDbModule) require.cache[dbModule] = previousDbModule;
    else delete require.cache[dbModule];
    if (previousKey === undefined) delete process.env.MINICORE_IDENTITY_SERVICE_KEY;
    else process.env.MINICORE_IDENTITY_SERVICE_KEY = previousKey;
  }
});
