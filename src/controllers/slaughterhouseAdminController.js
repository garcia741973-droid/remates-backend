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

// =====================================================
// 👤 DETALLE PERSONA / ENTIDAD
// GET /slaughterhouse/admin/people/:id
// =====================================================

exports.getPersonById =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const personId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


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
              sp.created_by,
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
              sp.id = $1
              AND sp.company_id = $2

            GROUP BY
              sp.id

            LIMIT 1
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Persona no encontrada',
        });

      }


      return res.json({
        success: true,
        person:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE PERSON BY ID ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo persona',
      });

    }

  };  

// =====================================================
// ✏️ EDITAR PERSONA / ENTIDAD
// PUT /slaughterhouse/admin/people/:id
// =====================================================

exports.updatePerson =
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


      const personId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


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
      // VERIFICAR PERSONA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT
              sp.*,

              COALESCE(
                ARRAY_AGG(
                  spr.role
                ) FILTER (
                  WHERE
                    spr.role IS NOT NULL
                    AND spr.is_active = true
                ),
                ARRAY[]::VARCHAR[]
              )
                AS roles

            FROM slaughterhouse_people sp

            LEFT JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id

            WHERE
              sp.id = $1
              AND sp.company_id = $2

            GROUP BY
              sp.id
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Persona no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR PERSONA
      // =================================================

      const personResult =
        await client.query(
          `
            UPDATE slaughterhouse_people

            SET
              person_type = $1,
              full_name = $2,
              document_type = $3,
              document_number = $4,
              phone = $5,
              email = $6,
              export_enabled = $7,
              notes = $8,
              updated_at = NOW()

            WHERE
              id = $9
              AND company_id = $10

            RETURNING *
          `,
          [
            personType,
            fullName,
            documentType,
            documentNumber,
            phone,
            email,
            exportEnabled,
            notes,
            personId,
            companyId,
          ],
        );


      const person =
        personResult.rows[0];


      // =================================================
      // DESACTIVAR ROLES ANTERIORES
      // =================================================

      await client.query(
        `
          UPDATE slaughterhouse_person_roles

          SET
            is_active = false

          WHERE
            person_id = $1
        `,
        [
          personId,
        ],
      );


      // =================================================
      // ACTIVAR ROLES NUEVOS
      // =================================================

      for (
        const role of roles
      ) {

        await client.query(
          `
            INSERT INTO slaughterhouse_person_roles (
              person_id,
              role,
              is_active
            )

            VALUES (
              $1,
              $2,
              true
            )

            ON CONFLICT (
              person_id,
              role
            )

            DO UPDATE SET
              is_active = true
          `,
          [
            personId,
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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'person',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            personId
          ),
          JSON.stringify(
            previous
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


      return res.json({
        success: true,

        message:
          'Persona actualizada correctamente',

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
        'UPDATE SLAUGHTERHOUSE PERSON ERROR:',
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
          'Error actualizando persona',
      });

    } finally {

      client.release();

    }

  };  

// =====================================================
// 🔄 ACTIVAR / DESACTIVAR PERSONA
// PATCH /slaughterhouse/admin/people/:id/active
// =====================================================

exports.setPersonActive =
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


      const personId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // PERSONA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *
            FROM slaughterhouse_people

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Persona no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_people

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            personId,
            companyId,
          ],
        );


      const person =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'person',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            personId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            person
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Persona activada correctamente'
            : 'Persona desactivada correctamente',

        person,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE PERSON ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado de persona',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🏡 LISTAR ESTANCIAS
// GET /slaughterhouse/admin/estates
//
// Opcional:
// ?q=monasterio
// ?seller_id=15
// =====================================================

exports.getEstates =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const q =
        req.query.q
          ?.toString()
          .trim() ||
        null;


      const sellerIdRaw =
        req.query.seller_id;


      const sellerId =
        sellerIdRaw !== undefined &&
        sellerIdRaw !== null &&
        sellerIdRaw !== ''
          ? Number(
              sellerIdRaw
            )
          : null;


      if (
        sellerId !== null &&
        (
          !Number.isInteger(
            sellerId
          ) ||
          sellerId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'seller_id inválido',
        });

      }


      const result =
        await pool.query(
          `
            SELECT
              se.id,
              se.company_id,
              se.seller_person_id,
              se.name,
              se.location_text,
              se.senasag_predio_number,
              se.lat,
              se.lng,
              se.notes,
              se.is_active,
              se.created_by,
              se.created_at,
              se.updated_at,

              sp.full_name
                AS seller_name,

              sp.document_type
                AS seller_document_type,

              sp.document_number
                AS seller_document_number,

              sp.phone
                AS seller_phone

            FROM slaughterhouse_estates se

            LEFT JOIN slaughterhouse_people sp
              ON sp.id =
                se.seller_person_id
              AND sp.company_id =
                se.company_id

            WHERE
              se.company_id = $1

              AND (
                $2::text IS NULL
                OR se.name ILIKE
                  '%' || $2 || '%'
                OR se.location_text ILIKE
                  '%' || $2 || '%'
                OR se.senasag_predio_number ILIKE
                  '%' || $2 || '%'
                OR sp.full_name ILIKE
                  '%' || $2 || '%'
              )

              AND (
                $3::int IS NULL
                OR se.seller_person_id = $3
              )

            ORDER BY
              se.is_active DESC,
              se.name ASC,
              se.id ASC
          `,
          [
            companyId,
            q,
            sellerId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        estates:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ESTATES ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo estancias',
      });

    }

  };  

// =====================================================
// ➕ CREAR ESTANCIA
// POST /slaughterhouse/admin/estates
//
// Body ejemplo:
//
// {
//   "seller_person_id": 12,
//   "name": "Estancia El Carmen",
//   "location_text": "San Ignacio de Velasco",
//   "senasag_predio_number": "SCZ-12345",
//   "lat": -16.3765,
//   "lng": -60.9632,
//   "notes": null
// }
// =====================================================

exports.createEstate =
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


      const name =
        req.body.name
          ?.toString()
          .trim();


      const sellerPersonIdRaw =
        req.body.seller_person_id;


      const sellerPersonId =
        sellerPersonIdRaw !== undefined &&
        sellerPersonIdRaw !== null &&
        sellerPersonIdRaw !== ''
          ? Number(
              sellerPersonIdRaw
            )
          : null;


      const locationText =
        req.body.location_text
          ?.toString()
          .trim() ||
        null;


      const senasagPredioNumber =
        req.body.senasag_predio_number
          ?.toString()
          .trim() ||
        null;


      const latRaw =
        req.body.lat;


      const lngRaw =
        req.body.lng;


      const lat =
        latRaw !== undefined &&
        latRaw !== null &&
        latRaw !== ''
          ? Number(
              latRaw
            )
          : null;


      const lng =
        lngRaw !== undefined &&
        lngRaw !== null &&
        lngRaw !== ''
          ? Number(
              lngRaw
            )
          : null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!name) {

        return res.status(400).json({
          error:
            'El nombre de la estancia es obligatorio',
        });

      }


      if (
        sellerPersonId !== null &&
        (
          !Number.isInteger(
            sellerPersonId
          ) ||
          sellerPersonId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'seller_person_id inválido',
        });

      }


      if (
        lat !== null &&
        (
          !Number.isFinite(lat) ||
          lat < -90 ||
          lat > 90
        )
      ) {

        return res.status(400).json({
          error:
            'Latitud inválida',
        });

      }


      if (
        lng !== null &&
        (
          !Number.isFinite(lng) ||
          lng < -180 ||
          lng > 180
        )
      ) {

        return res.status(400).json({
          error:
            'Longitud inválida',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR VENDEDOR
      // =================================================

      if (
        sellerPersonId !== null
      ) {

        const sellerResult =
          await client.query(
            `
              SELECT
                sp.id

              FROM slaughterhouse_people sp

              WHERE
                sp.id = $1
                AND sp.company_id = $2
                AND sp.is_active = true

                AND EXISTS (
                  SELECT 1

                  FROM slaughterhouse_person_roles spr

                  WHERE
                    spr.person_id = sp.id
                    AND spr.role = 'seller'
                    AND spr.is_active = true
                )

              LIMIT 1
            `,
            [
              sellerPersonId,
              companyId,
            ],
          );


        if (
          sellerResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El vendedor no existe, está inactivo o no tiene rol seller',
          });

        }

      }


      // =================================================
      // CREAR ESTANCIA
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_estates (
              company_id,
              seller_person_id,
              name,
              location_text,
              senasag_predio_number,
              lat,
              lng,
              notes,
              created_by
            )

            VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9
            )

            RETURNING *
          `,
          [
            companyId,
            sellerPersonId,
            name,
            locationText,
            senasagPredioNumber,
            lat,
            lng,
            notes,
            userId,
          ],
        );


      const estate =
        result.rows[0];


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
            'estate',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            estate.id
          ),
          JSON.stringify(
            estate
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Estancia creada correctamente',

        estate,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE ESTATE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error creando estancia',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ✏️ EDITAR ESTANCIA
// PUT /slaughterhouse/admin/estates/:id
// =====================================================

exports.updateEstate =
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


      const estateId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(estateId) ||
        estateId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de estancia inválido',
        });

      }


      const name =
        req.body.name
          ?.toString()
          .trim();


      const sellerPersonIdRaw =
        req.body.seller_person_id;


      const sellerPersonId =
        sellerPersonIdRaw !== undefined &&
        sellerPersonIdRaw !== null &&
        sellerPersonIdRaw !== ''
          ? Number(
              sellerPersonIdRaw
            )
          : null;


      const locationText =
        req.body.location_text
          ?.toString()
          .trim() ||
        null;


      const senasagPredioNumber =
        req.body.senasag_predio_number
          ?.toString()
          .trim() ||
        null;


      const latRaw =
        req.body.lat;


      const lngRaw =
        req.body.lng;


      const lat =
        latRaw !== undefined &&
        latRaw !== null &&
        latRaw !== ''
          ? Number(
              latRaw
            )
          : null;


      const lng =
        lngRaw !== undefined &&
        lngRaw !== null &&
        lngRaw !== ''
          ? Number(
              lngRaw
            )
          : null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!name) {

        return res.status(400).json({
          error:
            'El nombre de la estancia es obligatorio',
        });

      }


      if (
        sellerPersonId !== null &&
        (
          !Number.isInteger(
            sellerPersonId
          ) ||
          sellerPersonId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'seller_person_id inválido',
        });

      }


      if (
        lat !== null &&
        (
          !Number.isFinite(lat) ||
          lat < -90 ||
          lat > 90
        )
      ) {

        return res.status(400).json({
          error:
            'Latitud inválida',
        });

      }


      if (
        lng !== null &&
        (
          !Number.isFinite(lng) ||
          lng < -180 ||
          lng > 180
        )
      ) {

        return res.status(400).json({
          error:
            'Longitud inválida',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // ESTANCIA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *
            FROM slaughterhouse_estates

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            estateId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Estancia no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // VALIDAR VENDEDOR
      // =================================================

      if (
        sellerPersonId !== null
      ) {

        const sellerResult =
          await client.query(
            `
              SELECT
                sp.id

              FROM slaughterhouse_people sp

              WHERE
                sp.id = $1
                AND sp.company_id = $2
                AND sp.is_active = true

                AND EXISTS (
                  SELECT 1

                  FROM slaughterhouse_person_roles spr

                  WHERE
                    spr.person_id = sp.id
                    AND spr.role = 'seller'
                    AND spr.is_active = true
                )

              LIMIT 1
            `,
            [
              sellerPersonId,
              companyId,
            ],
          );


        if (
          sellerResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El vendedor no existe, está inactivo o no tiene rol seller',
          });

        }

      }


      // =================================================
      // ACTUALIZAR ESTANCIA
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_estates

            SET
              seller_person_id = $1,
              name = $2,
              location_text = $3,
              senasag_predio_number = $4,
              lat = $5,
              lng = $6,
              notes = $7,
              updated_at = NOW()

            WHERE
              id = $8
              AND company_id = $9

            RETURNING *
          `,
          [
            sellerPersonId,
            name,
            locationText,
            senasagPredioNumber,
            lat,
            lng,
            notes,
            estateId,
            companyId,
          ],
        );


      const estate =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'estate',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            estateId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            estate
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Estancia actualizada correctamente',

        estate,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE ESTATE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error actualizando estancia',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🔄 ACTIVAR / DESACTIVAR ESTANCIA
// PATCH /slaughterhouse/admin/estates/:id/active
// =====================================================

exports.setEstateActive =
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


      const estateId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(estateId) ||
        estateId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de estancia inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // ESTANCIA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *
            FROM slaughterhouse_estates

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            estateId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Estancia no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_estates

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            estateId,
            companyId,
          ],
        );


      const estate =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'estate',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            estateId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            estate
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Estancia activada correctamente'
            : 'Estancia desactivada correctamente',

        estate,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE ESTATE ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado de estancia',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🏦 LISTAR BANCOS
// GET /slaughterhouse/admin/banks
// =====================================================

