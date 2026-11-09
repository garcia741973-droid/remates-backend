'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.name !== 'remates-backend') throw new Error('Esta carpeta no es remates-backend.');
const target = path.join(root, 'src/routes/minicoreIdentityRoutes.js');
const original = fs.readFileSync(target, 'utf8');
const mount = "router.use('/register', require('./minicoreIdentityRegistrationRoutes'));";
const anchor = '// Valida credenciales de una cuenta existente sin asignar empresas ni roles.';
if (!original.includes(anchor) || !original.includes('router.use(requireServiceKey);') ||
    !original.includes('router.use(rateLimit(')) {
  throw new Error('No coincide la ruta de identidad esperada; no se modifico nada.');
}
if (original.includes(mount)) {
  console.log('OK: registro ya integrado en Remates.');
  process.exit(0);
}
const updated = original.replace(anchor, `${mount}\n\n${anchor}`);
new vm.Script(updated, { filename: target });
fs.writeFileSync(target, updated, 'utf8');
console.log('OK: POST /internal/minicore-identity/register agregado.');
