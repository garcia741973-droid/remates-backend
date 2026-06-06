const express =
  require('express');

const router =
  express.Router();

const {

  getCountries,

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