exports.getBanks =
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
            SELECT
              id,
              name,
              is_active,
              created_at

            FROM slaughterhouse_banks

            ORDER BY
              is_active DESC,
              name ASC,
              id ASC
          `
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        banks:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE BANKS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo bancos',
      });

    }

  };
  
// =====================================================
// ➕ CREAR BANCO
// POST /slaughterhouse/admin/banks
//
// Body:
// {
//   "name": "Banco Ganadero"
// }
// =====================================================

exports.createBank =
  async (req, res) => {

    try {

      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre del banco es obligatorio',
        });

      }


      const result =
        await pool.query(
          `
            INSERT INTO slaughterhouse_banks (
              name
            )

            VALUES (
              $1
            )

            RETURNING
              id,
              name,
              is_active,
              created_at
          `,
          [
            name,
          ],
        );


      return res.status(201).json({
        success: true,

        message:
          'Banco creado correctamente',

        bank:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE BANK ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe un banco con ese nombre',
        });

      }


      return res.status(500).json({
        error:
          'Error creando banco',
      });

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR BANCO
// PATCH /slaughterhouse/admin/banks/:id/active
// =====================================================

exports.setBankActive =
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


      const bankId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(bankId) ||
        bankId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de banco inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // BANCO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT
              id,
              name,
              is_active,
              created_at

            FROM slaughterhouse_banks

            WHERE
              id = $1

            LIMIT 1
          `,
          [
            bankId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Banco no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_banks

            SET
              is_active = $1

            WHERE
              id = $2

            RETURNING
              id,
              name,
              is_active,
              created_at
          `,
          [
            isActive,
            bankId,
          ],
        );


      const bank =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'bank',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            bankId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            bank
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Banco activado correctamente'
            : 'Banco desactivado correctamente',

        bank,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE BANK ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado del banco',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💳 LISTAR MEDIOS DE PAGO DE PERSONA
// GET /slaughterhouse/admin/people/:id/payment-methods
// =====================================================

exports.getPersonPaymentMethods =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const personId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


      // =================================================
      // VERIFICAR PERSONA DE ESTE FRIGORÍFICO
      // =================================================

      const personResult =
        await pool.query(
          `
            SELECT
              id,
              full_name,
              is_active

            FROM slaughterhouse_people

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        personResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Persona no encontrada',
        });

      }


      // =================================================
      // MEDIOS DE PAGO
      // =================================================

      const result =
        await pool.query(
          `
            SELECT
              sppm.id,
              sppm.person_id,
              sppm.method_type,
              sppm.bank_id,

              sb.name
                AS bank_name,

              sppm.account_number,
              sppm.account_type,
              sppm.account_holder,
              sppm.wallet_phone,
              sppm.wallet_name,
              sppm.notes,
              sppm.is_default,
              sppm.is_active,
              sppm.created_at,
              sppm.updated_at

            FROM slaughterhouse_person_payment_methods sppm

            LEFT JOIN slaughterhouse_banks sb
              ON sb.id =
                sppm.bank_id

            WHERE
              sppm.person_id = $1

            ORDER BY
              sppm.is_active DESC,
              sppm.is_default DESC,
              sppm.id ASC
          `,
          [
            personId,
          ],
        );


      return res.json({
        success: true,

        person: {
          id:
            Number(
              personResult.rows[0].id
            ),

          full_name:
            personResult.rows[0]
              .full_name,
        },

        count:
          result.rows.length,

        payment_methods:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE PERSON PAYMENT METHODS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo medios de pago',
      });

    }

  }; 
  
// =====================================================
// ➕ CREAR MEDIO DE PAGO DE PERSONA
// POST /slaughterhouse/admin/people/:id/payment-methods
//
// method_type:
// bank_account
// qr
// mobile_wallet
// check
// other
// =====================================================

exports.createPersonPaymentMethod =
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


      const personId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


      const methodType =
        req.body.method_type
          ?.toString()
          .trim()
          .toLowerCase();


      const bankIdRaw =
        req.body.bank_id;


      const bankId =
        bankIdRaw !== undefined &&
        bankIdRaw !== null &&
        bankIdRaw !== ''
          ? Number(
              bankIdRaw
            )
          : null;


      const accountNumber =
        req.body.account_number
          ?.toString()
          .trim() ||
        null;


      const accountType =
        req.body.account_type
          ?.toString()
          .trim() ||
        null;


      const accountHolder =
        req.body.account_holder
          ?.toString()
          .trim() ||
        null;


      const walletPhone =
        req.body.wallet_phone
          ?.toString()
          .trim() ||
        null;


      const walletName =
        req.body.wallet_name
          ?.toString()
          .trim() ||
        null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      const isDefault =
        req.body.is_default === true;


      // =================================================
      // VALIDACIONES
      // =================================================

      const allowedTypes =
        [
          'bank_account',
          'qr',
          'mobile_wallet',
          'check',
          'other',
        ];


      if (
        !methodType ||
        !allowedTypes.includes(
          methodType
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de medio de pago inválido',
        });

      }


      if (
        bankId !== null &&
        (
          !Number.isInteger(bankId) ||
          bankId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'bank_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR PERSONA DE ESTE FRIGORÍFICO
      // =================================================

      const personResult =
        await client.query(
          `
            SELECT
              id,
              full_name

            FROM slaughterhouse_people

            WHERE
              id = $1
              AND company_id = $2
              AND is_active = true

            LIMIT 1
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        personResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Persona no encontrada o inactiva',
        });

      }


      // =================================================
      // VALIDAR BANCO SI FUE ENVIADO
      // =================================================

      if (
        bankId !== null
      ) {

        const bankResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_banks

              WHERE
                id = $1
                AND is_active = true

              LIMIT 1
            `,
            [
              bankId,
            ],
          );


        if (
          bankResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'Banco no encontrado o inactivo',
          });

        }

      }


      // =================================================
      // SI ES PREDETERMINADO,
      // QUITAR PREDETERMINADO ANTERIOR
      // =================================================

      if (
        isDefault
      ) {

        await client.query(
          `
            UPDATE slaughterhouse_person_payment_methods

            SET
              is_default = false,
              updated_at = NOW()

            WHERE
              person_id = $1
              AND is_default = true
          `,
          [
            personId,
          ],
        );

      }


      // =================================================
      // CREAR MEDIO DE PAGO
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_person_payment_methods (
              person_id,
              method_type,
              bank_id,
              account_number,
              account_type,
              account_holder,
              wallet_phone,
              wallet_name,
              notes,
              is_default
            )

            VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10
            )

            RETURNING *
          `,
          [
            personId,
            methodType,
            bankId,
            accountNumber,
            accountType,
            accountHolder,
            walletPhone,
            walletName,
            notes,
            isDefault,
          ],
        );


      const paymentMethod =
        result.rows[0];


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
            'person_payment_method',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            paymentMethod.id
          ),
          JSON.stringify(
            paymentMethod
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Medio de pago creado correctamente',

        payment_method:
          paymentMethod,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE PERSON PAYMENT METHOD ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error creando medio de pago',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ✏️ EDITAR MEDIO DE PAGO DE PERSONA
// PUT /slaughterhouse/admin/people/:id/payment-methods/:methodId
// =====================================================

exports.updatePersonPaymentMethod =
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


      const personId =
        Number(
          req.params.id
        );


      const methodId =
        Number(
          req.params.methodId
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


      if (
        !Number.isInteger(methodId) ||
        methodId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de medio de pago inválido',
        });

      }


      const methodType =
        req.body.method_type
          ?.toString()
          .trim()
          .toLowerCase();


      const bankIdRaw =
        req.body.bank_id;


      const bankId =
        bankIdRaw !== undefined &&
        bankIdRaw !== null &&
        bankIdRaw !== ''
          ? Number(
              bankIdRaw
            )
          : null;


      const accountNumber =
        req.body.account_number
          ?.toString()
          .trim() ||
        null;


      const accountType =
        req.body.account_type
          ?.toString()
          .trim() ||
        null;


      const accountHolder =
        req.body.account_holder
          ?.toString()
          .trim() ||
        null;


      const walletPhone =
        req.body.wallet_phone
          ?.toString()
          .trim() ||
        null;


      const walletName =
        req.body.wallet_name
          ?.toString()
          .trim() ||
        null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      const isDefault =
        req.body.is_default === true;


      // =================================================
      // VALIDACIONES
      // =================================================

      const allowedTypes =
        [
          'bank_account',
          'qr',
          'mobile_wallet',
          'check',
          'other',
        ];


      if (
        !methodType ||
        !allowedTypes.includes(
          methodType
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de medio de pago inválido',
        });

      }


      if (
        bankId !== null &&
        (
          !Number.isInteger(bankId) ||
          bankId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'bank_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR PERSONA
      // =================================================

      const personResult =
        await client.query(
          `
            SELECT id

            FROM slaughterhouse_people

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        personResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Persona no encontrada',
        });

      }


      // =================================================
      // MEDIO DE PAGO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_person_payment_methods

            WHERE
              id = $1
              AND person_id = $2

            LIMIT 1
          `,
          [
            methodId,
            personId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Medio de pago no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // VALIDAR BANCO
      // =================================================

      if (
        bankId !== null
      ) {

        const bankResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_banks

              WHERE
                id = $1
                AND is_active = true

              LIMIT 1
            `,
            [
              bankId,
            ],
          );


        if (
          bankResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'Banco no encontrado o inactivo',
          });

        }

      }


      // =================================================
      // SI SERÁ PREDETERMINADO,
      // QUITAR PREDETERMINADO A LOS DEMÁS
      // =================================================

      if (
        isDefault
      ) {

        await client.query(
          `
            UPDATE slaughterhouse_person_payment_methods

            SET
              is_default = false,
              updated_at = NOW()

            WHERE
              person_id = $1
              AND id <> $2
              AND is_default = true
          `,
          [
            personId,
            methodId,
          ],
        );

      }


      // =================================================
      // ACTUALIZAR MEDIO DE PAGO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_person_payment_methods

            SET
              method_type = $1,
              bank_id = $2,
              account_number = $3,
              account_type = $4,
              account_holder = $5,
              wallet_phone = $6,
              wallet_name = $7,
              notes = $8,
              is_default = $9,
              updated_at = NOW()

            WHERE
              id = $10
              AND person_id = $11

            RETURNING *
          `,
          [
            methodType,
            bankId,
            accountNumber,
            accountType,
            accountHolder,
            walletPhone,
            walletName,
            notes,
            isDefault,
            methodId,
            personId,
          ],
        );


      const paymentMethod =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'person_payment_method',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            methodId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            paymentMethod
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Medio de pago actualizado correctamente',

        payment_method:
          paymentMethod,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE PERSON PAYMENT METHOD ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error actualizando medio de pago',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR MEDIO DE PAGO
// PATCH /slaughterhouse/admin/people/:id/payment-methods/:methodId/active
// =====================================================

exports.setPersonPaymentMethodActive =
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


      const personId =
        Number(
          req.params.id
        );


      const methodId =
        Number(
          req.params.methodId
        );


      if (
        !Number.isInteger(personId) ||
        personId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de persona inválido',
        });

      }


      if (
        !Number.isInteger(methodId) ||
        methodId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de medio de pago inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR PERSONA DE ESTE FRIGORÍFICO
      // =================================================

      const personResult =
        await client.query(
          `
            SELECT id

            FROM slaughterhouse_people

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            personId,
            companyId,
          ],
        );


      if (
        personResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Persona no encontrada',
        });

      }


      // =================================================
      // MEDIO DE PAGO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_person_payment_methods

            WHERE
              id = $1
              AND person_id = $2

            LIMIT 1
          `,
          [
            methodId,
            personId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Medio de pago no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      //
      // Si se desactiva, deja de ser predeterminado.
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_person_payment_methods

            SET
              is_active = $1,

              is_default =
                CASE
                  WHEN $1 = false
                    THEN false
                  ELSE is_default
                END,

              updated_at = NOW()

            WHERE
              id = $2
              AND person_id = $3

            RETURNING *
          `,
          [
            isActive,
            methodId,
            personId,
          ],
        );


      const paymentMethod =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'person_payment_method',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            methodId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            paymentMethod
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Medio de pago activado correctamente'
            : 'Medio de pago desactivado correctamente',

        payment_method:
          paymentMethod,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE PERSON PAYMENT METHOD ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado del medio de pago',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🏦 LISTAR CUENTAS DE PAGO DE LA EMPRESA
// GET /slaughterhouse/admin/company-payment-accounts
// =====================================================

exports.getCompanyPaymentAccounts =
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
              scpa.id,
              scpa.company_id,
              scpa.bank_id,

              sb.name
                AS bank_name,

              scpa.account_number,
              scpa.account_type,
              scpa.account_holder,
              scpa.label,
              scpa.is_default,
              scpa.is_active,
              scpa.created_by,
              scpa.created_at,
              scpa.updated_at

            FROM slaughterhouse_company_payment_accounts scpa

            LEFT JOIN slaughterhouse_banks sb
              ON sb.id =
                scpa.bank_id

            WHERE
              scpa.company_id = $1

            ORDER BY
              scpa.is_active DESC,
              scpa.is_default DESC,
              scpa.label ASC NULLS LAST,
              scpa.id ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        payment_accounts:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE COMPANY PAYMENT ACCOUNTS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo cuentas de pago de la empresa',
      });

    }

  };
  
// =====================================================
// ➕ CREAR CUENTA DE PAGO DE LA EMPRESA
// POST /slaughterhouse/admin/company-payment-accounts
//
// Body ejemplo:
//
// {
//   "bank_id": 1,
//   "account_number": "1234567890",
//   "account_type": "Corriente",
//   "account_holder": "FRIGOSI S.A.",
//   "label": "Cuenta principal",
//   "is_default": true
// }
// =====================================================

