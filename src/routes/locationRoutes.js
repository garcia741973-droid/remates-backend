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

  getProvinces,

  getMunicipalities,

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

/// 🗺️ PROVINCIAS
router.get(
  '/provinces/:departmentId',
  getProvinces
);

/// 🏘️ MUNICIPIOS
router.get(
  '/municipalities/:provinceId',
  getMunicipalities
);

module.exports =
  router;