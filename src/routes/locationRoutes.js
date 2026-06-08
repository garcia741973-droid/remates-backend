const express =
  require('express');

const router =
  express.Router();

const {

  getCountries,

  getAdminCountries,
  createCountry,
  updateCountry,
  toggleCountryStatus,

  getDepartments,

  getAdminDepartments,
  createDepartment,
  updateDepartment,
  toggleDepartmentStatus,

  getProvinces,

  getAdminProvinces,
  createProvince,
  updateProvince,
  toggleProvinceStatus,

  getMunicipalities,

  getAdminMunicipalities,
  createMunicipality,
  updateMunicipality,
  toggleMunicipalityStatus,

} = require(
  '../controllers/locationController'
);

/// 🌎 PAÍSES
router.get(
  '/countries',
  getCountries
);

/// 🌎 ADMIN PAÍSES
router.get(
  '/admin/countries',
  getAdminCountries
);

/// 🌎 CREAR PAÍS
router.post(
  '/countries',
  createCountry
);

/// 🌎 EDITAR PAÍS
router.put(
  '/countries/:id',
  updateCountry
);

/// 🌎 ACTIVAR / DESACTIVAR
router.patch(
  '/countries/:id/status',
  toggleCountryStatus
);

/// 🏛️ DEPARTAMENTOS
router.get(
  '/departments/:countryId',
  getDepartments
);

/// 🏛️ ADMIN DEPARTAMENTOS
router.get(
  '/admin/departments/:countryId',
  getAdminDepartments
);

/// 🏛️ CREAR DEPARTAMENTO
router.post(
  '/departments',
  createDepartment
);

/// 🏛️ EDITAR DEPARTAMENTO
router.put(
  '/departments/:id',
  updateDepartment
);

/// 🏛️ ACTIVAR / DESACTIVAR
router.patch(
  '/departments/:id/status',
  toggleDepartmentStatus
);

/// 🗺️ PROVINCIAS
router.get(
  '/provinces/:departmentId',
  getProvinces
);

/// 🗺️ ADMIN PROVINCIAS
router.get(
  '/admin/provinces/:departmentId',
  getAdminProvinces
);

/// 🗺️ CREAR PROVINCIA
router.post(
  '/provinces',
  createProvince
);

/// 🗺️ EDITAR PROVINCIA
router.put(
  '/provinces/:id',
  updateProvince
);

/// 🗺️ ACTIVAR / DESACTIVAR
router.patch(
  '/provinces/:id/status',
  toggleProvinceStatus
);

/// 🏘️ MUNICIPIOS
router.get(
  '/municipalities/:provinceId',
  getMunicipalities
);

/// 🏘️ ADMIN MUNICIPIOS
router.get(
  '/admin/municipalities/:provinceId',
  getAdminMunicipalities
);

/// 🏘️ CREAR MUNICIPIO
router.post(
  '/municipalities',
  createMunicipality
);

/// 🏘️ EDITAR MUNICIPIO
router.put(
  '/municipalities/:id',
  updateMunicipality
);

/// 🏘️ ACTIVAR / DESACTIVAR
router.patch(
  '/municipalities/:id/status',
  toggleMunicipalityStatus
);

module.exports =
  router;