exports.createCompanyPaymentAccount =
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


      const bankIdRaw =
        req.body.bank_id;


      const bankId =
        bankIdRaw !== undefined &&
        bankIdRaw !== null &&
        bankIdRaw !== ''
          ? Number(
              bankIdRaw
            )
          : null;


      const accountNumber =
        req.body.account_number
          ?.toString()
          .trim();


      const accountType =
        req.body.account_type
          ?.toString()
          .trim() ||
        null;


      const accountHolder =
        req.body.account_holder
          ?.toString()
          .trim() ||
        null;


      const label =
        req.body.label
          ?.toString()
          .trim() ||
        null;


      const isDefault =
        req.body.is_default === true;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!accountNumber) {

        return res.status(400).json({
          error:
            'El número de cuenta es obligatorio',
        });

      }


      if (
        bankId !== null &&
        (
          !Number.isInteger(bankId) ||
          bankId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'bank_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR BANCO
      // =================================================

      if (
        bankId !== null
      ) {

        const bankResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_banks

              WHERE
                id = $1
                AND is_active = true

              LIMIT 1
            `,
            [
              bankId,
            ],
          );


        if (
          bankResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'Banco no encontrado o inactivo',
          });

        }

      }


      // =================================================
      // SI SERÁ PREDETERMINADA,
      // QUITAR PREDETERMINADA ANTERIOR
      // =================================================

      if (
        isDefault
      ) {

        await client.query(
          `
            UPDATE slaughterhouse_company_payment_accounts

            SET
              is_default = false,
              updated_at = NOW()

            WHERE
              company_id = $1
              AND is_default = true
          `,
          [
            companyId,
          ],
        );

      }


      // =================================================
      // CREAR CUENTA
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_company_payment_accounts (
              company_id,
              bank_id,
              account_number,
              account_type,
              account_holder,
              label,
              is_default,
              created_by
            )

            VALUES (
              $1,$2,$3,$4,
              $5,$6,$7,$8
            )

            RETURNING *
          `,
          [
            companyId,
            bankId,
            accountNumber,
            accountType,
            accountHolder,
            label,
            isDefault,
            userId,
          ],
        );


      const paymentAccount =
        result.rows[0];


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
            'company_payment_account',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            paymentAccount.id
          ),
          JSON.stringify(
            paymentAccount
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Cuenta de pago creada correctamente',

        payment_account:
          paymentAccount,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE COMPANY PAYMENT ACCOUNT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error creando cuenta de pago de la empresa',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ✏️ EDITAR CUENTA DE PAGO DE LA EMPRESA
// PUT /slaughterhouse/admin/company-payment-accounts/:id
// =====================================================

exports.updateCompanyPaymentAccount =
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


      const accountId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(accountId) ||
        accountId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de cuenta inválido',
        });

      }


      const bankIdRaw =
        req.body.bank_id;


      const bankId =
        bankIdRaw !== undefined &&
        bankIdRaw !== null &&
        bankIdRaw !== ''
          ? Number(
              bankIdRaw
            )
          : null;


      const accountNumber =
        req.body.account_number
          ?.toString()
          .trim();


      const accountType =
        req.body.account_type
          ?.toString()
          .trim() ||
        null;


      const accountHolder =
        req.body.account_holder
          ?.toString()
          .trim() ||
        null;


      const label =
        req.body.label
          ?.toString()
          .trim() ||
        null;


      const isDefault =
        req.body.is_default === true;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!accountNumber) {

        return res.status(400).json({
          error:
            'El número de cuenta es obligatorio',
        });

      }


      if (
        bankId !== null &&
        (
          !Number.isInteger(bankId) ||
          bankId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'bank_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // CUENTA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_company_payment_accounts

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            accountId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Cuenta de pago no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // VALIDAR BANCO
      // =================================================

      if (
        bankId !== null
      ) {

        const bankResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_banks

              WHERE
                id = $1
                AND is_active = true

              LIMIT 1
            `,
            [
              bankId,
            ],
          );


        if (
          bankResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'Banco no encontrado o inactivo',
          });

        }

      }


      // =================================================
      // SI SERÁ PREDETERMINADA,
      // QUITAR PREDETERMINADA A LAS DEMÁS
      // =================================================

      if (
        isDefault
      ) {

        await client.query(
          `
            UPDATE slaughterhouse_company_payment_accounts

            SET
              is_default = false,
              updated_at = NOW()

            WHERE
              company_id = $1
              AND id <> $2
              AND is_default = true
          `,
          [
            companyId,
            accountId,
          ],
        );

      }


      // =================================================
      // ACTUALIZAR CUENTA
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_company_payment_accounts

            SET
              bank_id = $1,
              account_number = $2,
              account_type = $3,
              account_holder = $4,
              label = $5,
              is_default = $6,
              updated_at = NOW()

            WHERE
              id = $7
              AND company_id = $8

            RETURNING *
          `,
          [
            bankId,
            accountNumber,
            accountType,
            accountHolder,
            label,
            isDefault,
            accountId,
            companyId,
          ],
        );


      const paymentAccount =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'company_payment_account',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            accountId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            paymentAccount
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Cuenta de pago actualizada correctamente',

        payment_account:
          paymentAccount,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE COMPANY PAYMENT ACCOUNT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error actualizando cuenta de pago de la empresa',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR CUENTA DE PAGO DE EMPRESA
// PATCH /slaughterhouse/admin/company-payment-accounts/:id/active
// =====================================================

exports.setCompanyPaymentAccountActive =
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


      const accountId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(accountId) ||
        accountId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de cuenta inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // CUENTA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_company_payment_accounts

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            accountId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Cuenta de pago no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      //
      // Si se desactiva, deja de ser predeterminada.
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_company_payment_accounts

            SET
              is_active = $1,

              is_default =
                CASE
                  WHEN $1 = false
                    THEN false
                  ELSE is_default
                END,

              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            accountId,
            companyId,
          ],
        );


      const paymentAccount =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'company_payment_account',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            accountId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            paymentAccount
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Cuenta de pago activada correctamente'
            : 'Cuenta de pago desactivada correctamente',

        payment_account:
          paymentAccount,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE COMPANY PAYMENT ACCOUNT ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado de la cuenta de pago',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🐄 LISTAR CATEGORÍAS ANIMALES
// GET /slaughterhouse/admin/animal-categories
// =====================================================

exports.getAnimalCategories =
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
              id,
              company_id,
              code,
              name,
              is_active,
              created_at,
              updated_at

            FROM slaughterhouse_animal_categories

            WHERE
              company_id = $1

            ORDER BY
              is_active DESC,
              code ASC,
              name ASC,
              id ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        categories:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ANIMAL CATEGORIES ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo categorías animales',
      });

    }

  };
  
// =====================================================
// ➕ CREAR CATEGORÍA ANIMAL
// POST /slaughterhouse/admin/animal-categories
//
// Body:
// {
//   "code": "TORO",
//   "name": "Toro"
// }
// =====================================================

exports.createAnimalCategory =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      const result =
        await pool.query(
          `
            INSERT INTO slaughterhouse_animal_categories (
              company_id,
              code,
              name
            )

            VALUES (
              $1,
              $2,
              $3
            )

            RETURNING
              id,
              company_id,
              code,
              name,
              is_active,
              created_at,
              updated_at
          `,
          [
            companyId,
            code,
            name,
          ],
        );


      return res.status(201).json({
        success: true,

        message:
          'Categoría animal creada correctamente',

        category:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE ANIMAL CATEGORY ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una categoría con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error creando categoría animal',
      });

    }

  };
  
// =====================================================
// ✏️ EDITAR CATEGORÍA ANIMAL
// PUT /slaughterhouse/admin/animal-categories/:id
// =====================================================

exports.updateAnimalCategory =
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


      const categoryId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de categoría inválido',
        });

      }


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // CATEGORÍA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_animal_categories

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            categoryId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Categoría animal no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_animal_categories

            SET
              code = $1,
              name = $2,
              updated_at = NOW()

            WHERE
              id = $3
              AND company_id = $4

            RETURNING *
          `,
          [
            code,
            name,
            categoryId,
            companyId,
          ],
        );


      const category =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'animal_category',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            categoryId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            category
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Categoría animal actualizada correctamente',

        category,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE ANIMAL CATEGORY ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una categoría con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error actualizando categoría animal',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR CATEGORÍA ANIMAL
// PATCH /slaughterhouse/admin/animal-categories/:id/active
// =====================================================

exports.setAnimalCategoryActive =
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


      const categoryId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de categoría inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // CATEGORÍA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_animal_categories

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            categoryId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Categoría animal no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_animal_categories

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            categoryId,
            companyId,
          ],
        );


      const category =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'animal_category',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            categoryId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            category
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Categoría animal activada correctamente'
            : 'Categoría animal desactivada correctamente',

        category,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE ANIMAL CATEGORY ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado de la categoría animal',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🐂 LISTAR RAZAS
// GET /slaughterhouse/admin/breeds
// =====================================================

exports.getBreeds =
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
              id,
              company_id,
              code,
              name,
              is_active,
              created_at,
              updated_at

            FROM slaughterhouse_breeds

            WHERE
              company_id = $1

            ORDER BY
              is_active DESC,
              code ASC,
              name ASC,
              id ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        breeds:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE BREEDS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo razas',
      });

    }

  };
  
// =====================================================
// ➕ CREAR RAZA
// POST /slaughterhouse/admin/breeds
//
// Body:
// {
//   "code": "BRANGUS",
//   "name": "Brangus"
// }
// =====================================================

exports.createBreed =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      const result =
        await pool.query(
          `
            INSERT INTO slaughterhouse_breeds (
              company_id,
              code,
              name
            )

            VALUES (
              $1,
              $2,
              $3
            )

            RETURNING
              id,
              company_id,
              code,
              name,
              is_active,
              created_at,
              updated_at
          `,
          [
            companyId,
            code,
            name,
          ],
        );


      return res.status(201).json({
        success: true,

        message:
          'Raza creada correctamente',

        breed:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE BREED ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una raza con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error creando raza',
      });

    }

  };
  
// =====================================================
// ✏️ EDITAR RAZA
// PUT /slaughterhouse/admin/breeds/:id
// =====================================================

exports.updateBreed =
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


      const breedId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(breedId) ||
        breedId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de raza inválido',
        });

      }


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // RAZA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_breeds

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            breedId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Raza no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_breeds

            SET
              code = $1,
              name = $2,
              updated_at = NOW()

            WHERE
              id = $3
              AND company_id = $4

            RETURNING *
          `,
          [
            code,
            name,
            breedId,
            companyId,
          ],
        );


      const breed =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'breed',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            breedId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            breed
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Raza actualizada correctamente',

        breed,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE BREED ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una raza con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error actualizando raza',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR RAZA
// PATCH /slaughterhouse/admin/breeds/:id/active
// =====================================================

exports.setBreedActive =
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


      const breedId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(breedId) ||
        breedId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de raza inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // RAZA ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_breeds

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            breedId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Raza no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_breeds

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            breedId,
            companyId,
          ],
        );


      const breed =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'breed',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            breedId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            breed
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Raza activada correctamente'
            : 'Raza desactivada correctamente',

        breed,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE BREED ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado de la raza',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🌾 LISTAR MÉTODOS DE ALIMENTACIÓN
// GET /slaughterhouse/admin/feeding-methods
// =====================================================

exports.getFeedingMethods =
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
              id,
              company_id,
              code,
              name,
              is_active,
              created_at,
              updated_at

            FROM slaughterhouse_feeding_methods

            WHERE
              company_id = $1

            ORDER BY
              is_active DESC,
              code ASC,
              name ASC,
              id ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        feeding_methods:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE FEEDING METHODS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo métodos de alimentación',
      });

    }

  };
  
// =====================================================
// ➕ CREAR MÉTODO DE ALIMENTACIÓN
// POST /slaughterhouse/admin/feeding-methods
//
// Body:
// {
//   "code": "PASTO",
//   "name": "Pasto"
// }
// =====================================================

exports.createFeedingMethod =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      const result =
        await pool.query(
          `
            INSERT INTO slaughterhouse_feeding_methods (
              company_id,
              code,
              name
            )

            VALUES (
              $1,
              $2,
              $3
            )

            RETURNING
              id,
              company_id,
              code,
              name,
              is_active,
              created_at,
              updated_at
          `,
          [
            companyId,
            code,
            name,
          ],
        );


      return res.status(201).json({
        success: true,

        message:
          'Método de alimentación creado correctamente',

        feeding_method:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE FEEDING METHOD ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe un método de alimentación con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error creando método de alimentación',
      });

    }

  };
  
// =====================================================
// ✏️ EDITAR MÉTODO DE ALIMENTACIÓN
// PUT /slaughterhouse/admin/feeding-methods/:id
// =====================================================

