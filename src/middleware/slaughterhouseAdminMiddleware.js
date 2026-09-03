const { pool } = require('../config/db');


// =====================================================
// 🔐 CARGAR CONTEXTO ADMIN FRIGORÍFICO
//
// NO depende de users.role.
// NO depende de user_companies.role.
//
// La autorización fina sale de:
//
// user_companies
//        ↓
// slaughterhouse_user_roles
//        ↓
// slaughterhouse_roles
//        ↓
// slaughterhouse_role_permissions
//        ↓
// slaughterhouse_permissions
// =====================================================

const loadSlaughterhouseAdminContext =
  async (req) => {

    const userId =
      Number(
        req.user?.user_id ??
        req.user?.id
      );

    const companyId =
      Number(
        req.user?.company_id
      );


    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !Number.isInteger(companyId) ||
      companyId <= 0
    ) {
      return null;
    }


    const result =
      await pool.query(
        `
          SELECT
            u.id
              AS user_id,

            u.name,
            u.full_name,
            u.email,
            u.phone,

            c.id
              AS company_id,

            c.name
              AS company_name,

            c.company_type,

            c.plant_lat,
            c.plant_lng,

            COALESCE(
              ARRAY_AGG(
                DISTINCT sr.code
              ) FILTER (
                WHERE sr.code IS NOT NULL
              ),
              ARRAY[]::VARCHAR[]
            )
              AS roles,

            COALESCE(
              ARRAY_AGG(
                DISTINCT sp.code
              ) FILTER (
                WHERE sp.code IS NOT NULL
              ),
              ARRAY[]::VARCHAR[]
            )
              AS permissions

          FROM users u

          JOIN user_companies uc
            ON uc.user_id = u.id

          JOIN companies c
            ON c.id = uc.company_id

          JOIN slaughterhouse_user_roles sur
            ON sur.user_id = u.id
            AND sur.company_id = c.id

          JOIN slaughterhouse_roles sr
            ON sr.id = sur.role_id
            AND sr.company_id = c.id
            AND sr.is_active = true

          LEFT JOIN slaughterhouse_role_permissions srp
            ON srp.role_id = sr.id

          LEFT JOIN slaughterhouse_permissions sp
            ON sp.id = srp.permission_id

          WHERE
            u.id = $1
            AND c.id = $2

            AND u.is_active = true

            AND uc.company_status = 'approved'

            AND c.company_type = 'slaughterhouse'
            AND c.is_active = true

          GROUP BY
            u.id,
            u.name,
            u.full_name,
            u.email,
            u.phone,

            c.id,
            c.name,
            c.company_type,
            c.plant_lat,
            c.plant_lng

          LIMIT 1
        `,
        [
          userId,
          companyId,
        ],
      );


    if (
      result.rows.length === 0
    ) {
      return null;
    }


    return result.rows[0];
  };


// =====================================================
// 🔐 REQUIERE ACCESO AL ADMIN FRIGORÍFICOS
// =====================================================

const requireSlaughterhouseAdmin =
  async (req, res, next) => {

    try {

      const context =
        await loadSlaughterhouseAdminContext(
          req
        );


      if (!context) {

        return res.status(403).json({
          error:
            'No autorizado para Admin Frigoríficos',
        });

      }


      req.slaughterhouseAdmin =
        context;


      return next();

    } catch (error) {

      console.error(
        'SLAUGHTERHOUSE ADMIN AUTH ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error validando acceso al Admin Frigoríficos',
      });

    }

  };


// =====================================================
// 🔐 REQUIERE PERMISO ESPECÍFICO
//
// Ejemplo:
//
// requireSlaughterhousePermission(
//   'people.manage'
// )
//
// =====================================================

const requireSlaughterhousePermission =
  (permissionCode) => {

    return async (
      req,
      res,
      next
    ) => {

      try {

        let context =
          req.slaughterhouseAdmin;


        if (!context) {

          context =
            await loadSlaughterhouseAdminContext(
              req
            );

        }


        if (!context) {

          return res.status(403).json({
            error:
              'No autorizado para Admin Frigoríficos',
          });

        }


        const permissions =
          Array.isArray(
            context.permissions
          )
            ? context.permissions
            : [];


        if (
          !permissions.includes(
            permissionCode
          )
        ) {

          return res.status(403).json({
            error:
              'No tienes permiso para realizar esta acción',
            permission:
              permissionCode,
          });

        }


        req.slaughterhouseAdmin =
          context;


        return next();

      } catch (error) {

        console.error(
          'SLAUGHTERHOUSE PERMISSION ERROR:',
          error
        );


        return res.status(500).json({
          error:
            'Error validando permisos',
        });

      }

    };

  };


module.exports = {

  loadSlaughterhouseAdminContext,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission,

};