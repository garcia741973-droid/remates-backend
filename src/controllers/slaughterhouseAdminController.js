const { pool } = require('../config/db');


// =====================================================
// 👤 SESIÓN ADMIN FRIGORÍFICOS
// GET /slaughterhouse/admin/session
// =====================================================

exports.getAdminSession =
  async (req, res) => {

    try {

      const admin =
        req.slaughterhouseAdmin;


      return res.json({
        success: true,

        user: {
          id:
            Number(admin.user_id),

          name:
            admin.full_name ||
            admin.name,

          email:
            admin.email,

          phone:
            admin.phone,
        },

        company: {
          id:
            Number(admin.company_id),

          name:
            admin.company_name,

          type:
            admin.company_type,

          plant_lat:
            admin.plant_lat,

          plant_lng:
            admin.plant_lng,
        },

        roles:
          admin.roles || [],

        permissions:
          admin.permissions || [],
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ADMIN SESSION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo sesión del Admin Frigoríficos',
      });

    }

  };


// =====================================================
// 📊 DASHBOARD
// GET /slaughterhouse/admin/dashboard
// =====================================================

exports.getAdminDashboard =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const result =
        await pool.query(
          `
            SELECT

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_people sp
                WHERE
                  sp.company_id = $1
                  AND sp.is_active = true
              )
                AS active_people,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_purchase_lots spl
                WHERE
                  spl.company_id = $1
                  AND spl.status NOT IN (
                    'completed',
                    'cancelled'
                  )
              )
                AS active_purchase_lots,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_troops st
                WHERE
                  st.company_id = $1
                  AND st.status NOT IN (
                    'completed',
                    'cancelled'
                  )
              )
                AS active_troops,

              (
                SELECT COUNT(*)::int
                FROM transport_requests tr
                WHERE
                  tr.requester_company_id = $1
                  AND tr.status = 'open'
              )
                AS open_transport_requests,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_receptions sr
                WHERE
                  sr.company_id = $1
                  AND sr.status = 'open'
              )
                AS open_receptions,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_receptions sr
                WHERE
                  sr.company_id = $1
                  AND sr.status = 'in_slaughter'
              )
                AS active_slaughters,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_preliquidations sp
                WHERE
                  sp.company_id = $1
                  AND sp.status IN (
                    'draft',
                    'reviewed'
                  )
              )
                AS pending_preliquidations,

              (
                SELECT
                  COALESCE(
                    SUM(tcu.amount),
                    0
                  )::numeric
                FROM transport_corporate_usage tcu
                JOIN transport_corporate_accounts tca
                  ON tca.id =
                    tcu.corporate_account_id
                WHERE
                  tca.company_id = $1
                  AND tcu.status = 'unbilled'
              )
                AS transport_unbilled_amount
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        company: {
          id:
            companyId,

          name:
            req.slaughterhouseAdmin
              .company_name,
        },

        dashboard:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ADMIN DASHBOARD ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo dashboard de frigorífico',
      });

    }

  };


// =====================================================
// 👥 LISTAR PERSONAS
// GET /slaughterhouse/admin/people
//
// Opcional:
// ?q=jacob
// ?role=seller
// =====================================================

exports.getPeople =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const q =
        req.query.q
          ?.toString()
          .trim() || null;


      const role =
        req.query.role
          ?.toString()
          .trim() || null;


      const result =
        await pool.query(
          `
            SELECT
              sp.id,
              sp.user_id,
              sp.person_type,
              sp.full_name,
              sp.document_type,
              sp.document_number,
              sp.phone,
              sp.email,
              sp.export_enabled,
              sp.notes,
              sp.is_active,
              sp.created_at,
              sp.updated_at,

              COALESCE(
                ARRAY_AGG(
                  DISTINCT spr.role
                ) FILTER (
                  WHERE
                    spr.role IS NOT NULL
                    AND spr.is_active = true
                ),
                ARRAY[]::VARCHAR[]
              )
                AS roles,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_estates se
                WHERE
                  se.seller_person_id = sp.id
                  AND se.is_active = true
              )
                AS estates_count,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_person_payment_methods sppm
                WHERE
                  sppm.person_id = sp.id
                  AND sppm.is_active = true
              )
                AS payment_methods_count

            FROM slaughterhouse_people sp

            LEFT JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id

            WHERE
              sp.company_id = $1

              AND (
                $2::text IS NULL
                OR sp.full_name ILIKE
                  '%' || $2 || '%'
                OR sp.document_number ILIKE
                  '%' || $2 || '%'
                OR sp.phone ILIKE
                  '%' || $2 || '%'
              )

              AND (
                $3::text IS NULL
                OR EXISTS (
                  SELECT 1
                  FROM slaughterhouse_person_roles spr2
                  WHERE
                    spr2.person_id = sp.id
                    AND spr2.role = $3
                    AND spr2.is_active = true
                )
              )

            GROUP BY
              sp.id

            ORDER BY
              sp.is_active DESC,
              sp.full_name ASC,
              sp.id ASC
          `,
          [
            companyId,
            q,
            role,
          ],
        );


      return res.json({
        success: true,
        count:
          result.rows.length,
        people:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE PEOPLE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo personas del frigorífico',
      });

    }

  };


// =====================================================
// ➕ CREAR PERSONA / ENTIDAD
// POST /slaughterhouse/admin/people
//
// Body ejemplo:
//
// {
//   "full_name": "Juan Pérez",
//   "person_type": "natural",
//   "document_type": "CI",
//   "document_number": "1234567",
//   "phone": "77777777",
//   "email": null,
//   "export_enabled": false,
//   "roles": ["seller"],
//   "notes": null
// }
//
// Roles:
//
// seller
// captador
// commissioner
// transporter
// driver
// =====================================================

exports.createPerson =
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const userId =
        Number(
          req.slaughterhouseAdmin.user_id
        );


      const fullName =
        req.body.full_name
          ?.toString()
          .trim();


      const personType =
        req.body.person_type
          ?.toString()
          .trim() ||
        'natural';


      const documentType =
        req.body.document_type
          ?.toString()
          .trim() ||
        null;


      const documentNumber =
        req.body.document_number
          ?.toString()
          .trim() ||
        null;


      const phone =
        req.body.phone
          ?.toString()
          .trim() ||
        null;


      const email =
        req.body.email
          ?.toString()
          .trim()
          .toLowerCase() ||
        null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      const exportEnabled =
        req.body.export_enabled === true;


      const roles =
        Array.isArray(
          req.body.roles
        )
          ? [
              ...new Set(
                req.body.roles
                  .map(
                    (value) =>
                      value
                        ?.toString()
                        .trim()
                        .toLowerCase()
                  )
                  .filter(Boolean)
              ),
            ]
          : [];


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!fullName) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      if (
        ![
          'natural',
          'company',
        ].includes(
          personType
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de persona inválido',
        });

      }


      const allowedRoles =
        [
          'seller',
          'captador',
          'commissioner',
          'transporter',
          'driver',
        ];


      const invalidRole =
        roles.find(
          (item) =>
            !allowedRoles.includes(
              item
            )
        );


      if (invalidRole) {

        return res.status(400).json({
          error:
            `Rol inválido: ${invalidRole}`,
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // PERSONA
      // =================================================

      const personResult =
        await client.query(
          `
            INSERT INTO slaughterhouse_people (
              company_id,
              person_type,
              full_name,
              document_type,
              document_number,
              phone,
              email,
              export_enabled,
              notes,
              created_by
            )
            VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10
            )
            RETURNING *
          `,
          [
            companyId,
            personType,
            fullName,
            documentType,
            documentNumber,
            phone,
            email,
            exportEnabled,
            notes,
            userId,
          ],
        );


      const person =
        personResult.rows[0];


      // =================================================
      // ROLES
      // =================================================

      for (
        const role of roles
      ) {

        await client.query(
          `
            INSERT INTO slaughterhouse_person_roles (
              person_id,
              role
            )
            VALUES (
              $1,
              $2
            )
            ON CONFLICT (
              person_id,
              role
            )
            DO NOTHING
          `,
          [
            person.id,
            role,
          ],
        );

      }


      // =================================================
      // AUDITORÍA
      // =================================================

      await client.query(
        `
          INSERT INTO slaughterhouse_audit_log (
            company_id,
            user_id,
            entity_type,
            entity_id,
            action,
            new_data
          )
          VALUES (
            $1,
            $2,
            'person',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            person.id
          ),
          JSON.stringify({
            ...person,
            roles,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Persona creada correctamente',

        person: {
          ...person,
          roles,
        },
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE PERSON ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una persona con ese documento en este frigorífico',
        });

      }


      return res.status(500).json({
        error:
          'Error creando persona',
      });

    } finally {

      client.release();

    }

  };