exports.updateFeedingMethod =
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


      const feedingMethodId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(feedingMethodId) ||
        feedingMethodId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de método de alimentación inválido',
        });

      }


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // MÉTODO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_feeding_methods

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            feedingMethodId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Método de alimentación no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_feeding_methods

            SET
              code = $1,
              name = $2,
              updated_at = NOW()

            WHERE
              id = $3
              AND company_id = $4

            RETURNING *
          `,
          [
            code,
            name,
            feedingMethodId,
            companyId,
          ],
        );


      const feedingMethod =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'feeding_method',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            feedingMethodId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            feedingMethod
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Método de alimentación actualizado correctamente',

        feeding_method:
          feedingMethod,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE FEEDING METHOD ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe un método de alimentación con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error actualizando método de alimentación',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR MÉTODO DE ALIMENTACIÓN
// PATCH /slaughterhouse/admin/feeding-methods/:id/active
// =====================================================

exports.setFeedingMethodActive =
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


      const feedingMethodId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(feedingMethodId) ||
        feedingMethodId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de método de alimentación inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // MÉTODO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_feeding_methods

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            feedingMethodId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Método de alimentación no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_feeding_methods

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            feedingMethodId,
            companyId,
          ],
        );


      const feedingMethod =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'feeding_method',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            feedingMethodId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            feedingMethod
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Método de alimentación activado correctamente'
            : 'Método de alimentación desactivado correctamente',

        feeding_method:
          feedingMethod,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE FEEDING METHOD ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado del método de alimentación',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🐄 LISTAR RANGOS DE EDAD
// GET /slaughterhouse/admin/age-ranges
// =====================================================

exports.getAgeRanges =
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
              id,
              company_id,
              code,
              name,
              min_months,
              max_months,
              is_active,
              created_at,
              updated_at

            FROM slaughterhouse_age_ranges

            WHERE
              company_id = $1

            ORDER BY
              is_active DESC,
              min_months ASC NULLS FIRST,
              max_months ASC NULLS LAST,
              code ASC,
              id ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        age_ranges:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE AGE RANGES ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo rangos de edad',
      });

    }

  };
  
// =====================================================
// ➕ CREAR RANGO DE EDAD
// POST /slaughterhouse/admin/age-ranges
//
// Body:
// {
//   "code": "12_18",
//   "name": "12 a 18 meses",
//   "min_months": 12,
//   "max_months": 18
// }
// =====================================================

exports.createAgeRange =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      const minMonthsRaw =
        req.body.min_months;


      const maxMonthsRaw =
        req.body.max_months;


      const minMonths =
        minMonthsRaw !== undefined &&
        minMonthsRaw !== null &&
        minMonthsRaw !== ''
          ? Number(
              minMonthsRaw
            )
          : null;


      const maxMonths =
        maxMonthsRaw !== undefined &&
        maxMonthsRaw !== null &&
        maxMonthsRaw !== ''
          ? Number(
              maxMonthsRaw
            )
          : null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      if (
        minMonths !== null &&
        (
          !Number.isInteger(minMonths) ||
          minMonths < 0
        )
      ) {

        return res.status(400).json({
          error:
            'min_months debe ser un entero mayor o igual a 0',
        });

      }


      if (
        maxMonths !== null &&
        (
          !Number.isInteger(maxMonths) ||
          maxMonths < 0
        )
      ) {

        return res.status(400).json({
          error:
            'max_months debe ser un entero mayor o igual a 0',
        });

      }


      if (
        minMonths !== null &&
        maxMonths !== null &&
        maxMonths < minMonths
      ) {

        return res.status(400).json({
          error:
            'max_months no puede ser menor que min_months',
        });

      }


      const result =
        await pool.query(
          `
            INSERT INTO slaughterhouse_age_ranges (
              company_id,
              code,
              name,
              min_months,
              max_months
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5
            )

            RETURNING
              id,
              company_id,
              code,
              name,
              min_months,
              max_months,
              is_active,
              created_at,
              updated_at
          `,
          [
            companyId,
            code,
            name,
            minMonths,
            maxMonths,
          ],
        );


      return res.status(201).json({
        success: true,

        message:
          'Rango de edad creado correctamente',

        age_range:
          result.rows[0],
      });

    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE AGE RANGE ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe un rango de edad con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error creando rango de edad',
      });

    }

  };
  
// =====================================================
// ✏️ EDITAR RANGO DE EDAD
// PUT /slaughterhouse/admin/age-ranges/:id
// =====================================================

exports.updateAgeRange =
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


      const ageRangeId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(ageRangeId) ||
        ageRangeId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de rango de edad inválido',
        });

      }


      const code =
        req.body.code
          ?.toString()
          .trim()
          .toUpperCase();


      const name =
        req.body.name
          ?.toString()
          .trim();


      const minMonthsRaw =
        req.body.min_months;


      const maxMonthsRaw =
        req.body.max_months;


      const minMonths =
        minMonthsRaw !== undefined &&
        minMonthsRaw !== null &&
        minMonthsRaw !== ''
          ? Number(
              minMonthsRaw
            )
          : null;


      const maxMonths =
        maxMonthsRaw !== undefined &&
        maxMonthsRaw !== null &&
        maxMonthsRaw !== ''
          ? Number(
              maxMonthsRaw
            )
          : null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (!code) {

        return res.status(400).json({
          error:
            'El código es obligatorio',
        });

      }


      if (!name) {

        return res.status(400).json({
          error:
            'El nombre es obligatorio',
        });

      }


      if (
        minMonths !== null &&
        (
          !Number.isInteger(minMonths) ||
          minMonths < 0
        )
      ) {

        return res.status(400).json({
          error:
            'min_months debe ser un entero mayor o igual a 0',
        });

      }


      if (
        maxMonths !== null &&
        (
          !Number.isInteger(maxMonths) ||
          maxMonths < 0
        )
      ) {

        return res.status(400).json({
          error:
            'max_months debe ser un entero mayor o igual a 0',
        });

      }


      if (
        minMonths !== null &&
        maxMonths !== null &&
        maxMonths < minMonths
      ) {

        return res.status(400).json({
          error:
            'max_months no puede ser menor que min_months',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // RANGO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_age_ranges

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            ageRangeId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Rango de edad no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ACTUALIZAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_age_ranges

            SET
              code = $1,
              name = $2,
              min_months = $3,
              max_months = $4,
              updated_at = NOW()

            WHERE
              id = $5
              AND company_id = $6

            RETURNING *
          `,
          [
            code,
            name,
            minMonths,
            maxMonths,
            ageRangeId,
            companyId,
          ],
        );


      const ageRange =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'age_range',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            ageRangeId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            ageRange
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Rango de edad actualizado correctamente',

        age_range:
          ageRange,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE AGE RANGE ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe un rango de edad con ese código',
        });

      }


      return res.status(500).json({
        error:
          'Error actualizando rango de edad',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR RANGO DE EDAD
// PATCH /slaughterhouse/admin/age-ranges/:id/active
// =====================================================

exports.setAgeRangeActive =
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


      const ageRangeId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(ageRangeId) ||
        ageRangeId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de rango de edad inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // RANGO ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_age_ranges

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            ageRangeId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Rango de edad no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_age_ranges

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            ageRangeId,
            companyId,
          ],
        );


      const ageRange =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'age_range',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            ageRangeId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            ageRange
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Rango de edad activado correctamente'
            : 'Rango de edad desactivado correctamente',

        age_range:
          ageRange,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE AGE RANGE ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado del rango de edad',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🐄 LISTAR CLASIFICACIONES ANIMALES
// GET /slaughterhouse/admin/animal-classifications
// =====================================================

exports.getAnimalClassifications =
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
              sac.id,
              sac.company_id,
              sac.category_id,
              sac.breed_id,
              sac.feeding_method_id,
              sac.age_range_id,
              sac.generated_code,
              sac.display_name,
              sac.is_active,
              sac.created_at,
              sac.updated_at,

              category.code
                AS category_code,

              category.name
                AS category_name,

              breed.code
                AS breed_code,

              breed.name
                AS breed_name,

              feeding.code
                AS feeding_method_code,

              feeding.name
                AS feeding_method_name,

              age.code
                AS age_range_code,

              age.name
                AS age_range_name,

              age.min_months,
              age.max_months

            FROM slaughterhouse_animal_classifications sac

            JOIN slaughterhouse_animal_categories category
              ON category.id =
                sac.category_id
              AND category.company_id =
                sac.company_id

            JOIN slaughterhouse_breeds breed
              ON breed.id =
                sac.breed_id
              AND breed.company_id =
                sac.company_id

            JOIN slaughterhouse_feeding_methods feeding
              ON feeding.id =
                sac.feeding_method_id
              AND feeding.company_id =
                sac.company_id

            JOIN slaughterhouse_age_ranges age
              ON age.id =
                sac.age_range_id
              AND age.company_id =
                sac.company_id

            WHERE
              sac.company_id = $1

            ORDER BY
              sac.is_active DESC,
              category.name ASC,
              breed.name ASC,
              feeding.name ASC,
              age.min_months ASC NULLS FIRST,
              sac.id ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        classifications:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ANIMAL CLASSIFICATIONS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo clasificaciones animales',
      });

    }

  };
  
// =====================================================
// ➕ CREAR CLASIFICACIÓN ANIMAL
// POST /slaughterhouse/admin/animal-classifications
//
// Body:
//
// {
//   "category_id": 1,
//   "breed_id": 2,
//   "feeding_method_id": 3,
//   "age_range_id": 4
// }
//
// El sistema genera:
//
// generated_code:
// TORO-BRANGUS-PASTO-12_18
//
// display_name:
// Toro - Brangus - Pasto - 12 a 18 meses
// =====================================================

exports.createAnimalClassification =
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


      const categoryId =
        Number(
          req.body.category_id
        );


      const breedId =
        Number(
          req.body.breed_id
        );


      const feedingMethodId =
        Number(
          req.body.feeding_method_id
        );


      const ageRangeId =
        Number(
          req.body.age_range_id
        );


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {

        return res.status(400).json({
          error:
            'category_id inválido',
        });

      }


      if (
        !Number.isInteger(breedId) ||
        breedId <= 0
      ) {

        return res.status(400).json({
          error:
            'breed_id inválido',
        });

      }


      if (
        !Number.isInteger(feedingMethodId) ||
        feedingMethodId <= 0
      ) {

        return res.status(400).json({
          error:
            'feeding_method_id inválido',
        });

      }


      if (
        !Number.isInteger(ageRangeId) ||
        ageRangeId <= 0
      ) {

        return res.status(400).json({
          error:
            'age_range_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y VALIDAR CATÁLOGOS
      // =================================================

      const catalogResult =
        await client.query(
          `
            SELECT

              c.id
                AS category_id,

              c.code
                AS category_code,

              c.name
                AS category_name,

              b.id
                AS breed_id,

              b.code
                AS breed_code,

              b.name
                AS breed_name,

              f.id
                AS feeding_method_id,

              f.code
                AS feeding_code,

              f.name
                AS feeding_name,

              a.id
                AS age_range_id,

              a.code
                AS age_code,

              a.name
                AS age_name

            FROM slaughterhouse_animal_categories c

            JOIN slaughterhouse_breeds b
              ON b.id = $3
              AND b.company_id = $1
              AND b.is_active = true

            JOIN slaughterhouse_feeding_methods f
              ON f.id = $4
              AND f.company_id = $1
              AND f.is_active = true

            JOIN slaughterhouse_age_ranges a
              ON a.id = $5
              AND a.company_id = $1
              AND a.is_active = true

            WHERE
              c.id = $2
              AND c.company_id = $1
              AND c.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            categoryId,
            breedId,
            feedingMethodId,
            ageRangeId,
          ],
        );


      if (
        catalogResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'Uno o más catálogos no existen, están inactivos o no pertenecen a este frigorífico',
        });

      }


      const catalog =
        catalogResult.rows[0];


      // =================================================
      // GENERAR CÓDIGO
      // =================================================

      const generatedCode =
        [
          catalog.category_code,
          catalog.breed_code,
          catalog.feeding_code,
          catalog.age_code,
        ]
          .map(
            (value) =>
              value
                .toString()
                .trim()
                .toUpperCase()
          )
          .join('-');


      const displayName =
        [
          catalog.category_name,
          catalog.breed_name,
          catalog.feeding_name,
          catalog.age_name,
        ]
          .map(
            (value) =>
              value
                .toString()
                .trim()
          )
          .join(' - ');


      // =================================================
      // CREAR CLASIFICACIÓN
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_animal_classifications (
              company_id,
              category_id,
              breed_id,
              feeding_method_id,
              age_range_id,
              generated_code,
              display_name
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7
            )

            RETURNING *
          `,
          [
            companyId,
            categoryId,
            breedId,
            feedingMethodId,
            ageRangeId,
            generatedCode,
            displayName,
          ],
        );


      const classification =
        result.rows[0];


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
            'animal_classification',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            classification.id
          ),
          JSON.stringify(
            classification
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Clasificación animal creada correctamente',

        classification,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE ANIMAL CLASSIFICATION ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe esa combinación de clasificación animal',
        });

      }


      return res.status(500).json({
        error:
          'Error creando clasificación animal',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ✏️ EDITAR CLASIFICACIÓN ANIMAL
// PUT /slaughterhouse/admin/animal-classifications/:id
//
// Body:
//
// {
//   "category_id": 1,
//   "breed_id": 2,
//   "feeding_method_id": 3,
//   "age_range_id": 4
// }
//
// El sistema vuelve a generar:
// generated_code
// display_name
// =====================================================

exports.updateAnimalClassification =
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


      const classificationId =
        Number(
          req.params.id
        );


      const categoryId =
        Number(
          req.body.category_id
        );


      const breedId =
        Number(
          req.body.breed_id
        );


      const feedingMethodId =
        Number(
          req.body.feeding_method_id
        );


      const ageRangeId =
        Number(
          req.body.age_range_id
        );


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(classificationId) ||
        classificationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de clasificación inválido',
        });

      }


      if (
        !Number.isInteger(categoryId) ||
        categoryId <= 0
      ) {

        return res.status(400).json({
          error:
            'category_id inválido',
        });

      }


      if (
        !Number.isInteger(breedId) ||
        breedId <= 0
      ) {

        return res.status(400).json({
          error:
            'breed_id inválido',
        });

      }


      if (
        !Number.isInteger(feedingMethodId) ||
        feedingMethodId <= 0
      ) {

        return res.status(400).json({
          error:
            'feeding_method_id inválido',
        });

      }


      if (
        !Number.isInteger(ageRangeId) ||
        ageRangeId <= 0
      ) {

        return res.status(400).json({
          error:
            'age_range_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // CLASIFICACIÓN ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_animal_classifications

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            classificationId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Clasificación animal no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // OBTENER Y VALIDAR CATÁLOGOS
      // =================================================

      const catalogResult =
        await client.query(
          `
            SELECT

              c.code
                AS category_code,

              c.name
                AS category_name,

              b.code
                AS breed_code,

              b.name
                AS breed_name,

              f.code
                AS feeding_code,

              f.name
                AS feeding_name,

              a.code
                AS age_code,

              a.name
                AS age_name

            FROM slaughterhouse_animal_categories c

            JOIN slaughterhouse_breeds b
              ON b.id = $3
              AND b.company_id = $1
              AND b.is_active = true

            JOIN slaughterhouse_feeding_methods f
              ON f.id = $4
              AND f.company_id = $1
              AND f.is_active = true

            JOIN slaughterhouse_age_ranges a
              ON a.id = $5
              AND a.company_id = $1
              AND a.is_active = true

            WHERE
              c.id = $2
              AND c.company_id = $1
              AND c.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            categoryId,
            breedId,
            feedingMethodId,
            ageRangeId,
          ],
        );


      if (
        catalogResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'Uno o más catálogos no existen, están inactivos o no pertenecen a este frigorífico',
        });

      }


      const catalog =
        catalogResult.rows[0];


      // =================================================
      // REGENERAR CÓDIGO Y NOMBRE
      // =================================================

      const generatedCode =
        [
          catalog.category_code,
          catalog.breed_code,
          catalog.feeding_code,
          catalog.age_code,
        ]
          .map(
            (value) =>
              value
                .toString()
                .trim()
                .toUpperCase()
          )
          .join('-');


      const displayName =
        [
          catalog.category_name,
          catalog.breed_name,
          catalog.feeding_name,
          catalog.age_name,
        ]
          .map(
            (value) =>
              value
                .toString()
                .trim()
          )
          .join(' - ');


      // =================================================
      // ACTUALIZAR CLASIFICACIÓN
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_animal_classifications

            SET
              category_id = $1,
              breed_id = $2,
              feeding_method_id = $3,
              age_range_id = $4,
              generated_code = $5,
              display_name = $6,
              updated_at = NOW()

            WHERE
              id = $7
              AND company_id = $8

            RETURNING *
          `,
          [
            categoryId,
            breedId,
            feedingMethodId,
            ageRangeId,
            generatedCode,
            displayName,
            classificationId,
            companyId,
          ],
        );


      const classification =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'animal_classification',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            classificationId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            classification
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Clasificación animal actualizada correctamente',

        classification,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE ANIMAL CLASSIFICATION ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe esa combinación de clasificación animal',
        });

      }


      return res.status(500).json({
        error:
          'Error actualizando clasificación animal',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🔄 ACTIVAR / DESACTIVAR CLASIFICACIÓN ANIMAL
// PATCH /slaughterhouse/admin/animal-classifications/:id/active
// =====================================================

exports.setAnimalClassificationActive =
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


      const classificationId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(classificationId) ||
        classificationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de clasificación inválido',
        });

      }


      if (
        typeof req.body.is_active !==
        'boolean'
      ) {

        return res.status(400).json({
          error:
            'is_active debe ser true o false',
        });

      }


      const isActive =
        req.body.is_active;


      await client.query(
        'BEGIN'
      );


      // =================================================
      // CLASIFICACIÓN ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_animal_classifications

            WHERE
              id = $1
              AND company_id = $2

            LIMIT 1
          `,
          [
            classificationId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Clasificación animal no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // CAMBIAR ESTADO
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_animal_classifications

            SET
              is_active = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            isActive,
            classificationId,
            companyId,
          ],
        );


      const classification =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'animal_classification',
            $3,
            $4,
            $5::jsonb,
            $6::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            classificationId
          ),
          isActive
            ? 'activate'
            : 'deactivate',
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            classification
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          isActive
            ? 'Clasificación animal activada correctamente'
            : 'Clasificación animal desactivada correctamente',

        classification,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SET SLAUGHTERHOUSE ANIMAL CLASSIFICATION ACTIVE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cambiando estado de la clasificación animal',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🐄 LISTAR LOTES DE COMPRA
// GET /slaughterhouse/admin/purchase-lots
//
// Opcional:
// ?q=LOTE
// ?status=open
// =====================================================

exports.getPurchaseLots =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const q =
        req.query.q
          ?.toString()
          .trim() ||
        null;


      const status =
        req.query.status
          ?.toString()
          .trim()
          .toLowerCase() ||
        null;


      const allowedStatuses =
        [
          'draft',
          'open',
          'in_transport',
          'received',
          'in_slaughter',
          'completed',
          'cancelled',
        ];


      if (
        status !== null &&
        !allowedStatuses.includes(
          status
        )
      ) {

        return res.status(400).json({
          error:
            'Estado de lote inválido',
        });

      }


      const result =
        await pool.query(
          `
            SELECT
              spl.id,
              spl.company_id,
              spl.lot_number,
              spl.external_order_number,

              spl.seller_person_id,
              seller.full_name
                AS seller_name,
              seller.document_number
                AS seller_document_number,
              seller.phone
                AS seller_phone,

              spl.estate_id,
              estate.name
                AS estate_name,
              estate.location_text
                AS estate_location,

              spl.captador_person_id,
              captador.full_name
                AS captador_name,

              spl.commissioner_person_id,
              commissioner.full_name
                AS commissioner_name,

              spl.classification_id,
              classification.generated_code
                AS classification_code,
              classification.display_name
                AS classification_name,

              spl.purchase_type,
              spl.expected_quantity,
              spl.price_per_unit,
              spl.currency,
              spl.shrink_percent,
              spl.commission_type,
              spl.commission_value,
              spl.planned_date,
              spl.status,
              spl.notes,
              spl.created_by,
              spl.created_at,
              spl.updated_at,

              (
                SELECT COUNT(*)::int
                FROM slaughterhouse_troops st
                WHERE
                  st.purchase_lot_id = spl.id
                  AND st.company_id = spl.company_id
              )
                AS troops_count

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id
              AND seller.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_estates estate
              ON estate.id =
                spl.estate_id
              AND estate.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_people captador
              ON captador.id =
                spl.captador_person_id
              AND captador.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_people commissioner
              ON commissioner.id =
                spl.commissioner_person_id
              AND commissioner.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_animal_classifications classification
              ON classification.id =
                spl.classification_id
              AND classification.company_id =
                spl.company_id

            WHERE
              spl.company_id = $1

              AND (
                $2::text IS NULL
                OR spl.lot_number ILIKE
                  '%' || $2 || '%'
                OR spl.external_order_number ILIKE
                  '%' || $2 || '%'
                OR seller.full_name ILIKE
                  '%' || $2 || '%'
                OR estate.name ILIKE
                  '%' || $2 || '%'
              )

              AND (
                $3::text IS NULL
                OR spl.status = $3
              )

            ORDER BY
              CASE
                WHEN spl.status = 'open'
                  THEN 1
                WHEN spl.status = 'draft'
                  THEN 2
                WHEN spl.status = 'in_transport'
                  THEN 3
                WHEN spl.status = 'received'
                  THEN 4
                WHEN spl.status = 'in_slaughter'
                  THEN 5
                WHEN spl.status = 'completed'
                  THEN 6
                WHEN spl.status = 'cancelled'
                  THEN 7
                ELSE 8
              END,

              spl.planned_date ASC NULLS LAST,
              spl.created_at DESC,
              spl.id DESC
          `,
          [
            companyId,
            q,
            status,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        purchase_lots:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE PURCHASE LOTS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo lotes de compra',
      });

    }

  };
  
// =====================================================
// ➕ CREAR LOTE DE COMPRA
// POST /slaughterhouse/admin/purchase-lots
//
// Body ejemplo:
//
// {
//   "external_order_number": "OC-4587",
//   "seller_person_id": 10,
//   "estate_id": 4,
//   "captador_person_id": 12,
//   "commissioner_person_id": null,
//   "classification_id": 3,
//   "purchase_type": "peso_vivo",
//   "expected_quantity": 35,
//   "price_per_unit": 18.50,
//   "currency": "BOB",
//   "shrink_percent": 2,
//   "commission_type": null,
//   "commission_value": null,
//   "planned_date": "2026-09-10",
//   "status": "open",
//   "notes": null
// }
//
// lot_number:
// generado automáticamente por el sistema
// =====================================================

exports.createPurchaseLot =
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


      const externalOrderNumber =
        req.body.external_order_number
          ?.toString()
          .trim() ||
        null;


      const sellerPersonId =
        Number(
          req.body.seller_person_id
        );


      const estateIdRaw =
        req.body.estate_id;


      const estateId =
        estateIdRaw !== undefined &&
        estateIdRaw !== null &&
        estateIdRaw !== ''
          ? Number(
              estateIdRaw
            )
          : null;


      const captadorPersonIdRaw =
        req.body.captador_person_id;


      const captadorPersonId =
        captadorPersonIdRaw !== undefined &&
        captadorPersonIdRaw !== null &&
        captadorPersonIdRaw !== ''
          ? Number(
              captadorPersonIdRaw
            )
          : null;


      const commissionerPersonIdRaw =
        req.body.commissioner_person_id;


      const commissionerPersonId =
        commissionerPersonIdRaw !== undefined &&
        commissionerPersonIdRaw !== null &&
        commissionerPersonIdRaw !== ''
          ? Number(
              commissionerPersonIdRaw
            )
          : null;


      const classificationIdRaw =
        req.body.classification_id;


      const classificationId =
        classificationIdRaw !== undefined &&
        classificationIdRaw !== null &&
        classificationIdRaw !== ''
          ? Number(
              classificationIdRaw
            )
          : null;


      const purchaseType =
        req.body.purchase_type
          ?.toString()
          .trim() ||
        null;


      const expectedQuantityRaw =
        req.body.expected_quantity;


      const expectedQuantity =
        expectedQuantityRaw !== undefined &&
        expectedQuantityRaw !== null &&
        expectedQuantityRaw !== ''
          ? Number(
              expectedQuantityRaw
            )
          : null;


      const pricePerUnitRaw =
        req.body.price_per_unit;


      const pricePerUnit =
        pricePerUnitRaw !== undefined &&
        pricePerUnitRaw !== null &&
        pricePerUnitRaw !== ''
          ? Number(
              pricePerUnitRaw
            )
          : null;


      const currency =
        req.body.currency
          ?.toString()
          .trim()
          .toUpperCase() ||
        'BOB';


      const shrinkPercentRaw =
        req.body.shrink_percent;


      const shrinkPercent =
        shrinkPercentRaw !== undefined &&
        shrinkPercentRaw !== null &&
        shrinkPercentRaw !== ''
          ? Number(
              shrinkPercentRaw
            )
          : 0;


      const commissionType =
        req.body.commission_type
          ?.toString()
          .trim()
          .toLowerCase() ||
        null;


      const commissionValueRaw =
        req.body.commission_value;


      const commissionValue =
        commissionValueRaw !== undefined &&
        commissionValueRaw !== null &&
        commissionValueRaw !== ''
          ? Number(
              commissionValueRaw
            )
          : null;


      const plannedDate =
        req.body.planned_date
          ?.toString()
          .trim() ||
        null;


      const status =
        req.body.status
          ?.toString()
          .trim()
          .toLowerCase() ||
        'open';


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(
          sellerPersonId
        ) ||
        sellerPersonId <= 0
      ) {

        return res.status(400).json({
          error:
            'seller_person_id inválido',
        });

      }


      const optionalIds =
        [
          {
            name:
              'estate_id',
            value:
              estateId,
          },
          {
            name:
              'captador_person_id',
            value:
              captadorPersonId,
          },
          {
            name:
              'commissioner_person_id',
            value:
              commissionerPersonId,
          },
          {
            name:
              'classification_id',
            value:
              classificationId,
          },
        ];


      for (
        const item of optionalIds
      ) {

        if (
          item.value !== null &&
          (
            !Number.isInteger(
              item.value
            ) ||
            item.value <= 0
          )
        ) {

          return res.status(400).json({
            error:
              `${item.name} inválido`,
          });

        }

      }


      if (
        expectedQuantity !== null &&
        (
          !Number.isInteger(
            expectedQuantity
          ) ||
          expectedQuantity < 0
        )
      ) {

        return res.status(400).json({
          error:
            'expected_quantity debe ser un entero mayor o igual a 0',
        });

      }


      if (
        pricePerUnit !== null &&
        (
          !Number.isFinite(
            pricePerUnit
          ) ||
          pricePerUnit < 0
        )
      ) {

        return res.status(400).json({
          error:
            'price_per_unit inválido',
        });

      }


      if (
        !Number.isFinite(
          shrinkPercent
        ) ||
        shrinkPercent < 0 ||
        shrinkPercent > 100
      ) {

        return res.status(400).json({
          error:
            'shrink_percent debe estar entre 0 y 100',
        });

      }


      const allowedCommissionTypes =
        [
          'per_head',
          'percent',
          'fixed',
        ];


      if (
        commissionType !== null &&
        !allowedCommissionTypes.includes(
          commissionType
        )
      ) {

        return res.status(400).json({
          error:
            'commission_type inválido',
        });

      }


      if (
        commissionValue !== null &&
        (
          !Number.isFinite(
            commissionValue
          ) ||
          commissionValue < 0
        )
      ) {

        return res.status(400).json({
          error:
            'commission_value inválido',
        });

      }


      if (
        commissionType === 'percent' &&
        commissionValue !== null &&
        commissionValue > 100
      ) {

        return res.status(400).json({
          error:
            'La comisión porcentual no puede superar 100',
        });

      }


      if (
        commissionType === null &&
        commissionValue !== null
      ) {

        return res.status(400).json({
          error:
            'Debe indicar commission_type si existe commission_value',
        });

      }


      if (
        commissionType !== null &&
        commissionValue === null
      ) {

        return res.status(400).json({
          error:
            'Debe indicar commission_value',
        });

      }


      if (
        ![
          'draft',
          'open',
        ].includes(
          status
        )
      ) {

        return res.status(400).json({
          error:
            'Al crear un lote el estado debe ser draft u open',
        });

      }


      if (
        plannedDate !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(
          plannedDate
        )
      ) {

        return res.status(400).json({
          error:
            'planned_date debe tener formato YYYY-MM-DD',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR VENDEDOR
      // =================================================

      const sellerResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            WHERE
              sp.id = $1
              AND sp.company_id = $2
              AND sp.is_active = true

              AND EXISTS (
                SELECT 1

                FROM slaughterhouse_person_roles spr

                WHERE
                  spr.person_id = sp.id
                  AND spr.role = 'seller'
                  AND spr.is_active = true
              )

            LIMIT 1
          `,
          [
            sellerPersonId,
            companyId,
          ],
        );


      if (
        sellerResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'El vendedor no existe, está inactivo o no tiene rol seller',
        });

      }


      // =================================================
      // VALIDAR ESTANCIA
      // Debe pertenecer al vendedor seleccionado.
      // =================================================

      if (
        estateId !== null
      ) {

        const estateResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_estates

              WHERE
                id = $1
                AND company_id = $2
                AND seller_person_id = $3
                AND is_active = true

              LIMIT 1
            `,
            [
              estateId,
              companyId,
              sellerPersonId,
            ],
          );


        if (
          estateResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'La estancia no existe, está inactiva o no pertenece al vendedor seleccionado',
          });

        }

      }


      // =================================================
      // VALIDAR CAPTADOR
      // =================================================

      if (
        captadorPersonId !== null
      ) {

        const captadorResult =
          await client.query(
            `
              SELECT sp.id

              FROM slaughterhouse_people sp

              WHERE
                sp.id = $1
                AND sp.company_id = $2
                AND sp.is_active = true

                AND EXISTS (
                  SELECT 1

                  FROM slaughterhouse_person_roles spr

                  WHERE
                    spr.person_id = sp.id
                    AND spr.role = 'captador'
                    AND spr.is_active = true
                )

              LIMIT 1
            `,
            [
              captadorPersonId,
              companyId,
            ],
          );


        if (
          captadorResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El captador no existe, está inactivo o no tiene rol captador',
          });

        }

      }


      // =================================================
      // VALIDAR COMISIONISTA
      // =================================================

      if (
        commissionerPersonId !== null
      ) {

        const commissionerResult =
          await client.query(
            `
              SELECT sp.id

              FROM slaughterhouse_people sp

              WHERE
                sp.id = $1
                AND sp.company_id = $2
                AND sp.is_active = true

                AND EXISTS (
                  SELECT 1

                  FROM slaughterhouse_person_roles spr

                  WHERE
                    spr.person_id = sp.id
                    AND spr.role = 'commissioner'
                    AND spr.is_active = true
                )

              LIMIT 1
            `,
            [
              commissionerPersonId,
              companyId,
            ],
          );


        if (
          commissionerResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El comisionista no existe, está inactivo o no tiene rol commissioner',
          });

        }

      }


      // =================================================
      // VALIDAR CLASIFICACIÓN
      // =================================================

      if (
        classificationId !== null
      ) {

        const classificationResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_animal_classifications

              WHERE
                id = $1
                AND company_id = $2
                AND is_active = true

              LIMIT 1
            `,
            [
              classificationId,
              companyId,
            ],
          );


        if (
          classificationResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'Clasificación animal no encontrada o inactiva',
          });

        }

      }


      // =================================================
      // GENERAR NÚMERO INTERNO DEL LOTE
      //
      // Tomamos el siguiente ID de la misma secuencia
      // para garantizar unicidad.
      //
      // Ejemplo:
      // LOT-10-2026-000001
      // =================================================

      const sequenceResult =
        await client.query(
          `
            SELECT
              nextval(
                'slaughterhouse_purchase_lots_id_seq'
              )::int
                AS next_id
          `
        );


      const nextId =
        Number(
          sequenceResult.rows[0]
            .next_id
        );


      const year =
        new Date()
          .getFullYear();


      const lotNumber =
        `LOT-${companyId}-${year}-${String(
          nextId
        ).padStart(6, '0')}`;


      // =================================================
      // CREAR LOTE
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_purchase_lots (
              id,
              company_id,
              lot_number,
              external_order_number,
              seller_person_id,
              estate_id,
              captador_person_id,
              commissioner_person_id,
              classification_id,
              purchase_type,
              expected_quantity,
              price_per_unit,
              currency,
              shrink_percent,
              commission_type,
              commission_value,
              planned_date,
              status,
              notes,
              created_by
            )

            VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,
              $16,$17,$18,$19,$20
            )

            RETURNING *
          `,
          [
            nextId,
            companyId,
            lotNumber,
            externalOrderNumber,
            sellerPersonId,
            estateId,
            captadorPersonId,
            commissionerPersonId,
            classificationId,
            purchaseType,
            expectedQuantity,
            pricePerUnit,
            currency,
            shrinkPercent,
            commissionType,
            commissionValue,
            plannedDate,
            status,
            notes,
            userId,
          ],
        );


      const purchaseLot =
        result.rows[0];


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
            'purchase_lot',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            purchaseLot.id
          ),
          JSON.stringify(
            purchaseLot
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Lote de compra creado correctamente',

        purchase_lot:
          purchaseLot,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE PURCHASE LOT ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe un lote con ese número',
        });

      }


      return res.status(500).json({
        error:
          'Error creando lote de compra',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 📂 DETALLE / EXPEDIENTE DE LOTE DE COMPRA
// GET /slaughterhouse/admin/purchase-lots/:id
//
// Devuelve:
// - datos generales del lote
// - vendedor / estancia
// - captador / comisionista
// - clasificación
// - tropas
// - pesajes
// - autorizaciones QR
// - preliquidaciones
// =====================================================

exports.getPurchaseLotById =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const purchaseLotId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de lote inválido',
        });

      }


      // =================================================
      // DATOS PRINCIPALES DEL LOTE
      // =================================================

      const lotResult =
        await pool.query(
          `
            SELECT
              spl.id,
              spl.company_id,
              spl.lot_number,
              spl.external_order_number,

              spl.seller_person_id,
              seller.full_name
                AS seller_name,
              seller.document_number
                AS seller_document_number,
              seller.phone
                AS seller_phone,

              spl.estate_id,
              estate.name
                AS estate_name,
              estate.location_text
                AS estate_location,
              estate.senasag_predio_number
                AS estate_senasag_predio_number,
              estate.lat
                AS estate_lat,
              estate.lng
                AS estate_lng,

              spl.captador_person_id,
              captador.full_name
                AS captador_name,

              spl.commissioner_person_id,
              commissioner.full_name
                AS commissioner_name,

              spl.classification_id,
              classification.generated_code
                AS classification_code,
              classification.display_name
                AS classification_name,

              spl.purchase_type,
              spl.expected_quantity,
              spl.price_per_unit,
              spl.currency,
              spl.shrink_percent,

              spl.commission_type,
              spl.commission_value,

              spl.planned_date,
              spl.status,
              spl.notes,

              spl.created_by,
              spl.created_at,
              spl.updated_at

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id
              AND seller.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_estates estate
              ON estate.id =
                spl.estate_id
              AND estate.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_people captador
              ON captador.id =
                spl.captador_person_id
              AND captador.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_people commissioner
              ON commissioner.id =
                spl.commissioner_person_id
              AND commissioner.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_animal_classifications classification
              ON classification.id =
                spl.classification_id
              AND classification.company_id =
                spl.company_id

            WHERE
              spl.id = $1
              AND spl.company_id = $2

            LIMIT 1
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        lotResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Lote de compra no encontrado',
        });

      }


      const purchaseLot =
        lotResult.rows[0];


      // =================================================
      // TRAER TODO EL EXPEDIENTE
      // =================================================

      const [
        troopsResult,
        weighingsResult,
        authorizationsResult,
        preliquidationsResult,
      ] =
        await Promise.all([

          // =============================================
          // TROPAS
          // =============================================

          pool.query(
            `
              SELECT
                id,
                company_id,
                purchase_lot_id,

                troop_number,

                transport_request_id,
                transport_negotiation_id,
                transport_guide_id,

                truck_id,
                transporter_user_id,

                reception_id,
                reception_truck_id,

                expected_quantity,
                dispatched_quantity,
                received_quantity,

                status,
                notes,

                created_by,
                created_at,
                updated_at

              FROM slaughterhouse_troops

              WHERE
                purchase_lot_id = $1
                AND company_id = $2

              ORDER BY
                created_at ASC,
                id ASC
            `,
            [
              purchaseLotId,
              companyId,
            ],
          ),


          // =============================================
          // PESAJES
          // =============================================

          pool.query(
            `
              SELECT
                w.id,
                w.company_id,
                w.purchase_lot_id,
                w.troop_id,
                w.authorization_id,

                w.weighing_number,

                w.seller_person_id,
                seller.full_name
                  AS seller_name,

                w.captador_person_id,
                captador.full_name
                  AS captador_name,

                w.pesador_person_id,
                pesador.full_name
                  AS pesador_name,

                w.classification_id,
                classification.generated_code
                  AS classification_code,
                classification.display_name
                  AS classification_name,

                w.quantity,

                w.gross_weight_kg,
                w.shrink_percent,
                w.shrink_weight_kg,
                w.net_weight_kg,

                w.price_per_kg,
                w.total_amount,

                w.signature_url,

                w.event_lat,
                w.event_lng,
                w.event_local_time,

                w.document_hash,
                w.certified_offline,

                w.status,

                w.original_weighing_id,

                w.created_by,
                w.certified_by,

                w.created_at,
                w.certified_at,
                w.updated_at

              FROM slaughterhouse_live_weighings w

              JOIN slaughterhouse_people seller
                ON seller.id =
                  w.seller_person_id
                AND seller.company_id =
                  w.company_id

              LEFT JOIN slaughterhouse_people captador
                ON captador.id =
                  w.captador_person_id
                AND captador.company_id =
                  w.company_id

              LEFT JOIN slaughterhouse_people pesador
                ON pesador.id =
                  w.pesador_person_id
                AND pesador.company_id =
                  w.company_id

              LEFT JOIN slaughterhouse_animal_classifications classification
                ON classification.id =
                  w.classification_id
                AND classification.company_id =
                  w.company_id

              WHERE
                w.purchase_lot_id = $1
                AND w.company_id = $2

              ORDER BY
                w.weighing_number ASC,
                w.id ASC
            `,
            [
              purchaseLotId,
              companyId,
            ],
          ),


          // =============================================
          // AUTORIZACIONES / QR
          //
          // IMPORTANTE:
          // No exponemos:
          // token_hash
          // qr_payload_hash
          // =============================================

          pool.query(
            `
              SELECT
                id,
                company_id,
                purchase_lot_id,

                authorization_number,
                public_code,

                key_id,
                purpose,

                details_snapshot,

                recipient_phone_snapshot,
                delivery_channel,

                expected_date,
                status,

                issued_by,
                used_by,
                revoked_by,

                issued_at,
                used_at,
                revoked_at,
                expires_at,

                created_at,
                updated_at

              FROM slaughterhouse_weighing_authorizations

              WHERE
                purchase_lot_id = $1
                AND company_id = $2

              ORDER BY
                authorization_number ASC,
                id ASC
            `,
            [
              purchaseLotId,
              companyId,
            ],
          ),


          // =============================================
          // PRELIQUIDACIONES
          // Todas las versiones.
          // =============================================

          pool.query(
            `
              SELECT
                id,
                company_id,
                purchase_lot_id,

                version,

                gross_weight_kg,
                shrink_percent,
                shrink_weight_kg,
                net_weight_kg,

                price_per_kg,
                base_amount,

                discounts_total,
                additions_total,

                total_payable,

                status,

                generated_by,
                approved_by,

                generated_at,
                approved_at,
                exported_at,

                created_at,
                updated_at

              FROM slaughterhouse_preliquidations

              WHERE
                purchase_lot_id = $1
                AND company_id = $2

              ORDER BY
                version DESC,
                id DESC
            `,
            [
              purchaseLotId,
              companyId,
            ],
          ),

        ]);


      const troops =
        troopsResult.rows;


      const weighings =
        weighingsResult.rows;


      const authorizations =
        authorizationsResult.rows;


      const preliquidations =
        preliquidationsResult.rows;


      // =================================================
      // RESUMEN OPERATIVO
      // =================================================

      const certifiedWeighings =
        weighings.filter(
          (item) =>
            item.status ===
            'certified'
        );


      const certifiedQuantity =
        certifiedWeighings.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.quantity || 0
            ),
          0
        );


      const certifiedGrossWeightKg =
        certifiedWeighings.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.gross_weight_kg || 0
            ),
          0
        );


      const certifiedNetWeightKg =
        certifiedWeighings.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.net_weight_kg || 0
            ),
          0
        );


      const summary = {

        troops_count:
          troops.length,

        weighings_count:
          weighings.length,

        certified_weighings_count:
          certifiedWeighings.length,

        certified_quantity:
          certifiedQuantity,

        certified_gross_weight_kg:
          Number(
            certifiedGrossWeightKg.toFixed(
              3
            )
          ),

        certified_net_weight_kg:
          Number(
            certifiedNetWeightKg.toFixed(
              3
            )
          ),

        pending_authorizations:
          authorizations.filter(
            (item) =>
              item.status ===
              'pending'
          ).length,

        used_authorizations:
          authorizations.filter(
            (item) =>
              item.status ===
              'used'
          ).length,

        preliquidations_count:
          preliquidations.length,

        latest_preliquidation:
          preliquidations.length > 0
            ? preliquidations[0]
            : null,

      };


      // =================================================
      // RESPUESTA
      // =================================================

      return res.json({

        success: true,

        purchase_lot:
          purchaseLot,

        summary,

        troops,

        weighings,

        weighing_authorizations:
          authorizations,

        preliquidations,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE PURCHASE LOT DETAIL ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo expediente del lote de compra',
      });

    }

  };
  
// =====================================================
// ✏️ EDITAR LOTE DE COMPRA
// PUT /slaughterhouse/admin/purchase-lots/:id
//
// Solo editable mientras el lote esté:
// - draft
// - open
//
// Los estados operativos posteriores se manejarán
// mediante acciones específicas.
// =====================================================

exports.updatePurchaseLot =
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


      const purchaseLotId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de lote inválido',
        });

      }


      const externalOrderNumber =
        req.body.external_order_number
          ?.toString()
          .trim() ||
        null;


      const sellerPersonId =
        Number(
          req.body.seller_person_id
        );


      const estateIdRaw =
        req.body.estate_id;


      const estateId =
        estateIdRaw !== undefined &&
        estateIdRaw !== null &&
        estateIdRaw !== ''
          ? Number(
              estateIdRaw
            )
          : null;


      const captadorPersonIdRaw =
        req.body.captador_person_id;


      const captadorPersonId =
        captadorPersonIdRaw !== undefined &&
        captadorPersonIdRaw !== null &&
        captadorPersonIdRaw !== ''
          ? Number(
              captadorPersonIdRaw
            )
          : null;


      const commissionerPersonIdRaw =
        req.body.commissioner_person_id;


      const commissionerPersonId =
        commissionerPersonIdRaw !== undefined &&
        commissionerPersonIdRaw !== null &&
        commissionerPersonIdRaw !== ''
          ? Number(
              commissionerPersonIdRaw
            )
          : null;


      const classificationIdRaw =
        req.body.classification_id;


      const classificationId =
        classificationIdRaw !== undefined &&
        classificationIdRaw !== null &&
        classificationIdRaw !== ''
          ? Number(
              classificationIdRaw
            )
          : null;


      const purchaseType =
        req.body.purchase_type
          ?.toString()
          .trim() ||
        null;


      const expectedQuantityRaw =
        req.body.expected_quantity;


      const expectedQuantity =
        expectedQuantityRaw !== undefined &&
        expectedQuantityRaw !== null &&
        expectedQuantityRaw !== ''
          ? Number(
              expectedQuantityRaw
            )
          : null;


      const pricePerUnitRaw =
        req.body.price_per_unit;


      const pricePerUnit =
        pricePerUnitRaw !== undefined &&
        pricePerUnitRaw !== null &&
        pricePerUnitRaw !== ''
          ? Number(
              pricePerUnitRaw
            )
          : null;


      const currency =
        req.body.currency
          ?.toString()
          .trim()
          .toUpperCase() ||
        'BOB';


      const shrinkPercentRaw =
        req.body.shrink_percent;


      const shrinkPercent =
        shrinkPercentRaw !== undefined &&
        shrinkPercentRaw !== null &&
        shrinkPercentRaw !== ''
          ? Number(
              shrinkPercentRaw
            )
          : 0;


      const commissionType =
        req.body.commission_type
          ?.toString()
          .trim()
          .toLowerCase() ||
        null;


      const commissionValueRaw =
        req.body.commission_value;


      const commissionValue =
        commissionValueRaw !== undefined &&
        commissionValueRaw !== null &&
        commissionValueRaw !== ''
          ? Number(
              commissionValueRaw
            )
          : null;


      const plannedDate =
        req.body.planned_date
          ?.toString()
          .trim() ||
        null;


      const status =
        req.body.status
          ?.toString()
          .trim()
          .toLowerCase() ||
        'open';


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          sellerPersonId
        ) ||
        sellerPersonId <= 0
      ) {

        return res.status(400).json({
          error:
            'seller_person_id inválido',
        });

      }


      const optionalIds =
        [
          {
            name: 'estate_id',
            value: estateId,
          },
          {
            name: 'captador_person_id',
            value: captadorPersonId,
          },
          {
            name: 'commissioner_person_id',
            value: commissionerPersonId,
          },
          {
            name: 'classification_id',
            value: classificationId,
          },
        ];


      for (
        const item of optionalIds
      ) {

        if (
          item.value !== null &&
          (
            !Number.isInteger(
              item.value
            ) ||
            item.value <= 0
          )
        ) {

          return res.status(400).json({
            error:
              `${item.name} inválido`,
          });

        }

      }


      if (
        expectedQuantity !== null &&
        (
          !Number.isInteger(
            expectedQuantity
          ) ||
          expectedQuantity < 0
        )
      ) {

        return res.status(400).json({
          error:
            'expected_quantity debe ser un entero mayor o igual a 0',
        });

      }


      if (
        pricePerUnit !== null &&
        (
          !Number.isFinite(
            pricePerUnit
          ) ||
          pricePerUnit < 0
        )
      ) {

        return res.status(400).json({
          error:
            'price_per_unit inválido',
        });

      }


      if (
        !Number.isFinite(
          shrinkPercent
        ) ||
        shrinkPercent < 0 ||
        shrinkPercent > 100
      ) {

        return res.status(400).json({
          error:
            'shrink_percent debe estar entre 0 y 100',
        });

      }


      const allowedCommissionTypes =
        [
          'per_head',
          'percent',
          'fixed',
        ];


      if (
        commissionType !== null &&
        !allowedCommissionTypes.includes(
          commissionType
        )
      ) {

        return res.status(400).json({
          error:
            'commission_type inválido',
        });

      }


      if (
        commissionValue !== null &&
        (
          !Number.isFinite(
            commissionValue
          ) ||
          commissionValue < 0
        )
      ) {

        return res.status(400).json({
          error:
            'commission_value inválido',
        });

      }


      if (
        commissionType === 'percent' &&
        commissionValue !== null &&
        commissionValue > 100
      ) {

        return res.status(400).json({
          error:
            'La comisión porcentual no puede superar 100',
        });

      }


      if (
        commissionType === null &&
        commissionValue !== null
      ) {

        return res.status(400).json({
          error:
            'Debe indicar commission_type si existe commission_value',
        });

      }


      if (
        commissionType !== null &&
        commissionValue === null
      ) {

        return res.status(400).json({
          error:
            'Debe indicar commission_value',
        });

      }


      if (
        ![
          'draft',
          'open',
        ].includes(
          status
        )
      ) {

        return res.status(400).json({
          error:
            'Desde esta edición el estado solo puede ser draft u open',
        });

      }


      if (
        plannedDate !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(
          plannedDate
        )
      ) {

        return res.status(400).json({
          error:
            'planned_date debe tener formato YYYY-MM-DD',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // BLOQUEAR Y OBTENER LOTE ACTUAL
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Lote de compra no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // BLOQUEO POR ESTADO OPERATIVO
      // =================================================

      if (
        ![
          'draft',
          'open',
        ].includes(
          previous.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `El lote ya está en estado ${previous.status} y sus datos comerciales no pueden modificarse`,
        });

      }


      // =================================================
      // VALIDAR VENDEDOR
      // =================================================

      const sellerResult =
        await client.query(
          `
            SELECT sp.id

            FROM slaughterhouse_people sp

            WHERE
              sp.id = $1
              AND sp.company_id = $2
              AND sp.is_active = true

              AND EXISTS (
                SELECT 1

                FROM slaughterhouse_person_roles spr

                WHERE
                  spr.person_id = sp.id
                  AND spr.role = 'seller'
                  AND spr.is_active = true
              )

            LIMIT 1
          `,
          [
            sellerPersonId,
            companyId,
          ],
        );


      if (
        sellerResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'El vendedor no existe, está inactivo o no tiene rol seller',
        });

      }


      // =================================================
      // VALIDAR ESTANCIA
      // =================================================

      if (
        estateId !== null
      ) {

        const estateResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_estates

              WHERE
                id = $1
                AND company_id = $2
                AND seller_person_id = $3
                AND is_active = true

              LIMIT 1
            `,
            [
              estateId,
              companyId,
              sellerPersonId,
            ],
          );


        if (
          estateResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'La estancia no existe, está inactiva o no pertenece al vendedor seleccionado',
          });

        }

      }


      // =================================================
      // VALIDAR CAPTADOR
      // =================================================

      if (
        captadorPersonId !== null
      ) {

        const captadorResult =
          await client.query(
            `
              SELECT sp.id

              FROM slaughterhouse_people sp

              WHERE
                sp.id = $1
                AND sp.company_id = $2
                AND sp.is_active = true

                AND EXISTS (
                  SELECT 1

                  FROM slaughterhouse_person_roles spr

                  WHERE
                    spr.person_id = sp.id
                    AND spr.role = 'captador'
                    AND spr.is_active = true
                )

              LIMIT 1
            `,
            [
              captadorPersonId,
              companyId,
            ],
          );


        if (
          captadorResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El captador no existe, está inactivo o no tiene rol captador',
          });

        }

      }


      // =================================================
      // VALIDAR COMISIONISTA
      // =================================================

      if (
        commissionerPersonId !== null
      ) {

        const commissionerResult =
          await client.query(
            `
              SELECT sp.id

              FROM slaughterhouse_people sp

              WHERE
                sp.id = $1
                AND sp.company_id = $2
                AND sp.is_active = true

                AND EXISTS (
                  SELECT 1

                  FROM slaughterhouse_person_roles spr

                  WHERE
                    spr.person_id = sp.id
                    AND spr.role = 'commissioner'
                    AND spr.is_active = true
                )

              LIMIT 1
            `,
            [
              commissionerPersonId,
              companyId,
            ],
          );


        if (
          commissionerResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El comisionista no existe, está inactivo o no tiene rol commissioner',
          });

        }

      }


      // =================================================
      // VALIDAR CLASIFICACIÓN
      // =================================================

      if (
        classificationId !== null
      ) {

        const classificationResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_animal_classifications

              WHERE
                id = $1
                AND company_id = $2
                AND is_active = true

              LIMIT 1
            `,
            [
              classificationId,
              companyId,
            ],
          );


        if (
          classificationResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'Clasificación animal no encontrada o inactiva',
          });

        }

      }


      // =================================================
      // ACTUALIZAR
      //
      // lot_number NO SE TOCA.
      // Es identificador interno permanente.
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_purchase_lots

            SET
              external_order_number = $1,
              seller_person_id = $2,
              estate_id = $3,
              captador_person_id = $4,
              commissioner_person_id = $5,
              classification_id = $6,
              purchase_type = $7,
              expected_quantity = $8,
              price_per_unit = $9,
              currency = $10,
              shrink_percent = $11,
              commission_type = $12,
              commission_value = $13,
              planned_date = $14,
              status = $15,
              notes = $16,
              updated_at = NOW()

            WHERE
              id = $17
              AND company_id = $18

            RETURNING *
          `,
          [
            externalOrderNumber,
            sellerPersonId,
            estateId,
            captadorPersonId,
            commissionerPersonId,
            classificationId,
            purchaseType,
            expectedQuantity,
            pricePerUnit,
            currency,
            shrinkPercent,
            commissionType,
            commissionValue,
            plannedDate,
            status,
            notes,
            purchaseLotId,
            companyId,
          ],
        );


      const purchaseLot =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'purchase_lot',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            purchaseLotId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify(
            purchaseLot
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Lote de compra actualizado correctamente',

        purchase_lot:
          purchaseLot,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE PURCHASE LOT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error actualizando lote de compra',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ❌ CANCELAR LOTE DE COMPRA
// PATCH /slaughterhouse/admin/purchase-lots/:id/cancel
//
// Solo puede cancelarse directamente si está:
// - draft
// - open
//
// Si ya avanzó a transporte / recepción / faena,
// deberá utilizarse el flujo operativo correspondiente.
// =====================================================

exports.cancelPurchaseLot =
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


      const purchaseLotId =
        Number(
          req.params.id
        );


      const reason =
        req.body.reason
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de lote inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR LOTE
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Lote de compra no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // VALIDAR ESTADO ACTUAL
      // =================================================

      if (
        previous.status ===
        'cancelled'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El lote ya está cancelado',
        });

      }


      if (
        ![
          'draft',
          'open',
        ].includes(
          previous.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `El lote está en estado ${previous.status} y ya no puede cancelarse desde el flujo comercial`,
        });

      }


      // =================================================
      // CANCELAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_purchase_lots

            SET
              status = 'cancelled',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2

            RETURNING *
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      const purchaseLot =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'purchase_lot',
            $3,
            'cancel',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            purchaseLotId
          ),
          JSON.stringify(
            previous
          ),
          JSON.stringify({
            ...purchaseLot,
            cancellation_reason:
              reason,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Lote de compra cancelado correctamente',

        purchase_lot:
          purchaseLot,

        cancellation_reason:
          reason,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CANCEL SLAUGHTERHOUSE PURCHASE LOT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cancelando lote de compra',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ♻️ REACTIVAR LOTE DE COMPRA
// PATCH /slaughterhouse/admin/purchase-lots/:id/reactivate
//
// Solo puede reactivarse si:
// - está cancelled
// - no tiene tropas
// - no tiene pesajes
// - no tiene autorizaciones QR
// - no tiene preliquidaciones
//
// Al reactivar vuelve a:
// open
// =====================================================

exports.reactivatePurchaseLot =
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


      const purchaseLotId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de lote inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR LOTE
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Lote de compra no encontrado',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // DEBE ESTAR CANCELADO
      // =================================================

      if (
        previous.status !==
        'cancelled'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'Solo puede reactivarse un lote cancelado',
        });

      }


      // =================================================
      // VERIFICAR ACTIVIDAD OPERATIVA
      // =================================================

      const activityResult =
        await client.query(
          `
            SELECT

              (
                SELECT COUNT(*)::int

                FROM slaughterhouse_troops

                WHERE
                  purchase_lot_id = $1
                  AND company_id = $2
              )
                AS troops_count,

              (
                SELECT COUNT(*)::int

                FROM slaughterhouse_live_weighings

                WHERE
                  purchase_lot_id = $1
                  AND company_id = $2
              )
                AS weighings_count,

              (
                SELECT COUNT(*)::int

                FROM slaughterhouse_weighing_authorizations

                WHERE
                  purchase_lot_id = $1
                  AND company_id = $2
              )
                AS authorizations_count,

              (
                SELECT COUNT(*)::int

                FROM slaughterhouse_preliquidations

                WHERE
                  purchase_lot_id = $1
                  AND company_id = $2
              )
                AS preliquidations_count
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      const activity =
        activityResult.rows[0];


      const hasOperationalActivity =
        Number(
          activity.troops_count
        ) > 0 ||

        Number(
          activity.weighings_count
        ) > 0 ||

        Number(
          activity.authorizations_count
        ) > 0 ||

        Number(
          activity.preliquidations_count
        ) > 0;


      if (
        hasOperationalActivity
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El lote tiene actividad operativa asociada y no puede reactivarse',

          activity: {
            troops:
              Number(
                activity.troops_count
              ),

            weighings:
              Number(
                activity.weighings_count
              ),

            authorizations:
              Number(
                activity.authorizations_count
              ),

            preliquidations:
              Number(
                activity.preliquidations_count
              ),
          },
        });

      }


      // =================================================
      // REACTIVAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_purchase_lots

            SET
              status = 'open',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2

            RETURNING *
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      const purchaseLot =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'purchase_lot',
            $3,
            'reactivate',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,

          String(
            purchaseLotId
          ),

          JSON.stringify(
            previous
          ),

          JSON.stringify(
            purchaseLot
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Lote de compra reactivado correctamente',

        purchase_lot:
          purchaseLot,
      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'REACTIVATE SLAUGHTERHOUSE PURCHASE LOT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error reactivando lote de compra',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 🚛 LISTAR TROPAS
// GET /slaughterhouse/admin/troops
//
// Filtros opcionales:
// ?purchase_lot_id=1
// ?status=planned
// ?q=123
// =====================================================

exports.getTroops =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const purchaseLotIdRaw =
        req.query.purchase_lot_id;


      const purchaseLotId =
        purchaseLotIdRaw !== undefined &&
        purchaseLotIdRaw !== null &&
        purchaseLotIdRaw !== ''
          ? Number(
              purchaseLotIdRaw
            )
          : null;


      const status =
        req.query.status
          ?.toString()
          .trim()
          .toLowerCase() ||
        null;


      const q =
        req.query.q
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        purchaseLotId !== null &&
        (
          !Number.isInteger(
            purchaseLotId
          ) ||
          purchaseLotId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'purchase_lot_id inválido',
        });

      }


      const allowedStatuses =
        [
          'planned',
          'transport_requested',
          'transport_assigned',
          'dispatched',
          'in_transit',
          'received',
          'in_slaughter',
          'completed',
          'cancelled',
        ];


      if (
        status !== null &&
        !allowedStatuses.includes(
          status
        )
      ) {

        return res.status(400).json({
          error:
            'Estado de tropa inválido',
        });

      }


      // =================================================
      // CONSULTA
      // =================================================

      const result =
        await pool.query(
          `
            SELECT

              st.id,
              st.company_id,
              st.purchase_lot_id,

              spl.lot_number,
              spl.external_order_number,
              spl.status
                AS purchase_lot_status,

              spl.seller_person_id,

              seller.full_name
                AS seller_name,

              st.troop_number,

              st.transport_request_id,
              st.transport_negotiation_id,
              st.transport_guide_id,

              st.truck_id,
              st.transporter_user_id,

              st.reception_id,
              st.reception_truck_id,

              st.expected_quantity,
              st.dispatched_quantity,
              st.received_quantity,

              st.status,
              st.notes,

              st.created_by,
              st.created_at,
              st.updated_at

            FROM slaughterhouse_troops st

            JOIN slaughterhouse_purchase_lots spl
              ON spl.id =
                st.purchase_lot_id
              AND spl.company_id =
                st.company_id

            JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id
              AND seller.company_id =
                st.company_id

            WHERE
              st.company_id = $1

              AND (
                $2::int IS NULL
                OR st.purchase_lot_id = $2
              )

              AND (
                $3::text IS NULL
                OR st.status = $3
              )

              AND (
                $4::text IS NULL

                OR st.troop_number ILIKE
                  '%' || $4 || '%'

                OR spl.lot_number ILIKE
                  '%' || $4 || '%'

                OR spl.external_order_number ILIKE
                  '%' || $4 || '%'

                OR seller.full_name ILIKE
                  '%' || $4 || '%'
              )

            ORDER BY

              CASE

                WHEN st.status = 'in_transit'
                  THEN 1

                WHEN st.status = 'transport_assigned'
                  THEN 2

                WHEN st.status = 'transport_requested'
                  THEN 3

                WHEN st.status = 'planned'
                  THEN 4

                WHEN st.status = 'dispatched'
                  THEN 5

                WHEN st.status = 'received'
                  THEN 6

                WHEN st.status = 'in_slaughter'
                  THEN 7

                WHEN st.status = 'completed'
                  THEN 8

                WHEN st.status = 'cancelled'
                  THEN 9

                ELSE 10

              END,

              st.created_at DESC,
              st.id DESC
          `,
          [
            companyId,
            purchaseLotId,
            status,
            q,
          ],
        );


      return res.json({
        success: true,

        count:
          result.rows.length,

        troops:
          result.rows,
      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE TROOPS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo tropas',
      });

    }

  };
  
// =====================================================
// ➕ CREAR TROPA
// POST /slaughterhouse/admin/troops
//
// Body:
//
// {
//   "purchase_lot_id": 1,
//   "troop_number": null,
//   "expected_quantity": 35,
//   "notes": null
// }
//
// Reglas:
// - El lote debe pertenecer al frigorífico.
// - Solo puede agregarse una tropa si el lote está
//   open o in_transport.
// - troop_number puede ser NULL.
// - La tropa nace siempre en status planned.
// =====================================================

exports.createTroop =
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


      const purchaseLotId =
        Number(
          req.body.purchase_lot_id
        );


      const troopNumber =
        req.body.troop_number
          ?.toString()
          .trim() ||
        null;


      const expectedQuantityRaw =
        req.body.expected_quantity;


      const expectedQuantity =
        expectedQuantityRaw !== undefined &&
        expectedQuantityRaw !== null &&
        expectedQuantityRaw !== ''
          ? Number(
              expectedQuantityRaw
            )
          : null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {

        return res.status(400).json({
          error:
            'purchase_lot_id inválido',
        });

      }


      if (
        troopNumber !== null &&
        troopNumber.length > 100
      ) {

        return res.status(400).json({
          error:
            'troop_number no puede superar 100 caracteres',
        });

      }


      if (
        expectedQuantity !== null &&
        (
          !Number.isInteger(
            expectedQuantity
          ) ||
          expectedQuantity < 0
        )
      ) {

        return res.status(400).json({
          error:
            'expected_quantity debe ser un entero mayor o igual a 0',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // VALIDAR Y BLOQUEAR LOTE
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              id,
              lot_number,
              status,
              expected_quantity

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        lotResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Lote de compra no encontrado',
        });

      }


      const purchaseLot =
        lotResult.rows[0];


      // =================================================
      // SOLO LOTES OPERATIVAMENTE ABIERTOS
      //
      // in_transport también se permite porque un lote
      // puede estar compuesto por varios camiones y
      // todavía requerir una nueva tropa.
      // =================================================

      if (
        ![
          'open',
          'in_transport',
        ].includes(
          purchaseLot.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `No puede crearse una tropa para un lote en estado ${purchaseLot.status}`,
        });

      }


      // =================================================
      // CREAR TROPA
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_troops (
              company_id,
              purchase_lot_id,
              troop_number,
              expected_quantity,
              status,
              notes,
              created_by
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              'planned',
              $5,
              $6
            )

            RETURNING *
          `,
          [
            companyId,
            purchaseLotId,
            troopNumber,
            expectedQuantity,
            notes,
            userId,
          ],
        );


      const troop =
        result.rows[0];


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
            'troop',
            $3,
            'create',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,

          String(
            troop.id
          ),

          JSON.stringify(
            troop
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({

        success: true,

        message:
          'Tropa creada correctamente',

        troop,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una tropa con ese número',
        });

      }


      return res.status(500).json({
        error:
          'Error creando tropa',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ✏️ EDITAR TROPA
// PUT /slaughterhouse/admin/troops/:id
//
// Body:
//
// {
//   "troop_number": null,
//   "expected_quantity": 35,
//   "notes": null
// }
//
// Reglas:
// - NO cambia purchase_lot_id.
// - NO cambia status.
// - NO cambia vínculos de transporte.
// - planned:
//     puede editar todo.
// - transport_requested:
//     puede editar troop_number y notes,
//     pero NO expected_quantity.
// =====================================================

exports.updateTroop =
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


      const troopId =
        Number(
          req.params.id
        );


      const troopNumber =
        req.body.troop_number
          ?.toString()
          .trim() ||
        null;


      const expectedQuantityRaw =
        req.body.expected_quantity;


      const expectedQuantity =
        expectedQuantityRaw !== undefined &&
        expectedQuantityRaw !== null &&
        expectedQuantityRaw !== ''
          ? Number(
              expectedQuantityRaw
            )
          : null;


      const notes =
        req.body.notes
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de tropa inválido',
        });

      }


      if (
        troopNumber !== null &&
        troopNumber.length > 100
      ) {

        return res.status(400).json({
          error:
            'troop_number no puede superar 100 caracteres',
        });

      }


      if (
        expectedQuantity !== null &&
        (
          !Number.isInteger(
            expectedQuantity
          ) ||
          expectedQuantity < 0
        )
      ) {

        return res.status(400).json({
          error:
            'expected_quantity debe ser un entero mayor o igual a 0',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR TROPA
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_troops

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // ESTADOS EDITABLES
      // =================================================

      if (
        ![
          'planned',
          'transport_requested',
        ].includes(
          previous.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status} y ya no puede editarse desde este formulario`,
        });

      }


      // =================================================
      // SI YA SOLICITÓ TRANSPORTE,
      // BLOQUEAMOS CAMBIO DE CANTIDAD
      // =================================================

      if (
        previous.status ===
          'transport_requested' &&
        Number(
          previous.expected_quantity
        ) !==
          Number(
            expectedQuantity
          )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La cantidad ya no puede modificarse porque el transporte fue solicitado',
        });

      }


      // =================================================
      // ACTUALIZAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              troop_number = $1,
              expected_quantity = $2,
              notes = $3,
              updated_at = NOW()

            WHERE
              id = $4
              AND company_id = $5

            RETURNING *
          `,
          [
            troopNumber,
            expectedQuantity,
            notes,
            troopId,
            companyId,
          ],
        );


      const troop =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'troop',
            $3,
            'update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,

          String(
            troopId
          ),

          JSON.stringify(
            previous
          ),

          JSON.stringify(
            troop
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Tropa actualizada correctamente',

        troop,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una tropa con ese número',
        });

      }


      return res.status(500).json({
        error:
          'Error actualizando tropa',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ❌ CANCELAR TROPA
// PATCH /slaughterhouse/admin/troops/:id/cancel
//
// Cancelación directa solamente si:
// - status = planned
// - todavía no tiene vínculos operativos de transporte
//
// No se elimina ningún registro.
// =====================================================

exports.cancelTroop =
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


      const troopId =
        Number(
          req.params.id
        );


      const reason =
        req.body.reason
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de tropa inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR TROPA
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_troops

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // YA CANCELADA
      // =================================================

      if (
        previous.status ===
        'cancelled'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa ya está cancelada',
        });

      }


      // =================================================
      // SOLO CANCELACIÓN DIRECTA EN PLANNED
      // =================================================

      if (
        previous.status !==
        'planned'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status}. Debe cancelarse desde el flujo operativo correspondiente`,
        });

      }


      // =================================================
      // SEGURIDAD:
      // NO DEBE TENER VÍNCULOS DE TRANSPORTE/RECEPCIÓN
      // =================================================

      const hasOperationalLinks =
        previous.transport_request_id !== null ||
        previous.transport_negotiation_id !== null ||
        previous.transport_guide_id !== null ||
        previous.truck_id !== null ||
        previous.transporter_user_id !== null ||
        previous.reception_id !== null ||
        previous.reception_truck_id !== null;


      if (
        hasOperationalLinks
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa ya tiene vínculos operativos y no puede cancelarse directamente',
        });

      }


      // =================================================
      // VERIFICAR QUE NO TENGA PESAJES
      // =================================================

      const weighingResult =
        await client.query(
          `
            SELECT COUNT(*)::int
              AS count

            FROM slaughterhouse_live_weighings

            WHERE
              troop_id = $1
              AND company_id = $2
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        Number(
          weighingResult.rows[0].count
        ) > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa tiene pesajes asociados y no puede cancelarse directamente',
        });

      }


      // =================================================
      // CANCELAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              status = 'cancelled',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2

            RETURNING *
          `,
          [
            troopId,
            companyId,
          ],
        );


      const troop =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'troop',
            $3,
            'cancel',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,

          String(
            troopId
          ),

          JSON.stringify(
            previous
          ),

          JSON.stringify({
            ...troop,
            cancellation_reason:
              reason,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Tropa cancelada correctamente',

        troop,

        cancellation_reason:
          reason,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CANCEL SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cancelando tropa',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// ♻️ REACTIVAR TROPA
// PATCH /slaughterhouse/admin/troops/:id/reactivate
//
// Solo puede reactivarse si:
// - status = cancelled
// - no tiene vínculos de transporte
// - no tiene vínculos de recepción
// - no tiene pesajes asociados
//
// Al reactivar vuelve a:
// planned
// =====================================================

exports.reactivateTroop =
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


      const troopId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de tropa inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR TROPA
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_troops

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        previousResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // DEBE ESTAR CANCELADA
      // =================================================

      if (
        previous.status !==
        'cancelled'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'Solo puede reactivarse una tropa cancelada',
        });

      }


      // =================================================
      // VERIFICAR VÍNCULOS OPERATIVOS
      // =================================================

      const hasOperationalLinks =
        previous.transport_request_id !== null ||
        previous.transport_negotiation_id !== null ||
        previous.transport_guide_id !== null ||
        previous.truck_id !== null ||
        previous.transporter_user_id !== null ||
        previous.reception_id !== null ||
        previous.reception_truck_id !== null;


      if (
        hasOperationalLinks
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa tiene vínculos operativos y no puede reactivarse',
        });

      }


      // =================================================
      // VERIFICAR PESAJES
      // =================================================

      const weighingResult =
        await client.query(
          `
            SELECT COUNT(*)::int
              AS count

            FROM slaughterhouse_live_weighings

            WHERE
              troop_id = $1
              AND company_id = $2
          `,
          [
            troopId,
            companyId,
          ],
        );


      const weighingsCount =
        Number(
          weighingResult.rows[0].count
        );


      if (
        weighingsCount > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa tiene pesajes asociados y no puede reactivarse',

          weighings_count:
            weighingsCount,
        });

      }


      // =================================================
      // REACTIVAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              status = 'planned',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2

            RETURNING *
          `,
          [
            troopId,
            companyId,
          ],
        );


      const troop =
        result.rows[0];


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
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'troop',
            $3,
            'reactivate',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,

          String(
            troopId
          ),

          JSON.stringify(
            previous
          ),

          JSON.stringify(
            troop
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Tropa reactivada correctamente',

        troop,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'REACTIVATE SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error reactivando tropa',
      });

    } finally {

      client.release();

    }

  };  