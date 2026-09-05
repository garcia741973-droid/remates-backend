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
  
// =====================================================
// 🚛 SOLICITAR TRANSPORTE PARA UNA TROPA
// POST /slaughterhouse/admin/troops/:id/request-transport
//
// Body opcional:
//
// {
//   "visibility_scope": "company_network",
//   "notes": null
// }
//
// visibility_scope:
// - company_network  → red privada del frigorífico
// - public           → toda Plaza Transporte
//
// selected se implementará mediante el flujo específico
// de invitaciones.
// =====================================================

exports.requestTransportForTroop =
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


      const visibilityScope =
        req.body.visibility_scope
          ?.toString()
          .trim()
          .toLowerCase() ||
        'company_network';


      const extraNotes =
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
        ![
          'company_network',
          'public',
        ].includes(
          visibilityScope
        )
      ) {

        return res.status(400).json({
          error:
            'visibility_scope debe ser company_network o public',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER TROPA + LOTE + ORIGEN + DESTINO
      // =================================================

      const contextResult =
        await client.query(
          `
            SELECT

              st.id
                AS troop_id,

              st.status
                AS troop_status,

              st.expected_quantity
                AS troop_expected_quantity,

              st.transport_request_id,

              st.notes
                AS troop_notes,


              spl.id
                AS purchase_lot_id,

              spl.lot_number,

              spl.external_order_number,

              spl.status
                AS purchase_lot_status,

              spl.planned_date,

              spl.seller_person_id,

              spl.classification_id,


              seller.full_name
                AS seller_name,

              seller.phone
                AS seller_phone,


              estate.id
                AS estate_id,

              estate.name
                AS estate_name,

              estate.location_text
                AS estate_location,

              estate.lat
                AS estate_lat,

              estate.lng
                AS estate_lng,


              classification.generated_code
                AS classification_code,

              classification.display_name
                AS classification_name,


              company.name
                AS company_name,

              company.plant_lat,

              company.plant_lng

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

            LEFT JOIN slaughterhouse_estates estate
              ON estate.id =
                spl.estate_id
              AND estate.company_id =
                st.company_id

            LEFT JOIN slaughterhouse_animal_classifications classification
              ON classification.id =
                spl.classification_id
              AND classification.company_id =
                st.company_id

            JOIN companies company
              ON company.id =
                st.company_id

            WHERE
              st.id = $1
              AND st.company_id = $2

            FOR UPDATE OF st, spl
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        contextResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const context =
        contextResult.rows[0];


      // =================================================
      // TROPA DEBE ESTAR PLANIFICADA
      // =================================================

      if (
        context.troop_status !==
        'planned'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${context.troop_status} y no puede generar una nueva solicitud de transporte`,
        });

      }


      // =================================================
      // EVITAR DOBLE SOLICITUD
      // =================================================

      if (
        context.transport_request_id !==
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa ya tiene una solicitud de transporte',

          transport_request_id:
            context.transport_request_id,
        });

      }


      // =================================================
      // EL LOTE DEBE ESTAR OPERATIVO
      // =================================================

      if (
        ![
          'open',
          'in_transport',
        ].includes(
          context.purchase_lot_status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `El lote está en estado ${context.purchase_lot_status} y no puede solicitar transporte`,
        });

      }


      // =================================================
      // NECESITAMOS CANTIDAD
      // transport_requests.quantity es NOT NULL
      // =================================================

      const quantity =
        Number(
          context.troop_expected_quantity
        );


      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'La tropa debe tener una cantidad esperada mayor a 0 antes de solicitar transporte',
        });

      }


      // =================================================
      // NECESITAMOS ORIGEN
      // =================================================

      if (
        !context.estate_id
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'El lote debe tener una estancia de origen antes de solicitar transporte',
        });

      }


      const origin =
        [
          context.estate_name,
          context.estate_location,
        ]
          .filter(
            Boolean
          )
          .join(' - ');


      if (
        !origin
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'La estancia debe tener un nombre o ubicación válida',
        });

      }


      // =================================================
      // DESTINO = PLANTA DEL FRIGORÍFICO
      // =================================================

      const destination =
        context.company_name;


      if (
        !destination
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'El frigorífico no tiene un nombre válido para usar como destino',
        });

      }


      // =================================================
      // TIPO DE ANIMAL
      //
      // transport_requests.animal_type es NOT NULL.
      // Preferimos la clasificación completa.
      // Si todavía no existe clasificación:
      // "Ganado bovino"
      // =================================================

      const animalType =
        context.classification_name ||
        context.classification_code ||
        'Ganado bovino';


      // =================================================
      // NOTAS DE TRAZABILIDAD
      // =================================================

      const transportNotes =
        [
          `Frigosi - Lote ${context.lot_number}`,

          context.external_order_number
            ? `Orden externa: ${context.external_order_number}`
            : null,

          `Tropa interna ID: ${troopId}`,

          context.seller_name
            ? `Vendedor: ${context.seller_name}`
            : null,

          context.troop_notes
            ? `Nota tropa: ${context.troop_notes}`
            : null,

          extraNotes,
        ]
          .filter(
            Boolean
          )
          .join('\n');


      // =================================================
      // CREAR SOLICITUD EN PLAZA TRANSPORTE
      // =================================================

      const requestResult =
        await client.query(
          `
            INSERT INTO transport_requests (
              user_id,
              origin,
              destination,
              quantity,
              animal_type,
              travel_date,
              notes,
              contact_phone,
              status,

              origin_lat,
              origin_lng,

              destination_lat,
              destination_lng,

              approx_pickup_lat,
              approx_pickup_lng,
              approx_pickup_notes,
              approx_pickup_source,

              approx_dropoff_lat,
              approx_dropoff_lng,
              approx_dropoff_notes,
              approx_dropoff_source,

              requester_company_id,
              visibility_scope
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              'open',

              $9,
              $10,

              $11,
              $12,

              $9,
              $10,
              $2,
              'slaughterhouse',

              $11,
              $12,
              $3,
              'slaughterhouse',

              $13,
              $14
            )

            RETURNING *
          `,
          [
            userId,

            origin,

            destination,

            quantity,

            animalType,

            context.planned_date,

            transportNotes,

            context.seller_phone,

            context.estate_lat,

            context.estate_lng,

            context.plant_lat,

            context.plant_lng,

            companyId,

            visibilityScope,
          ],
        );


      const transportRequest =
        requestResult.rows[0];


      // =================================================
      // VINCULAR SOLICITUD CON TROPA
      // =================================================

      const troopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              transport_request_id = $1,
              status = 'transport_requested',
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            transportRequest.id,
            troopId,
            companyId,
          ],
        );


      const troop =
        troopResult.rows[0];


      // =================================================
      // EL LOTE ENTRA A FASE DE TRANSPORTE
      // =================================================

      await client.query(
        `
          UPDATE slaughterhouse_purchase_lots

          SET
            status = 'in_transport',
            updated_at = NOW()

          WHERE
            id = $1
            AND company_id = $2
            AND status = 'open'
        `,
        [
          context.purchase_lot_id,
          companyId,
        ],
      );


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
            'request_transport',
            $4::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            troopId
          ),

          JSON.stringify({
            transport_request_id:
              transportRequest.id,

            visibility_scope:
              visibilityScope,

            troop_status:
              troop.status,

            purchase_lot_id:
              context.purchase_lot_id,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({

        success: true,

        message:
          visibilityScope ===
          'company_network'
            ? 'Solicitud enviada a la red privada de transportistas'
            : 'Solicitud publicada en Plaza Transporte',

        troop,

        transport_request:
          transportRequest,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'REQUEST TRANSPORT FOR SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error solicitando transporte para la tropa',
      });

    } finally {

      client.release();

    }

  };
  
  
// =====================================================
// 🚛 ESTADO DE TRANSPORTE DE UNA TROPA
// GET /slaughterhouse/admin/troops/:id/transport
//
// Devuelve:
// - tropa
// - solicitud de Plaza Transporte
// - todas las negociaciones
// - negociación vinculada a la tropa, si existe
// - camionista
// - camión
// - guía, si existe
//
// IMPORTANTE:
// transport_guides.share_token NO se expone.
// =====================================================

exports.getTroopTransport =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
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


      // =================================================
      // OBTENER TROPA
      // =================================================

      const troopResult =
        await pool.query(
          `
            SELECT

              st.id,
              st.company_id,
              st.purchase_lot_id,
              st.troop_number,
              st.status,

              st.transport_request_id,
              st.transport_negotiation_id,
              st.transport_guide_id,

              st.truck_id,
              st.transporter_user_id,

              st.expected_quantity,
              st.dispatched_quantity,
              st.received_quantity,

              spl.lot_number,
              spl.external_order_number,

              seller.full_name
                AS seller_name

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
              st.id = $1
              AND st.company_id = $2

            LIMIT 1
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        troopResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const troop =
        troopResult.rows[0];


      // =================================================
      // SI TODAVÍA NO HAY SOLICITUD
      // =================================================

      if (
        troop.transport_request_id ===
        null
      ) {

        return res.json({

          success: true,

          has_transport_request:
            false,

          troop,

          transport_request:
            null,

          negotiations: [],

          selected_negotiation:
            null,

          guide:
            null,

        });

      }


      // =================================================
      // SOLICITUD DE TRANSPORTE
      // =================================================

      const requestResult =
        await pool.query(
          `
            SELECT

              tr.id,
              tr.user_id,

              tr.origin,
              tr.destination,

              tr.quantity,
              tr.animal_type,
              tr.travel_date,

              tr.notes,
              tr.contact_phone,

              tr.status,

              tr.origin_lat,
              tr.origin_lng,

              tr.destination_lat,
              tr.destination_lng,

              tr.approx_pickup_lat,
              tr.approx_pickup_lng,
              tr.approx_pickup_notes,
              tr.approx_pickup_source,

              tr.approx_dropoff_lat,
              tr.approx_dropoff_lng,
              tr.approx_dropoff_notes,
              tr.approx_dropoff_source,

              tr.requester_company_id,
              tr.visibility_scope,

              tr.created_at

            FROM transport_requests tr

            WHERE
              tr.id = $1
              AND tr.requester_company_id = $2

            LIMIT 1
          `,
          [
            troop.transport_request_id,
            companyId,
          ],
        );


      if (
        requestResult.rows.length === 0
      ) {

        return res.status(409).json({
          error:
            'La tropa tiene transport_request_id pero la solicitud no existe o no pertenece al frigorífico',
        });

      }


      const transportRequest =
        requestResult.rows[0];


      // =================================================
      // NEGOCIACIONES
      //
      // Una solicitud puede recibir varias propuestas.
      // =================================================

      const negotiationsResult =
        await pool.query(
          `
            SELECT

              tn.id,
              tn.request_id,

              tn.truck_id,

              tn.requester_id,
              tn.transporter_id,

              tn.status,
              tn.trip_price,
              tn.unlock_fee,

              tn.real_origin_lat,
              tn.real_origin_lng,

              tn.destination_reference,
              tn.destination_lat,
              tn.destination_lng,

              tn.trip_started_at,
              tn.route_id,

              tn.delivered_at,

              tn.real_destination_lat,
              tn.real_destination_lng,

              tn.cancelled,

              tn.chat_available_until,

              tn.created_at,


              truck.plate,

              truck.brand,
              truck.model,
              truck.year,

              truck.truck_type,

              truck.capacity_large,
              truck.capacity_small,

              truck.has_trailer,
              truck.trailer_capacity,

              truck.is_verified,
              truck.is_active,
              truck.is_available,


              transporter.name
                AS transporter_name,

              transporter.phone
                AS transporter_phone

            FROM transport_negotiations tn

            JOIN transporter_trucks truck
              ON truck.id =
                tn.truck_id

            JOIN users transporter
              ON transporter.id =
                tn.transporter_id

            WHERE
              tn.request_id = $1

            ORDER BY

              CASE

                WHEN tn.id = $2
                  THEN 0

                WHEN tn.cancelled = false
                  THEN 1

                ELSE 2

              END,

              tn.created_at DESC,
              tn.id DESC
          `,
          [
            transportRequest.id,

            troop.transport_negotiation_id,
          ],
        );


      const negotiations =
        negotiationsResult.rows;


      // =================================================
      // NEGOCIACIÓN SELECCIONADA / VINCULADA
      // =================================================

      const selectedNegotiation =
        troop.transport_negotiation_id
          ? negotiations.find(
              (item) =>
                Number(
                  item.id
                ) ===
                Number(
                  troop.transport_negotiation_id
                )
            ) || null
          : null;


      // =================================================
      // GUÍA
      //
      // Primero usamos transport_guide_id de la tropa.
      // Si todavía no quedó vinculado pero existe guía
      // para la negociación seleccionada, también la
      // podemos encontrar por negotiation_id.
      //
      // NO devolvemos share_token.
      // =================================================

      let guide =
        null;


      if (
        troop.transport_guide_id !==
        null
      ) {

        const guideResult =
          await pool.query(
            `
              SELECT

                tg.id,
                tg.truck_id,
                tg.user_id,
                tg.negotiation_id,

                tg.origin,
                tg.destination,

                tg.driver_name,
                tg.driver_ci,

                tg.plate,

                tg.male_0_12,
                tg.female_0_12,

                tg.male_13_24,
                tg.female_13_24,

                tg.male_25_36,
                tg.female_25_36,

                tg.male_36_plus,
                tg.female_36_plus,

                tg.guide_image_url,

                tg.status,

                tg.official_guide_photo_url,
                tg.official_uploaded_at,
                tg.official_guide_number,

                tg.created_at

              FROM transport_guides tg

              WHERE
                tg.id = $1

              LIMIT 1
            `,
            [
              troop.transport_guide_id,
            ],
          );


        guide =
          guideResult.rows[0] ||
          null;

      } else if (
        troop.transport_negotiation_id !==
        null
      ) {

        const guideResult =
          await pool.query(
            `
              SELECT

                tg.id,
                tg.truck_id,
                tg.user_id,
                tg.negotiation_id,

                tg.origin,
                tg.destination,

                tg.driver_name,
                tg.driver_ci,

                tg.plate,

                tg.male_0_12,
                tg.female_0_12,

                tg.male_13_24,
                tg.female_13_24,

                tg.male_25_36,
                tg.female_25_36,

                tg.male_36_plus,
                tg.female_36_plus,

                tg.guide_image_url,

                tg.status,

                tg.official_guide_photo_url,
                tg.official_uploaded_at,
                tg.official_guide_number,

                tg.created_at

              FROM transport_guides tg

              WHERE
                tg.negotiation_id = $1

              ORDER BY
                tg.created_at DESC,
                tg.id DESC

              LIMIT 1
            `,
            [
              troop.transport_negotiation_id,
            ],
          );


        guide =
          guideResult.rows[0] ||
          null;

      }

      // =================================================
      // ESTADO DE AUTORIZACIÓN / PAGO DEL VIAJE
      // =================================================

      let paymentAuthorization =
        null;


      if (
        troop.transport_negotiation_id !==
        null
      ) {

        const paymentResult =
          await pool.query(
            `
              SELECT

                id,
                company_id,
                negotiation_id,
                troop_id,

                company_payment_account_id,

                trip_price_snapshot,

                status,

                payment_reference,
                notes,

                authorized_by,
                authorized_at,

                paid_at,

                created_at

              FROM transport_trip_payment_authorizations

              WHERE
                company_id = $1
                AND troop_id = $2
                AND negotiation_id = $3

              LIMIT 1
            `,
            [
              companyId,
              troopId,
              troop.transport_negotiation_id,
            ],
          );


        paymentAuthorization =
          paymentResult.rows[0] ||
          null;

      }


      const paymentStatus =
        paymentAuthorization
          ? paymentAuthorization.status
          : 'not_authorized';

      // =================================================
      // RESUMEN PARA LA TARJETA WEB
      // =================================================

      const summary = {

        negotiations_count:
          negotiations.length,

        active_negotiations_count:
          negotiations.filter(
            (item) =>
              item.cancelled !== true
          ).length,

        has_selected_negotiation:
          selectedNegotiation !==
          null,

        has_truck:
          troop.truck_id !==
          null,

        has_guide:
          guide !==
          null,

        trip_started:
          selectedNegotiation
            ?.trip_started_at !==
            null &&
          selectedNegotiation
            ?.trip_started_at !==
            undefined,

        delivered:
          selectedNegotiation
            ?.delivered_at !==
            null &&
          selectedNegotiation
            ?.delivered_at !==
            undefined,

        payment_status:
          paymentStatus,

        payment_authorized:
          paymentAuthorization !==
            null &&
          [
            'authorized',
            'paid',
          ].includes(
            paymentAuthorization.status
          ),

        payment_paid:
          paymentAuthorization
            ?.status ===
          'paid',

        authorized_trip_price:
          paymentAuthorization
            ?.trip_price_snapshot ??
          null,            

      };


      // =================================================
      // RESPUESTA
      // =================================================

      return res.json({

        success: true,

        has_transport_request:
          true,

        troop,

        transport_request:
          transportRequest,

        summary,

        negotiations,

        selected_negotiation:
          selectedNegotiation,

        guide,

        payment_authorization:
          paymentAuthorization,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE TROOP TRANSPORT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo información de transporte de la tropa',
      });

    }

  };
  
// =====================================================
// ✅ SELECCIONAR NEGOCIACIÓN DE TRANSPORTE PARA TROPA
// POST /slaughterhouse/admin/troops/:id/select-negotiation
//
// Body:
//
// {
//   "negotiation_id": 87
// }
//
// IMPORTANTE:
//
// - NO alteramos transport_negotiations.status.
// - NO alteramos transport_requests.status.
// - Plaza Transporte conserva su propio flujo.
// - Aquí únicamente vinculamos a la tropa:
//     transport_negotiation_id
//     truck_id
//     transporter_user_id
//
// Y la tropa pasa:
// transport_requested → transport_assigned
// =====================================================

exports.selectTroopTransportNegotiation =
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


      const negotiationId =
        Number(
          req.body.negotiation_id
        );


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
        !Number.isInteger(
          negotiationId
        ) ||
        negotiationId <= 0
      ) {

        return res.status(400).json({
          error:
            'negotiation_id inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR TROPA
      // =================================================

      const troopResult =
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
        troopResult.rows.length === 0
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
        troopResult.rows[0];


      // =================================================
      // DEBE TENER SOLICITUD DE TRANSPORTE
      // =================================================

      if (
        previous.transport_request_id ===
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa todavía no tiene una solicitud de transporte',
        });

      }


      // =================================================
      // SOLO DESDE TRANSPORT_REQUESTED
      // =================================================

      if (
        previous.status !==
        'transport_requested'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status} y no puede seleccionar una negociación desde este flujo`,
        });

      }


      // =================================================
      // PROTEGER CONTRA DOBLE ASIGNACIÓN
      // =================================================

      if (
        previous.transport_negotiation_id !==
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa ya tiene una negociación de transporte seleccionada',

          transport_negotiation_id:
            previous.transport_negotiation_id,
        });

      }


      // =================================================
      // VALIDAR NEGOCIACIÓN
      //
      // Debe:
      // - existir
      // - pertenecer a la solicitud de esta tropa
      // - no estar cancelada
      //
      // También traemos datos del camión y transportista.
      // =================================================

      const negotiationResult =
        await client.query(
          `
            SELECT

              tn.id,
              tn.request_id,
              tn.truck_id,
              tn.requester_id,
              tn.transporter_id,

              tn.status,
              tn.trip_price,
              tn.unlock_fee,

              tn.cancelled,

              tn.created_at,


              truck.plate,
              truck.brand,
              truck.model,
              truck.year,

              truck.is_active
                AS truck_is_active,


              transporter.name
                AS transporter_name,

              transporter.phone
                AS transporter_phone

            FROM transport_negotiations tn

            JOIN transporter_trucks truck
              ON truck.id =
                tn.truck_id

            JOIN users transporter
              ON transporter.id =
                tn.transporter_id

            WHERE
              tn.id = $1
              AND tn.request_id = $2

            LIMIT 1
          `,
          [
            negotiationId,
            previous.transport_request_id,
          ],
        );


      if (
        negotiationResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'La negociación no existe o no pertenece a la solicitud de transporte de esta tropa',
        });

      }


      const negotiation =
        negotiationResult.rows[0];


      // =================================================
      // NO PERMITIR NEGOCIACIÓN CANCELADA
      // =================================================

      if (
        negotiation.cancelled ===
        true
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación seleccionada está cancelada',
        });

      }


      // =================================================
      // CAMIÓN DEBE SEGUIR ACTIVO
      // =================================================

      if (
        negotiation.truck_is_active !==
        true
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El camión de esta negociación está inactivo',
        });

      }


      // =================================================
      // VINCULAR NEGOCIACIÓN A TROPA
      //
      // NO tocamos status de Plaza Transporte.
      // =================================================

      const updatedTroopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              transport_negotiation_id = $1,
              truck_id = $2,
              transporter_user_id = $3,
              status = 'transport_assigned',
              updated_at = NOW()

            WHERE
              id = $4
              AND company_id = $5

            RETURNING *
          `,
          [
            negotiation.id,
            negotiation.truck_id,
            negotiation.transporter_id,
            troopId,
            companyId,
          ],
        );


      const troop =
        updatedTroopResult.rows[0];


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
            'select_transport_negotiation',
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

            selected_negotiation: {
              id:
                negotiation.id,

              trip_price:
                negotiation.trip_price,

              transporter_id:
                negotiation.transporter_id,

              transporter_name:
                negotiation.transporter_name,

              truck_id:
                negotiation.truck_id,

              plate:
                negotiation.plate,
            },
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Negociación de transporte seleccionada correctamente',

        troop,

        selected_negotiation: {

          id:
            negotiation.id,

          status:
            negotiation.status,

          trip_price:
            negotiation.trip_price,

          transporter: {
            user_id:
              negotiation.transporter_id,

            name:
              negotiation.transporter_name,

            phone:
              negotiation.transporter_phone,
          },

          truck: {
            id:
              negotiation.truck_id,

            plate:
              negotiation.plate,

            brand:
              negotiation.brand,

            model:
              negotiation.model,

            year:
              negotiation.year,
          },

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SELECT SLAUGHTERHOUSE TROOP TRANSPORT NEGOTIATION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error seleccionando negociación de transporte',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 AUTORIZAR PAGO DE VIAJE AL TRANSPORTISTA
// POST /slaughterhouse/admin/troops/:id/authorize-payment
//
// Body opcional:
//
// {
//   "company_payment_account_id": 2,
//   "payment_reference": "OP-4587",
//   "notes": "Pago autorizado por operaciones"
// }
//
// IMPORTANTE:
//
// - Esto NO usa transport_payments.
// - transport_payments sigue siendo el flujo propio
//   de Plaza Transporte.
//
// Aquí registramos la autorización corporativa:
//
// FRIGOSI → TRANSPORTISTA
//
// status inicial:
// authorized
//
// El precio se copia desde:
// transport_negotiations.trip_price
//
// hacia:
// trip_price_snapshot
// =====================================================

exports.authorizeTroopTransportPayment =
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


      const paymentAccountRaw =
        req.body.company_payment_account_id;


      const companyPaymentAccountId =
        paymentAccountRaw !== undefined &&
        paymentAccountRaw !== null &&
        paymentAccountRaw !== ''
          ? Number(
              paymentAccountRaw
            )
          : null;


      const paymentReference =
        req.body.payment_reference
          ?.toString()
          .trim() ||
        null;


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
        companyPaymentAccountId !== null &&
        (
          !Number.isInteger(
            companyPaymentAccountId
          ) ||
          companyPaymentAccountId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'company_payment_account_id inválido',
        });

      }


      if (
        paymentReference !== null &&
        paymentReference.length > 150
      ) {

        return res.status(400).json({
          error:
            'payment_reference no puede superar 150 caracteres',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR TROPA
      // =================================================

      const troopResult =
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
        troopResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const troop =
        troopResult.rows[0];


      // =================================================
      // DEBE EXISTIR NEGOCIACIÓN SELECCIONADA
      // =================================================

      if (
        troop.transport_negotiation_id ===
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa todavía no tiene una negociación de transporte seleccionada',
        });

      }


      // =================================================
      // ESTADO OPERATIVO MÍNIMO
      // =================================================

      if (
        ![
          'transport_assigned',
          'dispatched',
          'in_transit',
          'received',
          'in_slaughter',
          'completed',
        ].includes(
          troop.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${troop.status} y todavía no corresponde autorizar el pago del viaje`,
        });

      }


      // =================================================
      // OBTENER NEGOCIACIÓN
      //
      // Debe corresponder exactamente a:
      // - negociación vinculada a tropa
      // - solicitud vinculada a tropa
      // - no cancelada
      // =================================================

      const negotiationResult =
        await client.query(
          `
            SELECT

              tn.id,
              tn.request_id,
              tn.truck_id,
              tn.transporter_id,

              tn.status,
              tn.trip_price,
              tn.cancelled,

              truck.plate,

              transporter.name
                AS transporter_name,

              transporter.phone
                AS transporter_phone

            FROM transport_negotiations tn

            JOIN transporter_trucks truck
              ON truck.id =
                tn.truck_id

            JOIN users transporter
              ON transporter.id =
                tn.transporter_id

            WHERE
              tn.id = $1
              AND tn.request_id = $2

            LIMIT 1
          `,
          [
            troop.transport_negotiation_id,
            troop.transport_request_id,
          ],
        );


      if (
        negotiationResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación vinculada a la tropa no coincide con su solicitud de transporte',
        });

      }


      const negotiation =
        negotiationResult.rows[0];


      if (
        negotiation.cancelled ===
        true
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación de transporte está cancelada',
        });

      }


      // =================================================
      // PRECIO OBLIGATORIO
      // =================================================

      const tripPrice =
        Number(
          negotiation.trip_price
        );


      if (
        !Number.isFinite(
          tripPrice
        ) ||
        tripPrice <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación debe tener un precio de viaje válido antes de autorizar el pago',
        });

      }


      // =================================================
      // VALIDAR CUENTA CORPORATIVA
      // =================================================

      if (
        companyPaymentAccountId !== null
      ) {

        const accountResult =
          await client.query(
            `
              SELECT
                id,
                company_id,
                bank_id,
                account_number,
                account_type,
                account_holder,
                label,
                is_default,
                is_active

              FROM slaughterhouse_company_payment_accounts

              WHERE
                id = $1
                AND company_id = $2
                AND is_active = true

              LIMIT 1
            `,
            [
              companyPaymentAccountId,
              companyId,
            ],
          );


        if (
          accountResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'La cuenta de pago no existe, está inactiva o no pertenece al frigorífico',
          });

        }

      }


      // =================================================
      // EVITAR DOBLE AUTORIZACIÓN
      //
      // La tabla ya tiene UNIQUE(negotiation_id),
      // pero validamos antes para dar mejor respuesta.
      // =================================================

      const existingResult =
        await client.query(
          `
            SELECT *

            FROM transport_trip_payment_authorizations

            WHERE
              negotiation_id = $1

            LIMIT 1
          `,
          [
            negotiation.id,
          ],
        );


      if (
        existingResult.rows.length > 0
      ) {

        const existing =
          existingResult.rows[0];


        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'Esta negociación ya tiene una autorización de pago',

          payment_authorization: {
            id:
              existing.id,

            status:
              existing.status,

            trip_price_snapshot:
              existing.trip_price_snapshot,

            authorized_at:
              existing.authorized_at,

            paid_at:
              existing.paid_at,
          },

        });

      }


      // =================================================
      // CREAR AUTORIZACIÓN
      // =================================================

      const authorizationResult =
        await client.query(
          `
            INSERT INTO transport_trip_payment_authorizations (
              company_id,
              negotiation_id,
              troop_id,
              company_payment_account_id,
              trip_price_snapshot,
              status,
              payment_reference,
              notes,
              authorized_by
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'authorized',
              $6,
              $7,
              $8
            )

            RETURNING *
          `,
          [
            companyId,
            negotiation.id,
            troopId,
            companyPaymentAccountId,
            tripPrice,
            paymentReference,
            notes,
            userId,
          ],
        );


      const paymentAuthorization =
        authorizationResult.rows[0];


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
            'transport_payment_authorization',
            $3,
            'authorize',
            $4::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            paymentAuthorization.id
          ),

          JSON.stringify({

            ...paymentAuthorization,

            troop_id:
              troopId,

            negotiation_id:
              negotiation.id,

            transporter_id:
              negotiation.transporter_id,

            transporter_name:
              negotiation.transporter_name,

            truck_id:
              negotiation.truck_id,

            plate:
              negotiation.plate,

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({

        success: true,

        message:
          'Pago del viaje autorizado correctamente',

        payment_authorization:
          paymentAuthorization,

        transport: {

          negotiation_id:
            negotiation.id,

          trip_price:
            negotiation.trip_price,

          transporter: {

            user_id:
              negotiation.transporter_id,

            name:
              negotiation.transporter_name,

            phone:
              negotiation.transporter_phone,

          },

          truck: {

            id:
              negotiation.truck_id,

            plate:
              negotiation.plate,

          },

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'AUTHORIZE SLAUGHTERHOUSE TROOP TRANSPORT PAYMENT ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Esta negociación ya tiene una autorización de pago',
        });

      }


      return res.status(500).json({
        error:
          'Error autorizando pago del viaje',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💳 MARCAR PAGO DE TRANSPORTE COMO REALIZADO
// POST /slaughterhouse/admin/troops/:id/mark-payment-paid
//
// Body:
//
// {
//   "payment_reference": "TRX-458796",
//   "notes": "Transferencia Banco ..."
// }
//
// Reglas:
//
// - Debe existir una negociación seleccionada.
// - Debe existir autorización corporativa.
// - Autorización debe estar en status = authorized.
// - Debe existir referencia/comprobante.
// - trip_price_snapshot NO se modifica.
// - NO toca transport_payments.
// - NO cambia estado de la tropa.
// =====================================================

exports.markTroopTransportPaymentPaid =
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


      const paymentReference =
        req.body.payment_reference
          ?.toString()
          .trim() ||
        null;


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
        paymentReference !== null &&
        paymentReference.length > 150
      ) {

        return res.status(400).json({
          error:
            'payment_reference no puede superar 150 caracteres',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR TROPA
      // =================================================

      const troopResult =
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
        troopResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Tropa no encontrada',
        });

      }


      const troop =
        troopResult.rows[0];


      // =================================================
      // DEBE EXISTIR NEGOCIACIÓN
      // =================================================

      if (
        troop.transport_negotiation_id ===
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa no tiene una negociación de transporte seleccionada',
        });

      }


      // =================================================
      // OBTENER AUTORIZACIÓN DE PAGO
      // =================================================

      const authorizationResult =
        await client.query(
          `
            SELECT *

            FROM transport_trip_payment_authorizations

            WHERE
              company_id = $1
              AND troop_id = $2
              AND negotiation_id = $3

            LIMIT 1

            FOR UPDATE
          `,
          [
            companyId,
            troopId,
            troop.transport_negotiation_id,
          ],
        );


      if (
        authorizationResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'No existe una autorización de pago para esta tropa',
        });

      }


      const previous =
        authorizationResult.rows[0];


      // =================================================
      // YA PAGADO
      // =================================================

      if (
        previous.status ===
        'paid'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'El viaje ya está registrado como pagado',

          payment_authorization: {
            id:
              previous.id,

            trip_price_snapshot:
              previous.trip_price_snapshot,

            payment_reference:
              previous.payment_reference,

            paid_at:
              previous.paid_at,
          },

        });

      }


      // =================================================
      // CANCELADO
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
            'La autorización de pago está cancelada',
        });

      }


      // =================================================
      // SOLO AUTHORIZED → PAID
      // =================================================

      if (
        previous.status !==
        'authorized'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La autorización está en estado ${previous.status} y no puede marcarse como pagada`,
        });

      }


      // =================================================
      // REFERENCIA / COMPROBANTE OBLIGATORIO
      //
      // Puede venir:
      // - cargado previamente al autorizar
      // - enviado ahora por Finanzas
      // =================================================

      const finalPaymentReference =
        paymentReference ||
        previous.payment_reference;


      if (
        !finalPaymentReference
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'Debe indicar una referencia o comprobante del pago',
        });

      }


      // =================================================
      // MARCAR COMO PAGADO
      //
      // IMPORTANTE:
      // trip_price_snapshot NO SE MODIFICA.
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE transport_trip_payment_authorizations

            SET
              status = 'paid',
              payment_reference = $1,
              notes = COALESCE(
                $2,
                notes
              ),
              paid_at = NOW()

            WHERE
              id = $3
              AND company_id = $4

            RETURNING *
          `,
          [
            finalPaymentReference,
            notes,
            previous.id,
            companyId,
          ],
        );


      const paymentAuthorization =
        updatedResult.rows[0];


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
            'transport_payment_authorization',
            $3,
            'mark_paid',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            paymentAuthorization.id
          ),

          JSON.stringify(
            previous
          ),

          JSON.stringify(
            paymentAuthorization
          ),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Pago del viaje registrado como realizado',

        payment_authorization:
          paymentAuthorization,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'MARK SLAUGHTERHOUSE TROOP TRANSPORT PAYMENT PAID ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error registrando el pago del viaje',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🔐 EMITIR AUTORIZACIÓN QR PARA PESAJE
// POST /slaughterhouse/admin/purchase-lots/:id/weighing-authorizations
//
// Body opcional:
//
// {
//   "expected_date": "2026-09-10",
//   "expires_at": "2026-09-12T23:59:59",
//   "delivery_channel": "whatsapp"
// }
//
// El QR se entrega al vendedor.
//
// IMPORTANTE:
//
// - El token real NO se guarda.
// - Solo almacenamos SHA-256(token).
// - El payload QR se devuelve UNA SOLA VEZ.
// - Los endpoints de consulta nunca devolverán token_hash.
// =====================================================

exports.issueWeighingAuthorization =
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const crypto =
        require('crypto');


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


      const expectedDate =
        req.body.expected_date
          ?.toString()
          .trim() ||
        null;


      const expiresAtInput =
        req.body.expires_at
          ?.toString()
          .trim() ||
        null;


      const deliveryChannel =
        req.body.delivery_channel
          ?.toString()
          .trim()
          .toLowerCase() ||
        'whatsapp';


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
            'ID de lote inválido',
        });

      }


      if (
        expectedDate !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(
          expectedDate
        )
      ) {

        return res.status(400).json({
          error:
            'expected_date debe tener formato YYYY-MM-DD',
        });

      }


      if (
        ![
          'whatsapp',
          'sms',
          'manual',
        ].includes(
          deliveryChannel
        )
      ) {

        return res.status(400).json({
          error:
            'delivery_channel inválido',
        });

      }


      let expiresAt =
        null;


      if (
        expiresAtInput !== null
      ) {

        const parsedExpiresAt =
          new Date(
            expiresAtInput
          );


        if (
          Number.isNaN(
            parsedExpiresAt.getTime()
          )
        ) {

          return res.status(400).json({
            error:
              'expires_at inválido',
          });

        }


        if (
          parsedExpiresAt.getTime() <=
          Date.now()
        ) {

          return res.status(400).json({
            error:
              'expires_at debe ser una fecha futura',
          });

        }


        expiresAt =
          parsedExpiresAt;

      } else {

        expiresAt =
          new Date(
            Date.now() +
            7 *
            24 *
            60 *
            60 *
            1000
          );

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR LOTE
      //
      // El bloqueo también serializa la generación
      // del authorization_number por lote.
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT

              spl.id,
              spl.lot_number,
              spl.status,
              spl.planned_date,

              spl.seller_person_id,

              seller.full_name
                AS seller_name,

              seller.phone
                AS seller_phone,

              spl.estate_id,

              estate.name
                AS estate_name,

              estate.location_text
                AS estate_location,

              spl.classification_id,

              classification.generated_code
                AS classification_code,

              classification.display_name
                AS classification_name

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

            LEFT JOIN slaughterhouse_animal_classifications classification
              ON classification.id =
                spl.classification_id
              AND classification.company_id =
                spl.company_id

            WHERE
              spl.id = $1
              AND spl.company_id = $2

            FOR UPDATE OF spl
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
      // VALIDAR ESTADO DEL LOTE
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
            `No puede emitirse una autorización de pesaje para un lote en estado ${purchaseLot.status}`,
        });

      }


      // =================================================
      // WHATSAPP REQUIERE TELÉFONO
      // =================================================

      if (
        deliveryChannel ===
          'whatsapp' &&
        !purchaseLot.seller_phone
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'El vendedor no tiene teléfono registrado para enviar el QR por WhatsApp',
        });

      }


      // =================================================
      // SIGUIENTE NÚMERO DE AUTORIZACIÓN
      // =================================================

      const numberResult =
        await client.query(
          `
            SELECT
              COALESCE(
                MAX(
                  authorization_number
                ),
                0
              ) + 1
                AS next_number

            FROM slaughterhouse_weighing_authorizations

            WHERE
              purchase_lot_id = $1
          `,
          [
            purchaseLotId,
          ],
        );


      const authorizationNumber =
        Number(
          numberResult.rows[0]
            .next_number
        );


      // =================================================
      // GENERAR CÓDIGO PÚBLICO
      // =================================================

      const randomCode =
        crypto
          .randomBytes(4)
          .toString('hex')
          .toUpperCase();


      const publicCode =
        `WQ-${companyId}-${purchaseLotId}-${authorizationNumber}-${randomCode}`;


      // =================================================
      // TOKEN SECRETO
      //
      // Este valor será parte del QR.
      // NO se almacena en claro.
      // =================================================

      const token =
        crypto
          .randomBytes(32)
          .toString('base64url');


      const tokenHash =
        crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');


      // =================================================
      // SNAPSHOT
      //
      // Conservamos exactamente qué se estaba
      // autorizando cuando se emitió el QR.
      // =================================================

      const detailsSnapshot = {

        purchase_lot_id:
          purchaseLotId,

        lot_number:
          purchaseLot.lot_number,

        seller_person_id:
          purchaseLot.seller_person_id,

        seller_name:
          purchaseLot.seller_name,

        estate_id:
          purchaseLot.estate_id,

        estate_name:
          purchaseLot.estate_name,

        classification_id:
          purchaseLot.classification_id,

        classification_code:
          purchaseLot.classification_code,

        classification_name:
          purchaseLot.classification_name,

        expected_date:
          expectedDate ||
          purchaseLot.planned_date,

      };


      // =================================================
      // PAYLOAD DEL QR
      //
      // El token aparece aquí porque el QR necesita
      // transportarlo.
      //
      // Este payload se devuelve UNA SOLA VEZ.
      // =================================================

      const qrPayloadObject = {

        version: 1,

        type:
          'slaughterhouse_weighing_authorization',

        public_code:
          publicCode,

        purchase_lot_id:
          purchaseLotId,

        authorization_number:
          authorizationNumber,

        token,

        expires_at:
          expiresAt.toISOString(),

      };


      const qrPayload =
        JSON.stringify(
          qrPayloadObject
        );


      const qrPayloadHash =
        crypto
          .createHash('sha256')
          .update(qrPayload)
          .digest('hex');


      // =================================================
      // CREAR AUTORIZACIÓN
      // =================================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_weighing_authorizations (
              company_id,
              purchase_lot_id,
              authorization_number,
              public_code,
              token_hash,
              qr_payload_hash,
              key_id,
              purpose,
              details_snapshot,
              recipient_phone_snapshot,
              delivery_channel,
              expected_date,
              status,
              issued_by,
              expires_at
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              NULL,
              'weighing_close',
              $7::jsonb,
              $8,
              $9,
              $10,
              'pending',
              $11,
              $12
            )

            RETURNING
              id,
              company_id,
              purchase_lot_id,
              authorization_number,
              public_code,
              purpose,
              details_snapshot,
              recipient_phone_snapshot,
              delivery_channel,
              expected_date,
              status,
              issued_by,
              issued_at,
              expires_at,
              created_at
          `,
          [
            companyId,

            purchaseLotId,

            authorizationNumber,

            publicCode,

            tokenHash,

            qrPayloadHash,

            JSON.stringify(
              detailsSnapshot
            ),

            purchaseLot.seller_phone,

            deliveryChannel,

            expectedDate ||
            purchaseLot.planned_date,

            userId,

            expiresAt,
          ],
        );


      const authorization =
        result.rows[0];


      // =================================================
      // AUDITORÍA
      //
      // IMPORTANTE:
      // NO guardamos token ni qr_payload.
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
            'weighing_authorization',
            $3,
            'issue',
            $4::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            authorization.id
          ),

          JSON.stringify({
            authorization_id:
              authorization.id,

            purchase_lot_id:
              purchaseLotId,

            authorization_number:
              authorizationNumber,

            public_code:
              publicCode,

            recipient_phone:
              purchaseLot.seller_phone,

            delivery_channel:
              deliveryChannel,

            expires_at:
              expiresAt.toISOString(),
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      // =================================================
      // RESPUESTA
      //
      // qr_payload aparece solamente aquí.
      // La web podrá convertirlo visualmente en QR
      // y enviarlo al vendedor.
      // =================================================

      return res.status(201).json({

        success: true,

        message:
          'Autorización QR de pesaje emitida correctamente',

        authorization,

        qr_payload:
          qrPayload,

        recipient: {

          seller_person_id:
            purchaseLot.seller_person_id,

          seller_name:
            purchaseLot.seller_name,

          phone:
            purchaseLot.seller_phone,

          delivery_channel:
            deliveryChannel,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'ISSUE SLAUGHTERHOUSE WEIGHING AUTHORIZATION ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'No se pudo generar una autorización única. Intente nuevamente',
        });

      }


      return res.status(500).json({
        error:
          'Error emitiendo autorización QR de pesaje',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🔐 LISTAR AUTORIZACIONES QR DE UN LOTE
// GET /slaughterhouse/admin/purchase-lots/:id/weighing-authorizations
//
// IMPORTANTE:
// NO devuelve:
// - token_hash
// - qr_payload_hash
// =====================================================

exports.getWeighingAuthorizations =
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
      // VERIFICAR LOTE
      // =================================================

      const lotResult =
        await pool.query(
          `
            SELECT
              id,
              lot_number,
              status

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2

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


      // =================================================
      // AUTORIZACIONES
      // =================================================

      const result =
        await pool.query(
          `
            SELECT

              swa.id,
              swa.company_id,
              swa.purchase_lot_id,

              swa.authorization_number,
              swa.public_code,

              swa.key_id,
              swa.purpose,

              swa.details_snapshot,

              swa.recipient_phone_snapshot,
              swa.delivery_channel,

              swa.expected_date,

              swa.status,

              swa.issued_by,
              issuer.name
                AS issued_by_name,

              swa.used_by,
              used_user.name
                AS used_by_name,

              swa.revoked_by,
              revoked_user.name
                AS revoked_by_name,

              swa.issued_at,
              swa.used_at,
              swa.revoked_at,
              swa.expires_at,

              swa.created_at,
              swa.updated_at,

              CASE

                WHEN
                  swa.status = 'pending'
                  AND swa.expires_at IS NOT NULL
                  AND swa.expires_at <= NOW()

                THEN true

                ELSE false

              END
                AS is_expired

            FROM slaughterhouse_weighing_authorizations swa

            LEFT JOIN users issuer
              ON issuer.id =
                swa.issued_by

            LEFT JOIN users used_user
              ON used_user.id =
                swa.used_by

            LEFT JOIN users revoked_user
              ON revoked_user.id =
                swa.revoked_by

            WHERE
              swa.purchase_lot_id = $1
              AND swa.company_id = $2

            ORDER BY
              swa.authorization_number DESC,
              swa.id DESC
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      const authorizations =
        result.rows;


      // =================================================
      // RESUMEN
      // =================================================

      const summary = {

        total:
          authorizations.length,

        pending:
          authorizations.filter(
            (item) =>
              item.status === 'pending' &&
              item.is_expired !== true
          ).length,

        used:
          authorizations.filter(
            (item) =>
              item.status === 'used'
          ).length,

        revoked:
          authorizations.filter(
            (item) =>
              item.status === 'revoked'
          ).length,

        expired:
          authorizations.filter(
            (item) =>
              item.status === 'expired' ||
              item.is_expired === true
          ).length,

      };


      return res.json({

        success: true,

        purchase_lot:
          lotResult.rows[0],

        summary,

        authorizations,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE WEIGHING AUTHORIZATIONS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo autorizaciones QR de pesaje',
      });

    }

  };
  
// =====================================================
// 🚫 REVOCAR AUTORIZACIÓN QR DE PESAJE
// PATCH /slaughterhouse/admin/weighing-authorizations/:id/revoke
//
// Solo puede revocarse si:
// - status = pending
// - no fue usada
//
// No se elimina ningún registro.
// =====================================================

exports.revokeWeighingAuthorization =
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


      const authorizationId =
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
          authorizationId
        ) ||
        authorizationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de autorización inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR AUTORIZACIÓN
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_weighing_authorizations

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            authorizationId,
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
            'Autorización QR no encontrada',
        });

      }


      const previous =
        previousResult.rows[0];


      // =================================================
      // YA REVOCADA
      // =================================================

      if (
        previous.status ===
        'revoked'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La autorización QR ya está revocada',
        });

      }


      // =================================================
      // YA USADA
      // =================================================

      if (
        previous.status ===
          'used' ||
        previous.used_at !==
          null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La autorización QR ya fue utilizada y no puede revocarse',
        });

      }


      // =================================================
      // YA EXPIRADA
      // =================================================

      if (
        previous.status ===
        'expired'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La autorización QR ya está expirada',
        });

      }


      // =================================================
      // SOLO PENDING
      // =================================================

      if (
        previous.status !==
        'pending'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La autorización está en estado ${previous.status} y no puede revocarse`,
        });

      }


      // =================================================
      // SI YA VENCIÓ POR FECHA, NO LA REVOCAMOS
      // =================================================

      if (
        previous.expires_at !==
          null &&
        new Date(
          previous.expires_at
        ).getTime() <=
          Date.now()
      ) {

        await client.query(
          `
            UPDATE slaughterhouse_weighing_authorizations

            SET
              status = 'expired',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2
          `,
          [
            authorizationId,
            companyId,
          ],
        );


        await client.query(
          'COMMIT'
        );


        return res.status(409).json({
          error:
            'La autorización QR ya estaba vencida y fue marcada como expirada',
        });

      }


      // =================================================
      // REVOCAR
      // =================================================

      const result =
        await client.query(
          `
            UPDATE slaughterhouse_weighing_authorizations

            SET
              status = 'revoked',
              revoked_by = $1,
              revoked_at = NOW(),
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING
              id,
              company_id,
              purchase_lot_id,
              authorization_number,
              public_code,
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
          `,
          [
            userId,
            authorizationId,
            companyId,
          ],
        );


      const authorization =
        result.rows[0];


      // =================================================
      // AUDITORÍA
      //
      // NO incluimos hashes secretos.
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
            'weighing_authorization',
            $3,
            'revoke',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            authorizationId
          ),

          JSON.stringify({
            id:
              previous.id,

            purchase_lot_id:
              previous.purchase_lot_id,

            authorization_number:
              previous.authorization_number,

            public_code:
              previous.public_code,

            status:
              previous.status,

            expires_at:
              previous.expires_at,
          }),

          JSON.stringify({
            ...authorization,

            revocation_reason:
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
          'Autorización QR revocada correctamente',

        authorization,

        revocation_reason:
          reason,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'REVOKE SLAUGHTERHOUSE WEIGHING AUTHORIZATION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error revocando autorización QR de pesaje',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// ⚖️ CREAR PESAJE EN ORIGEN - DRAFT
// POST /slaughterhouse/admin/purchase-lots/:id/weighings
//
// Body ejemplo:
//
// {
//   "troop_id": 12,
//   "pesador_person_id": 8,
//   "classification_id": 3,
//   "shrink_percent": 2,
//   "price_per_kg": 18.50,
//   "event_lat": -17.1234567,
//   "event_lng": -63.1234567,
//   "event_local_time": "2026-09-04T10:30:00",
//   "items": [
//     { "weight_kg": 430.5 },
//     { "weight_kg": 455.2 },
//     { "weight_kg": 441.8 }
//   ]
// }
//
// IMPORTANTE:
// - quantity se calcula desde items.
// - gross_weight_kg se calcula desde items.
// - shrink_weight_kg lo calcula backend.
// - net_weight_kg lo calcula backend.
// - total_amount lo calcula backend.
// - nace siempre status = draft.
// - todavía NO consume QR.
// =====================================================

exports.createLiveWeighingDraft =
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


      const troopIdRaw =
        req.body.troop_id;


      const troopId =
        troopIdRaw !== undefined &&
        troopIdRaw !== null &&
        troopIdRaw !== ''
          ? Number(
              troopIdRaw
            )
          : null;


      const pesadorPersonIdRaw =
        req.body.pesador_person_id;


      const pesadorPersonId =
        pesadorPersonIdRaw !== undefined &&
        pesadorPersonIdRaw !== null &&
        pesadorPersonIdRaw !== ''
          ? Number(
              pesadorPersonIdRaw
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


      const shrinkPercentRaw =
        req.body.shrink_percent;


      const pricePerKgRaw =
        req.body.price_per_kg;


      const eventLatRaw =
        req.body.event_lat;


      const eventLngRaw =
        req.body.event_lng;


      const eventLocalTime =
        req.body.event_local_time
          ?.toString()
          .trim() ||
        null;


      const items =
        Array.isArray(
          req.body.items
        )
          ? req.body.items
          : [];


      // =================================================
      // VALIDACIONES BÁSICAS
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


      if (
        troopId !== null &&
        (
          !Number.isInteger(
            troopId
          ) ||
          troopId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'troop_id inválido',
        });

      }


      if (
        pesadorPersonId !== null &&
        (
          !Number.isInteger(
            pesadorPersonId
          ) ||
          pesadorPersonId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'pesador_person_id inválido',
        });

      }


      if (
        classificationId !== null &&
        (
          !Number.isInteger(
            classificationId
          ) ||
          classificationId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'classification_id inválido',
        });

      }


      if (
        items.length === 0
      ) {

        return res.status(400).json({
          error:
            'Debe registrar al menos un peso',
        });

      }


      // =================================================
      // VALIDAR Y NORMALIZAR ITEMS
      // =================================================

      const normalizedItems =
        [];


      for (
        let index = 0;
        index < items.length;
        index++
      ) {

        const weightKg =
          Number(
            items[index]
              ?.weight_kg
          );


        if (
          !Number.isFinite(
            weightKg
          ) ||
          weightKg <= 0
        ) {

          return res.status(400).json({
            error:
              `Peso inválido en el animal ${index + 1}`,
          });

        }


        const notes =
          items[index]
            ?.notes
            ?.toString()
            .trim() ||
          null;


        normalizedItems.push({

          sequence_number:
            index + 1,

          weight_kg:
            Number(
              weightKg.toFixed(
                3
              )
            ),

          notes,

        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR LOTE
      //
      // También serializa weighing_number.
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT

              spl.id,
              spl.lot_number,
              spl.status,

              spl.seller_person_id,
              spl.captador_person_id,
              spl.classification_id,

              spl.shrink_percent,
              spl.price_per_unit,
              spl.purchase_type

            FROM slaughterhouse_purchase_lots spl

            WHERE
              spl.id = $1
              AND spl.company_id = $2

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
      // ESTADO VÁLIDO
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
            `No puede registrarse un pesaje para un lote en estado ${purchaseLot.status}`,
        });

      }


      // =================================================
      // VALIDAR TROPA SI VIENE
      // =================================================

      if (
        troopId !== null
      ) {

        const troopResult =
          await client.query(
            `
              SELECT
                id,
                status

              FROM slaughterhouse_troops

              WHERE
                id = $1
                AND purchase_lot_id = $2
                AND company_id = $3

              LIMIT 1
            `,
            [
              troopId,
              purchaseLotId,
              companyId,
            ],
          );


        if (
          troopResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'La tropa no pertenece a este lote',
          });

        }


        if (
          troopResult.rows[0]
            .status ===
          'cancelled'
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(409).json({
            error:
              'No puede registrarse un pesaje para una tropa cancelada',
          });

        }

      }


      // =================================================
      // VALIDAR PESADOR SI VIENE
      // =================================================

      if (
        pesadorPersonId !== null
      ) {

        const pesadorResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_people

              WHERE
                id = $1
                AND company_id = $2
                AND is_active = true

              LIMIT 1
            `,
            [
              pesadorPersonId,
              companyId,
            ],
          );


        if (
          pesadorResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El pesador no existe o está inactivo',
          });

        }

      }


      // =================================================
      // CLASIFICACIÓN
      //
      // Si no viene explícita usamos la del lote.
      // =================================================

      const finalClassificationId =
        classificationId ||
        purchaseLot.classification_id;


      if (
        finalClassificationId !==
        null
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
              finalClassificationId,
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
              'Clasificación animal inválida o inactiva',
          });

        }

      }


      // =================================================
      // MERMA
      //
      // Si no viene, heredamos la del lote.
      // =================================================

      const shrinkPercent =
        shrinkPercentRaw !== undefined &&
        shrinkPercentRaw !== null &&
        shrinkPercentRaw !== ''
          ? Number(
              shrinkPercentRaw
            )
          : Number(
              purchaseLot.shrink_percent ||
              0
            );


      if (
        !Number.isFinite(
          shrinkPercent
        ) ||
        shrinkPercent < 0 ||
        shrinkPercent > 100
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'shrink_percent debe estar entre 0 y 100',
        });

      }


      // =================================================
      // PRECIO POR KG
      //
      // NO asumimos que price_per_unit del lote sea
      // necesariamente precio/kg.
      //
      // Por ahora solo usamos price_per_kg si viene
      // explícitamente en este pesaje.
      // =================================================

      const pricePerKg =
        pricePerKgRaw !== undefined &&
        pricePerKgRaw !== null &&
        pricePerKgRaw !== ''
          ? Number(
              pricePerKgRaw
            )
          : null;


      if (
        pricePerKg !== null &&
        (
          !Number.isFinite(
            pricePerKg
          ) ||
          pricePerKg < 0
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'price_per_kg inválido',
        });

      }


      // =================================================
      // UBICACIÓN
      // =================================================

      const eventLat =
        eventLatRaw !== undefined &&
        eventLatRaw !== null &&
        eventLatRaw !== ''
          ? Number(
              eventLatRaw
            )
          : null;


      const eventLng =
        eventLngRaw !== undefined &&
        eventLngRaw !== null &&
        eventLngRaw !== ''
          ? Number(
              eventLngRaw
            )
          : null;


      if (
        eventLat !== null &&
        (
          !Number.isFinite(
            eventLat
          ) ||
          eventLat < -90 ||
          eventLat > 90
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'event_lat inválido',
        });

      }


      if (
        eventLng !== null &&
        (
          !Number.isFinite(
            eventLng
          ) ||
          eventLng < -180 ||
          eventLng > 180
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({
          error:
            'event_lng inválido',
        });

      }


      // =================================================
      // CALCULAR TOTALES EN BACKEND
      // =================================================

      const quantity =
        normalizedItems.length;


      const grossWeightKg =
        normalizedItems.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.weight_kg
            ),
          0
        );


      const roundedGrossWeightKg =
        Number(
          grossWeightKg.toFixed(
            3
          )
        );


      const shrinkWeightKg =
        Number(
          (
            roundedGrossWeightKg *
            shrinkPercent /
            100
          ).toFixed(
            3
          )
        );


      const netWeightKg =
        Number(
          (
            roundedGrossWeightKg -
            shrinkWeightKg
          ).toFixed(
            3
          )
        );


      const totalAmount =
        pricePerKg !== null
          ? Number(
              (
                netWeightKg *
                pricePerKg
              ).toFixed(
                2
              )
            )
          : null;


      // =================================================
      // SIGUIENTE NÚMERO DE PESAJE
      // =================================================

      const numberResult =
        await client.query(
          `
            SELECT
              COALESCE(
                MAX(
                  weighing_number
                ),
                0
              ) + 1
                AS next_number

            FROM slaughterhouse_live_weighings

            WHERE
              purchase_lot_id = $1
          `,
          [
            purchaseLotId,
          ],
        );


      const weighingNumber =
        Number(
          numberResult.rows[0]
            .next_number
        );


      // =================================================
      // CREAR CABECERA DRAFT
      // =================================================

      const weighingResult =
        await client.query(
          `
            INSERT INTO slaughterhouse_live_weighings (
              company_id,
              purchase_lot_id,
              troop_id,
              weighing_number,

              seller_person_id,
              captador_person_id,
              pesador_person_id,
              classification_id,

              quantity,

              gross_weight_kg,
              shrink_percent,
              shrink_weight_kg,
              net_weight_kg,

              price_per_kg,
              total_amount,

              event_lat,
              event_lng,
              event_local_time,

              certified_offline,
              status,

              created_by
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,

              $5,
              $6,
              $7,
              $8,

              $9,

              $10,
              $11,
              $12,
              $13,

              $14,
              $15,

              $16,
              $17,
              $18,

              false,
              'draft',

              $19
            )

            RETURNING *
          `,
          [
            companyId,
            purchaseLotId,
            troopId,
            weighingNumber,

            purchaseLot.seller_person_id,
            purchaseLot.captador_person_id,
            pesadorPersonId,
            finalClassificationId,

            quantity,

            roundedGrossWeightKg,
            shrinkPercent,
            shrinkWeightKg,
            netWeightKg,

            pricePerKg,
            totalAmount,

            eventLat,
            eventLng,
            eventLocalTime,

            userId,
          ],
        );


      const weighing =
        weighingResult.rows[0];


      // =================================================
      // INSERTAR ITEMS
      // =================================================

      const insertedItems =
        [];


      for (
        const item of normalizedItems
      ) {

        const itemResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_live_weighing_items (
                weighing_id,
                sequence_number,
                weight_kg,
                notes
              )

              VALUES (
                $1,
                $2,
                $3,
                $4
              )

              RETURNING *
            `,
            [
              weighing.id,
              item.sequence_number,
              item.weight_kg,
              item.notes,
            ],
          );


        insertedItems.push(
          itemResult.rows[0]
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
            'live_weighing',
            $3,
            'create_draft',
            $4::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            weighing.id
          ),

          JSON.stringify({

            weighing,

            items:
              insertedItems,

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({

        success: true,

        message:
          'Pesaje guardado en borrador',

        weighing,

        items:
          insertedItems,

        calculated: {

          quantity,

          gross_weight_kg:
            roundedGrossWeightKg,

          shrink_percent:
            shrinkPercent,

          shrink_weight_kg:
            shrinkWeightKg,

          net_weight_kg:
            netWeightKg,

          price_per_kg:
            pricePerKg,

          total_amount:
            totalAmount,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE LIVE WEIGHING DRAFT ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Conflicto generando el número de pesaje. Intente nuevamente',
        });

      }


      return res.status(500).json({
        error:
          'Error guardando pesaje en borrador',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🔏 CERTIFICAR PESAJE CON QR DEL VENDEDOR
// POST /slaughterhouse/admin/weighings/:id/certify
//
// Body:
//
// {
//   "qr_payload": "{\"version\":1,...}"
// }
//
// IMPORTANTE:
//
// - El QR debe estar pending.
// - No debe estar vencido.
// - Debe corresponder al mismo lote.
// - El token debe coincidir.
// - El payload completo debe coincidir.
// - Los pesos se recalculan DESDE POSTGRESQL.
// - QR y pesaje se actualizan en la MISMA transacción.
// - El QR queda used.
// - El pesaje queda certified.
// - Se genera document_hash.
// =====================================================

exports.certifyLiveWeighingWithQr =
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const crypto =
        require('crypto');


      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const userId =
        Number(
          req.slaughterhouseAdmin.user_id
        );


      const weighingId =
        Number(
          req.params.id
        );


      const qrPayload =
        req.body.qr_payload;


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(
          weighingId
        ) ||
        weighingId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de pesaje inválido',
        });

      }


      if (
        typeof qrPayload !==
          'string' ||
        !qrPayload.trim()
      ) {

        return res.status(400).json({
          error:
            'qr_payload es obligatorio',
        });

      }


      // =================================================
      // PARSEAR QR
      // =================================================

      let qrData;


      try {

        qrData =
          JSON.parse(
            qrPayload
          );

      } catch {

        return res.status(400).json({
          error:
            'El QR no contiene un payload válido',
        });

      }


      if (
        qrData?.version !== 1 ||
        qrData?.type !==
          'slaughterhouse_weighing_authorization'
      ) {

        return res.status(400).json({
          error:
            'Tipo de QR de pesaje inválido',
        });

      }


      if (
        typeof qrData.public_code !==
          'string' ||
        !qrData.public_code.trim()
      ) {

        return res.status(400).json({
          error:
            'El QR no contiene public_code válido',
        });

      }


      if (
        typeof qrData.token !==
          'string' ||
        !qrData.token
      ) {

        return res.status(400).json({
          error:
            'El QR no contiene token válido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR PESAJE
      // =================================================

      const weighingResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_live_weighings

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            weighingId,
            companyId,
          ],
        );


      if (
        weighingResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Pesaje no encontrado',
        });

      }


      const previousWeighing =
        weighingResult.rows[0];

      // =================================================
      // SI ESTE PESAJE ES UNA RECTIFICACIÓN,
      // BLOQUEAR Y VALIDAR EL ORIGINAL
      // =================================================

      let originalWeighing =
        null;


      if (
        previousWeighing.original_weighing_id !==
        null
      ) {

        const originalResult =
          await client.query(
            `
              SELECT *

              FROM slaughterhouse_live_weighings

              WHERE
                id = $1
                AND company_id = $2
                AND purchase_lot_id = $3

              FOR UPDATE
            `,
            [
              previousWeighing.original_weighing_id,
              companyId,
              previousWeighing.purchase_lot_id,
            ],
          );


        if (
          originalResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(409).json({
            error:
              'El pesaje original de esta rectificación no existe',
          });

        }


        originalWeighing =
          originalResult.rows[0];


        if (
          originalWeighing.status !==
          'certified'
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(409).json({
            error:
              `El pesaje original está en estado ${originalWeighing.status} y no puede ser reemplazado por esta rectificación`,
          });

        }

      }        

      // =================================================
      // SOLO DRAFT
      // =================================================

      if (
        previousWeighing.status !==
        'draft'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `El pesaje está en estado ${previousWeighing.status} y no puede certificarse`,
        });

      }


      if (
        previousWeighing.authorization_id !==
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El pesaje ya tiene una autorización QR asociada',
        });

      }


      // =================================================
      // VALIDAR QUE LOS DATOS DEL QR APUNTEN AL MISMO LOTE
      // =================================================

      const qrPurchaseLotId =
        Number(
          qrData.purchase_lot_id
        );


      if (
        !Number.isInteger(
          qrPurchaseLotId
        ) ||
        qrPurchaseLotId !==
          Number(
            previousWeighing.purchase_lot_id
          )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El QR no corresponde al lote de este pesaje',
        });

      }


      // =================================================
      // OBTENER Y BLOQUEAR AUTORIZACIÓN
      // =================================================

      const authorizationResult =
        await client.query(
          `
            SELECT

              *,

              CASE

                WHEN
                  expires_at IS NOT NULL
                  AND expires_at <= NOW()

                THEN true

                ELSE false

              END
                AS is_expired

            FROM slaughterhouse_weighing_authorizations

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND public_code = $3

            FOR UPDATE
          `,
          [
            companyId,

            previousWeighing.purchase_lot_id,

            qrData.public_code,
          ],
        );


      if (
        authorizationResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Autorización QR no encontrada',
        });

      }


      const authorization =
        authorizationResult.rows[0];


      // =================================================
      // VALIDAR NÚMERO DEL QR
      // =================================================

      if (
        Number(
          qrData.authorization_number
        ) !==
        Number(
          authorization.authorization_number
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El número de autorización del QR no coincide',
        });

      }


      // =================================================
      // VALIDAR ESTADO
      // =================================================

      if (
        authorization.status ===
        'used'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'Este QR ya fue utilizado',
        });

      }


      if (
        authorization.status ===
        'revoked'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'Este QR fue revocado',
        });

      }


      if (
        authorization.status ===
          'expired' ||
        authorization.is_expired ===
          true
      ) {

        if (
          authorization.status ===
          'pending'
        ) {

          await client.query(
            `
              UPDATE slaughterhouse_weighing_authorizations

              SET
                status = 'expired',
                updated_at = NOW()

              WHERE
                id = $1
            `,
            [
              authorization.id,
            ],
          );


          await client.query(
            'COMMIT'
          );

        } else {

          await client.query(
            'ROLLBACK'
          );

        }


        return res.status(409).json({
          error:
            'Este QR está vencido',
        });

      }


      if (
        authorization.status !==
        'pending'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `El QR está en estado ${authorization.status} y no puede utilizarse`,
        });

      }


      // =================================================
      // VALIDAR HASH DEL PAYLOAD COMPLETO
      // =================================================

      const receivedPayloadHash =
        crypto
          .createHash('sha256')
          .update(qrPayload)
          .digest('hex');


      if (
        receivedPayloadHash !==
        authorization.qr_payload_hash
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(401).json({
          error:
            'El contenido del QR fue alterado o no coincide con la autorización emitida',
        });

      }


      // =================================================
      // VALIDAR TOKEN
      //
      // Usamos timingSafeEqual para comparar hashes.
      // =================================================

      const receivedTokenHash =
        crypto
          .createHash('sha256')
          .update(
            qrData.token
          )
          .digest('hex');


      const expectedTokenBuffer =
        Buffer.from(
          authorization.token_hash,
          'hex'
        );


      const receivedTokenBuffer =
        Buffer.from(
          receivedTokenHash,
          'hex'
        );


      if (
        expectedTokenBuffer.length !==
          receivedTokenBuffer.length ||
        !crypto.timingSafeEqual(
          expectedTokenBuffer,
          receivedTokenBuffer
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(401).json({
          error:
            'Token QR inválido',
        });

      }


      // =================================================
      // VALIDAR VENDEDOR DEL SNAPSHOT
      // =================================================

      const snapshotSellerId =
        Number(
          authorization
            .details_snapshot
            ?.seller_person_id
        );


      if (
        Number.isInteger(
          snapshotSellerId
        ) &&
        snapshotSellerId !==
          Number(
            previousWeighing.seller_person_id
          )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El QR pertenece a otro vendedor',
        });

      }


      // =================================================
      // LEER ITEMS DIRECTAMENTE DE POSTGRESQL
      //
      // No confiamos en los pesos enviados por el cliente.
      // =================================================

      const itemsResult =
        await client.query(
          `
            SELECT

              id,
              sequence_number,
              weight_kg,
              notes,
              created_at

            FROM slaughterhouse_live_weighing_items

            WHERE
              weighing_id = $1

            ORDER BY
              sequence_number ASC

            FOR UPDATE
          `,
          [
            weighingId,
          ],
        );


      const items =
        itemsResult.rows;


      if (
        items.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El pesaje no tiene pesos registrados y no puede certificarse',
        });

      }


      // =================================================
      // RECALCULAR TODO
      // =================================================

      const quantity =
        items.length;


      const grossWeightKg =
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.weight_kg
            ),
          0
        );


      const roundedGrossWeightKg =
        Number(
          grossWeightKg.toFixed(
            3
          )
        );


      const shrinkPercent =
        Number(
          previousWeighing
            .shrink_percent ||
          0
        );


      if (
        !Number.isFinite(
          shrinkPercent
        ) ||
        shrinkPercent < 0 ||
        shrinkPercent > 100
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La merma almacenada en el pesaje es inválida',
        });

      }


      const shrinkWeightKg =
        Number(
          (
            roundedGrossWeightKg *
            shrinkPercent /
            100
          ).toFixed(
            3
          )
        );


      const netWeightKg =
        Number(
          (
            roundedGrossWeightKg -
            shrinkWeightKg
          ).toFixed(
            3
          )
        );


      const pricePerKg =
        previousWeighing
          .price_per_kg !== null
          ? Number(
              previousWeighing
                .price_per_kg
            )
          : null;


      const totalAmount =
        pricePerKg !== null
          ? Number(
              (
                netWeightKg *
                pricePerKg
              ).toFixed(
                2
              )
            )
          : null;


      // =================================================
      // SNAPSHOT INMUTABLE PARA DOCUMENT_HASH
      //
      // NO incluimos token.
      // =================================================

      const certificationDocument = {

        version: 1,

        company_id:
          companyId,

        purchase_lot_id:
          Number(
            previousWeighing
              .purchase_lot_id
          ),

        troop_id:
          previousWeighing
            .troop_id,

        weighing_id:
          weighingId,

        weighing_number:
          Number(
            previousWeighing
              .weighing_number
          ),

        seller_person_id:
          Number(
            previousWeighing
              .seller_person_id
          ),

        captador_person_id:
          previousWeighing
            .captador_person_id,

        pesador_person_id:
          previousWeighing
            .pesador_person_id,

        classification_id:
          previousWeighing
            .classification_id,

        authorization_id:
          authorization.id,

        authorization_number:
          authorization
            .authorization_number,

        public_code:
          authorization
            .public_code,

        quantity,

        gross_weight_kg:
          roundedGrossWeightKg,

        shrink_percent:
          shrinkPercent,

        shrink_weight_kg:
          shrinkWeightKg,

        net_weight_kg:
          netWeightKg,

        price_per_kg:
          pricePerKg,

        total_amount:
          totalAmount,

        event_lat:
          previousWeighing
            .event_lat,

        event_lng:
          previousWeighing
            .event_lng,

        event_local_time:
          previousWeighing
            .event_local_time,

        items:
          items.map(
            (item) => ({
              sequence_number:
                Number(
                  item.sequence_number
                ),

              weight_kg:
                Number(
                  item.weight_kg
                ),

              notes:
                item.notes,
            })
          ),

      };


      const documentHash =
        crypto
          .createHash('sha256')
          .update(
            JSON.stringify(
              certificationDocument
            )
          )
          .digest('hex');


      // =================================================
      // CERTIFICAR PESAJE
      // =================================================

      const certifiedResult =
        await client.query(
          `
            UPDATE slaughterhouse_live_weighings

            SET
              authorization_id = $1,

              quantity = $2,

              gross_weight_kg = $3,
              shrink_weight_kg = $4,
              net_weight_kg = $5,

              total_amount = $6,

              document_hash = $7,

              certified_offline = false,

              status = 'certified',

              certified_by = $8,
              certified_at = NOW(),

              updated_at = NOW()

            WHERE
              id = $9
              AND company_id = $10

            RETURNING *
          `,
          [
            authorization.id,

            quantity,

            roundedGrossWeightKg,

            shrinkWeightKg,

            netWeightKg,

            totalAmount,

            documentHash,

            userId,

            weighingId,

            companyId,
          ],
        );


      const certifiedWeighing =
        certifiedResult.rows[0];


      // =================================================
      // CONSUMIR QR
      // =================================================

      const usedAuthorizationResult =
        await client.query(
          `
            UPDATE slaughterhouse_weighing_authorizations

            SET
              status = 'used',
              used_by = $1,
              used_at = NOW(),
              updated_at = NOW()

            WHERE
              id = $2
              AND status = 'pending'

            RETURNING
              id,
              company_id,
              purchase_lot_id,
              authorization_number,
              public_code,
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
          `,
          [
            userId,
            authorization.id,
          ],
        );


      if (
        usedAuthorizationResult.rows.length ===
        0
      ) {

        throw new Error(
          'No fue posible consumir la autorización QR'
        );

      }


      const usedAuthorization =
        usedAuthorizationResult.rows[0];

      // =================================================
      // SI ES RECTIFICACIÓN CERTIFICADA,
      // EL ORIGINAL PASA A RECTIFIED
      //
      // Nunca modificamos sus pesos, hash ni datos.
      // Solamente cambia su estado documental.
      // =================================================

      let rectifiedOriginal =
        null;


      if (
        originalWeighing !==
        null
      ) {

        const rectifiedOriginalResult =
          await client.query(
            `
              UPDATE slaughterhouse_live_weighings

              SET
                status = 'rectified',
                updated_at = NOW()

              WHERE
                id = $1
                AND company_id = $2
                AND status = 'certified'

              RETURNING *
            `,
            [
              originalWeighing.id,
              companyId,
            ],
          );


        if (
          rectifiedOriginalResult.rows.length ===
          0
        ) {

          throw new Error(
            'No fue posible marcar el pesaje original como rectificado'
          );

        }


        rectifiedOriginal =
          rectifiedOriginalResult.rows[0];

      }        

      // =================================================
      // AUDITORÍA
      //
      // NO almacenamos token ni qr_payload.
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
            'live_weighing',
            $3,
            'certify_with_qr',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            weighingId
          ),

          JSON.stringify(
            previousWeighing
          ),

          JSON.stringify({
            weighing:
              certifiedWeighing,

            authorization: {
              id:
                usedAuthorization.id,

              authorization_number:
                usedAuthorization
                  .authorization_number,

              public_code:
                usedAuthorization
                  .public_code,

              status:
                usedAuthorization
                  .status,

              used_by:
                usedAuthorization
                  .used_by,

              used_at:
                usedAuthorization
                  .used_at,
            },

            document_hash:
              documentHash,

            rectification:
              originalWeighing !== null
                ? {
                    original_weighing_id:
                      originalWeighing.id,

                    original_previous_status:
                      originalWeighing.status,

                    original_new_status:
                      rectifiedOriginal.status,
                  }
                : null,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      // =================================================
      // RESPUESTA
      // =================================================

      return res.json({

        success: true,

        message:
          'Pesaje certificado correctamente con QR del vendedor',

        weighing:
          certifiedWeighing,

        items,

        authorization:
          usedAuthorization,

        rectification:
          rectifiedOriginal !== null
            ? {
                original_weighing_id:
                  rectifiedOriginal.id,

                original_weighing_number:
                  rectifiedOriginal.weighing_number,

                original_status:
                  rectifiedOriginal.status,

                new_weighing_id:
                  certifiedWeighing.id,

                new_weighing_number:
                  certifiedWeighing.weighing_number,
              }
            : null,

        certification: {

          document_hash:
            documentHash,

          quantity,

          gross_weight_kg:
            roundedGrossWeightKg,

          shrink_percent:
            shrinkPercent,

          shrink_weight_kg:
            shrinkWeightKg,

          net_weight_kg:
            netWeightKg,

          price_per_kg:
            pricePerKg,

          total_amount:
            totalAmount,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CERTIFY SLAUGHTERHOUSE LIVE WEIGHING WITH QR ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'La autorización QR ya está vinculada a otro pesaje',
        });

      }


      return res.status(500).json({
        error:
          'Error certificando pesaje con QR',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// ⚖️ LISTAR PESAJES DE UN LOTE
// GET /slaughterhouse/admin/purchase-lots/:id/weighings
//
// Devuelve resumen de cada pesaje.
// NO carga todos los items individuales.
//
// Filtro opcional:
// ?status=draft
// ?status=certified
// ?status=rectified
// ?status=cancelled
// =====================================================

exports.getLiveWeighings =
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


      const status =
        req.query.status
          ?.toString()
          .trim()
          .toLowerCase() ||
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
            'ID de lote inválido',
        });

      }


      const allowedStatuses =
        [
          'draft',
          'certified',
          'rectified',
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
            'Estado de pesaje inválido',
        });

      }


      // =================================================
      // VERIFICAR LOTE
      // =================================================

      const lotResult =
        await pool.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.external_order_number,
              spl.status,

              spl.seller_person_id,

              seller.full_name
                AS seller_name

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id
              AND seller.company_id =
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


      // =================================================
      // LISTAR PESAJES
      // =================================================

      const result =
        await pool.query(
          `
            SELECT

              w.id,
              w.company_id,
              w.purchase_lot_id,

              w.troop_id,
              troop.troop_number,

              w.authorization_id,

              authorization.authorization_number,
              authorization.public_code,
              authorization.status
                AS authorization_status,

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
              creator.name
                AS created_by_name,

              w.certified_by,
              certifier.name
                AS certified_by_name,

              w.created_at,
              w.certified_at,
              w.updated_at,

              (
                SELECT COUNT(*)::int

                FROM slaughterhouse_live_weighing_items item

                WHERE
                  item.weighing_id = w.id
              )
                AS items_count

            FROM slaughterhouse_live_weighings w

            LEFT JOIN slaughterhouse_troops troop
              ON troop.id =
                w.troop_id
              AND troop.company_id =
                w.company_id

            LEFT JOIN slaughterhouse_weighing_authorizations authorization
              ON authorization.id =
                w.authorization_id
              AND authorization.company_id =
                w.company_id

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

            LEFT JOIN users creator
              ON creator.id =
                w.created_by

            LEFT JOIN users certifier
              ON certifier.id =
                w.certified_by

            WHERE
              w.purchase_lot_id = $1
              AND w.company_id = $2

              AND (
                $3::text IS NULL
                OR w.status = $3
              )

            ORDER BY
              w.weighing_number DESC,
              w.id DESC
          `,
          [
            purchaseLotId,
            companyId,
            status,
          ],
        );


      const weighings =
        result.rows;


      // =================================================
      // RESUMEN DEL LOTE
      //
      // Para totales comerciales usamos únicamente
      // pesajes certificados.
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


      const certifiedTotalAmount =
        certifiedWeighings.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.total_amount || 0
            ),
          0
        );


      const summary = {

        total_weighings:
          weighings.length,

        draft:
          weighings.filter(
            (item) =>
              item.status ===
              'draft'
          ).length,

        certified:
          certifiedWeighings.length,

        rectified:
          weighings.filter(
            (item) =>
              item.status ===
              'rectified'
          ).length,

        cancelled:
          weighings.filter(
            (item) =>
              item.status ===
              'cancelled'
          ).length,

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

        certified_total_amount:
          Number(
            certifiedTotalAmount.toFixed(
              2
            )
          ),

      };


      return res.json({

        success: true,

        purchase_lot:
          lotResult.rows[0],

        summary,

        weighings,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE LIVE WEIGHINGS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo pesajes del lote',
      });

    }

  };

// =====================================================
// ⚖️ DETALLE COMPLETO DE PESAJE
// GET /slaughterhouse/admin/weighings/:id
//
// Devuelve:
// - cabecera del pesaje
// - vendedor
// - captador
// - pesador
// - clasificación
// - tropa
// - autorización QR utilizada
// - items individuales
// - document_hash
//
// IMPORTANTE:
// NO devuelve:
// - token_hash
// - qr_payload_hash
// =====================================================

exports.getLiveWeighingById =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const weighingId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          weighingId
        ) ||
        weighingId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de pesaje inválido',
        });

      }


      // =================================================
      // CABECERA DEL PESAJE
      // =================================================

      const weighingResult =
        await pool.query(
          `
            SELECT

              w.id,
              w.company_id,
              w.purchase_lot_id,

              lot.lot_number,
              lot.external_order_number,

              w.troop_id,
              troop.troop_number,

              w.authorization_id,

              authorization.authorization_number,
              authorization.public_code,
              authorization.purpose,
              authorization.details_snapshot,
              authorization.recipient_phone_snapshot,
              authorization.delivery_channel,
              authorization.expected_date,
              authorization.status
                AS authorization_status,
              authorization.issued_at,
              authorization.used_at,
              authorization.expires_at,

              w.weighing_number,

              w.seller_person_id,
              seller.full_name
                AS seller_name,
              seller.document_number
                AS seller_document_number,
              seller.phone
                AS seller_phone,

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
              creator.name
                AS created_by_name,

              w.certified_by,
              certifier.name
                AS certified_by_name,

              w.created_at,
              w.certified_at,
              w.updated_at

            FROM slaughterhouse_live_weighings w

            JOIN slaughterhouse_purchase_lots lot
              ON lot.id =
                w.purchase_lot_id
              AND lot.company_id =
                w.company_id

            LEFT JOIN slaughterhouse_troops troop
              ON troop.id =
                w.troop_id
              AND troop.company_id =
                w.company_id

            LEFT JOIN slaughterhouse_weighing_authorizations authorization
              ON authorization.id =
                w.authorization_id
              AND authorization.company_id =
                w.company_id

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

            LEFT JOIN users creator
              ON creator.id =
                w.created_by

            LEFT JOIN users certifier
              ON certifier.id =
                w.certified_by

            WHERE
              w.id = $1
              AND w.company_id = $2

            LIMIT 1
          `,
          [
            weighingId,
            companyId,
          ],
        );


      if (
        weighingResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Pesaje no encontrado',
        });

      }


      const weighing =
        weighingResult.rows[0];


      // =================================================
      // ITEMS INDIVIDUALES
      // =================================================

      const itemsResult =
        await pool.query(
          `
            SELECT

              id,
              weighing_id,
              sequence_number,
              weight_kg,
              notes,
              created_at

            FROM slaughterhouse_live_weighing_items

            WHERE
              weighing_id = $1

            ORDER BY
              sequence_number ASC,
              id ASC
          `,
          [
            weighingId,
          ],
        );


      const items =
        itemsResult.rows;


      // =================================================
      // RECTIFICACIONES RELACIONADAS
      //
      // Si este pesaje fue rectificado, mostramos
      // los pesajes posteriores que apuntan a él.
      // =================================================

      const rectificationsResult =
        await pool.query(
          `
            SELECT

              id,
              weighing_number,
              status,
              original_weighing_id,

              quantity,
              gross_weight_kg,
              shrink_percent,
              shrink_weight_kg,
              net_weight_kg,
              price_per_kg,
              total_amount,

              document_hash,

              created_at,
              certified_at,
              updated_at

            FROM slaughterhouse_live_weighings

            WHERE
              original_weighing_id = $1
              AND company_id = $2

            ORDER BY
              created_at ASC,
              id ASC
          `,
          [
            weighingId,
            companyId,
          ],
        );


      const rectifications =
        rectificationsResult.rows;


      // =================================================
      // PESAJE ORIGINAL SI ESTE ES RECTIFICACIÓN
      // =================================================

      let originalWeighing =
        null;


      if (
        weighing.original_weighing_id !==
        null
      ) {

        const originalResult =
          await pool.query(
            `
              SELECT

                id,
                weighing_number,
                status,

                quantity,
                gross_weight_kg,
                shrink_percent,
                shrink_weight_kg,
                net_weight_kg,

                price_per_kg,
                total_amount,

                document_hash,

                created_at,
                certified_at

              FROM slaughterhouse_live_weighings

              WHERE
                id = $1
                AND company_id = $2

              LIMIT 1
            `,
            [
              weighing.original_weighing_id,
              companyId,
            ],
          );


        originalWeighing =
          originalResult.rows[0] ||
          null;

      }


      // =================================================
      // RESUMEN DE INTEGRIDAD
      // =================================================

      const calculatedGrossWeightKg =
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.weight_kg || 0
            ),
          0
        );


      const integrity = {

        items_count:
          items.length,

        stored_quantity:
          weighing.quantity !== null
            ? Number(
                weighing.quantity
              )
            : null,

        calculated_quantity:
          items.length,

        stored_gross_weight_kg:
          weighing.gross_weight_kg !== null
            ? Number(
                weighing.gross_weight_kg
              )
            : null,

        calculated_gross_weight_kg:
          Number(
            calculatedGrossWeightKg.toFixed(
              3
            )
          ),

        quantity_matches:
          weighing.quantity !== null
            ? Number(
                weighing.quantity
              ) ===
              items.length
            : null,

        gross_weight_matches:
          weighing.gross_weight_kg !== null
            ? Math.abs(
                Number(
                  weighing.gross_weight_kg
                ) -
                Number(
                  calculatedGrossWeightKg.toFixed(
                    3
                  )
                )
              ) < 0.001
            : null,

        has_document_hash:
          Boolean(
            weighing.document_hash
          ),

        is_certified:
          weighing.status ===
          'certified',

        certified_offline:
          weighing.certified_offline ===
          true,

      };


      // =================================================
      // RESPUESTA
      // =================================================

      return res.json({

        success: true,

        weighing,

        items,

        integrity,

        original_weighing:
          originalWeighing,

        rectifications,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE LIVE WEIGHING DETAIL ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo detalle del pesaje',
      });

    }

  };

// =====================================================
// ⚖️ DETALLE COMPLETO DE PESAJE
// GET /slaughterhouse/admin/weighings/:id
//
// Devuelve:
// - cabecera del pesaje
// - vendedor
// - captador
// - pesador
// - clasificación
// - tropa
// - autorización QR utilizada
// - items individuales
// - document_hash
//
// IMPORTANTE:
// NO devuelve:
// - token_hash
// - qr_payload_hash
// =====================================================

exports.getLiveWeighingById =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const weighingId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          weighingId
        ) ||
        weighingId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de pesaje inválido',
        });

      }


      // =================================================
      // CABECERA DEL PESAJE
      // =================================================

      const weighingResult =
        await pool.query(
          `
            SELECT

              w.id,
              w.company_id,
              w.purchase_lot_id,

              lot.lot_number,
              lot.external_order_number,

              w.troop_id,
              troop.troop_number,

              w.authorization_id,

              authorization.authorization_number,
              authorization.public_code,
              authorization.purpose,
              authorization.details_snapshot,
              authorization.recipient_phone_snapshot,
              authorization.delivery_channel,
              authorization.expected_date,
              authorization.status
                AS authorization_status,
              authorization.issued_at,
              authorization.used_at,
              authorization.expires_at,

              w.weighing_number,

              w.seller_person_id,
              seller.full_name
                AS seller_name,
              seller.document_number
                AS seller_document_number,
              seller.phone
                AS seller_phone,

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
              creator.name
                AS created_by_name,

              w.certified_by,
              certifier.name
                AS certified_by_name,

              w.created_at,
              w.certified_at,
              w.updated_at

            FROM slaughterhouse_live_weighings w

            JOIN slaughterhouse_purchase_lots lot
              ON lot.id =
                w.purchase_lot_id
              AND lot.company_id =
                w.company_id

            LEFT JOIN slaughterhouse_troops troop
              ON troop.id =
                w.troop_id
              AND troop.company_id =
                w.company_id

            LEFT JOIN slaughterhouse_weighing_authorizations authorization
              ON authorization.id =
                w.authorization_id
              AND authorization.company_id =
                w.company_id

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

            LEFT JOIN users creator
              ON creator.id =
                w.created_by

            LEFT JOIN users certifier
              ON certifier.id =
                w.certified_by

            WHERE
              w.id = $1
              AND w.company_id = $2

            LIMIT 1
          `,
          [
            weighingId,
            companyId,
          ],
        );


      if (
        weighingResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Pesaje no encontrado',
        });

      }


      const weighing =
        weighingResult.rows[0];


      // =================================================
      // ITEMS INDIVIDUALES
      // =================================================

      const itemsResult =
        await pool.query(
          `
            SELECT

              id,
              weighing_id,
              sequence_number,
              weight_kg,
              notes,
              created_at

            FROM slaughterhouse_live_weighing_items

            WHERE
              weighing_id = $1

            ORDER BY
              sequence_number ASC,
              id ASC
          `,
          [
            weighingId,
          ],
        );


      const items =
        itemsResult.rows;


      // =================================================
      // RECTIFICACIONES RELACIONADAS
      //
      // Si este pesaje fue rectificado, mostramos
      // los pesajes posteriores que apuntan a él.
      // =================================================

      const rectificationsResult =
        await pool.query(
          `
            SELECT

              id,
              weighing_number,
              status,
              original_weighing_id,

              quantity,
              gross_weight_kg,
              shrink_percent,
              shrink_weight_kg,
              net_weight_kg,
              price_per_kg,
              total_amount,

              document_hash,

              created_at,
              certified_at,
              updated_at

            FROM slaughterhouse_live_weighings

            WHERE
              original_weighing_id = $1
              AND company_id = $2

            ORDER BY
              created_at ASC,
              id ASC
          `,
          [
            weighingId,
            companyId,
          ],
        );


      const rectifications =
        rectificationsResult.rows;


      // =================================================
      // PESAJE ORIGINAL SI ESTE ES RECTIFICACIÓN
      // =================================================

      let originalWeighing =
        null;


      if (
        weighing.original_weighing_id !==
        null
      ) {

        const originalResult =
          await pool.query(
            `
              SELECT

                id,
                weighing_number,
                status,

                quantity,
                gross_weight_kg,
                shrink_percent,
                shrink_weight_kg,
                net_weight_kg,

                price_per_kg,
                total_amount,

                document_hash,

                created_at,
                certified_at

              FROM slaughterhouse_live_weighings

              WHERE
                id = $1
                AND company_id = $2

              LIMIT 1
            `,
            [
              weighing.original_weighing_id,
              companyId,
            ],
          );


        originalWeighing =
          originalResult.rows[0] ||
          null;

      }


      // =================================================
      // RESUMEN DE INTEGRIDAD
      // =================================================

      const calculatedGrossWeightKg =
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.weight_kg || 0
            ),
          0
        );


      const integrity = {

        items_count:
          items.length,

        stored_quantity:
          weighing.quantity !== null
            ? Number(
                weighing.quantity
              )
            : null,

        calculated_quantity:
          items.length,

        stored_gross_weight_kg:
          weighing.gross_weight_kg !== null
            ? Number(
                weighing.gross_weight_kg
              )
            : null,

        calculated_gross_weight_kg:
          Number(
            calculatedGrossWeightKg.toFixed(
              3
            )
          ),

        quantity_matches:
          weighing.quantity !== null
            ? Number(
                weighing.quantity
              ) ===
              items.length
            : null,

        gross_weight_matches:
          weighing.gross_weight_kg !== null
            ? Math.abs(
                Number(
                  weighing.gross_weight_kg
                ) -
                Number(
                  calculatedGrossWeightKg.toFixed(
                    3
                  )
                )
              ) < 0.001
            : null,

        has_document_hash:
          Boolean(
            weighing.document_hash
          ),

        is_certified:
          weighing.status ===
          'certified',

        certified_offline:
          weighing.certified_offline ===
          true,

      };


      // =================================================
      // RESPUESTA
      // =================================================

      return res.json({

        success: true,

        weighing,

        items,

        integrity,

        original_weighing:
          originalWeighing,

        rectifications,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE LIVE WEIGHING DETAIL ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo detalle del pesaje',
      });

    }

  };

// =====================================================
// ✏️ EDITAR PESAJE EN BORRADOR
// PUT /slaughterhouse/admin/weighings/:id
//
// Solo status = draft.
//
// Body ejemplo:
//
// {
//   "troop_id": 12,
//   "pesador_person_id": 8,
//   "classification_id": 3,
//   "shrink_percent": 2,
//   "price_per_kg": 18.50,
//   "event_lat": -17.1234567,
//   "event_lng": -63.1234567,
//   "event_local_time": "2026-09-04T10:30:00",
//   "items": [
//     {
//       "weight_kg": 430.5,
//       "notes": null
//     },
//     {
//       "weight_kg": 455.2,
//       "notes": null
//     }
//   ]
// }
//
// quantity, pesos totales e importe
// se recalculan siempre en backend.
// =====================================================

exports.updateLiveWeighingDraft =
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


      const weighingId =
        Number(
          req.params.id
        );


      const troopIdRaw =
        req.body.troop_id;


      const troopId =
        troopIdRaw !== undefined &&
        troopIdRaw !== null &&
        troopIdRaw !== ''
          ? Number(
              troopIdRaw
            )
          : null;


      const pesadorPersonIdRaw =
        req.body.pesador_person_id;


      const pesadorPersonId =
        pesadorPersonIdRaw !== undefined &&
        pesadorPersonIdRaw !== null &&
        pesadorPersonIdRaw !== ''
          ? Number(
              pesadorPersonIdRaw
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


      const shrinkPercent =
        req.body.shrink_percent !== undefined &&
        req.body.shrink_percent !== null &&
        req.body.shrink_percent !== ''
          ? Number(
              req.body.shrink_percent
            )
          : 0;


      const pricePerKg =
        req.body.price_per_kg !== undefined &&
        req.body.price_per_kg !== null &&
        req.body.price_per_kg !== ''
          ? Number(
              req.body.price_per_kg
            )
          : null;


      const eventLat =
        req.body.event_lat !== undefined &&
        req.body.event_lat !== null &&
        req.body.event_lat !== ''
          ? Number(
              req.body.event_lat
            )
          : null;


      const eventLng =
        req.body.event_lng !== undefined &&
        req.body.event_lng !== null &&
        req.body.event_lng !== ''
          ? Number(
              req.body.event_lng
            )
          : null;


      const eventLocalTime =
        req.body.event_local_time
          ?.toString()
          .trim() ||
        null;


      const items =
        Array.isArray(
          req.body.items
        )
          ? req.body.items
          : [];


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          weighingId
        ) ||
        weighingId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de pesaje inválido',
        });

      }


      if (
        troopId !== null &&
        (
          !Number.isInteger(
            troopId
          ) ||
          troopId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'troop_id inválido',
        });

      }


      if (
        pesadorPersonId !== null &&
        (
          !Number.isInteger(
            pesadorPersonId
          ) ||
          pesadorPersonId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'pesador_person_id inválido',
        });

      }


      if (
        classificationId !== null &&
        (
          !Number.isInteger(
            classificationId
          ) ||
          classificationId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'classification_id inválido',
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


      if (
        pricePerKg !== null &&
        (
          !Number.isFinite(
            pricePerKg
          ) ||
          pricePerKg < 0
        )
      ) {

        return res.status(400).json({
          error:
            'price_per_kg inválido',
        });

      }


      if (
        eventLat !== null &&
        (
          !Number.isFinite(
            eventLat
          ) ||
          eventLat < -90 ||
          eventLat > 90
        )
      ) {

        return res.status(400).json({
          error:
            'event_lat inválido',
        });

      }


      if (
        eventLng !== null &&
        (
          !Number.isFinite(
            eventLng
          ) ||
          eventLng < -180 ||
          eventLng > 180
        )
      ) {

        return res.status(400).json({
          error:
            'event_lng inválido',
        });

      }


      if (
        eventLocalTime !== null &&
        Number.isNaN(
          new Date(
            eventLocalTime
          ).getTime()
        )
      ) {

        return res.status(400).json({
          error:
            'event_local_time inválido',
        });

      }


      if (
        items.length === 0
      ) {

        return res.status(400).json({
          error:
            'Debe registrar al menos un peso',
        });

      }


      // =================================================
      // NORMALIZAR ITEMS
      // =================================================

      const normalizedItems =
        [];


      for (
        let index = 0;
        index < items.length;
        index++
      ) {

        const weightKg =
          Number(
            items[index]
              ?.weight_kg
          );


        if (
          !Number.isFinite(
            weightKg
          ) ||
          weightKg <= 0
        ) {

          return res.status(400).json({
            error:
              `Peso inválido en el animal ${index + 1}`,
          });

        }


        normalizedItems.push({

          sequence_number:
            index + 1,

          weight_kg:
            Number(
              weightKg.toFixed(
                3
              )
            ),

          notes:
            items[index]
              ?.notes
              ?.toString()
              .trim() ||
            null,

        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR PESAJE
      // =================================================

      const previousResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_live_weighings

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            weighingId,
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
            'Pesaje no encontrado',
        });

      }


      const previousWeighing =
        previousResult.rows[0];


      // =================================================
      // SOLO DRAFT ES EDITABLE
      // =================================================

      if (
        previousWeighing.status !==
        'draft'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `El pesaje está en estado ${previousWeighing.status} y ya no puede modificarse`,
        });

      }


      if (
        previousWeighing.authorization_id !==
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El pesaje ya tiene una autorización asociada y no puede editarse',
        });

      }


      // =================================================
      // ITEMS ANTERIORES PARA AUDITORÍA
      // =================================================

      const previousItemsResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_live_weighing_items

            WHERE
              weighing_id = $1

            ORDER BY
              sequence_number ASC
          `,
          [
            weighingId,
          ],
        );


      const previousItems =
        previousItemsResult.rows;


      // =================================================
      // VALIDAR TROPA
      // =================================================

      if (
        troopId !== null
      ) {

        const troopResult =
          await client.query(
            `
              SELECT
                id,
                status

              FROM slaughterhouse_troops

              WHERE
                id = $1
                AND purchase_lot_id = $2
                AND company_id = $3

              LIMIT 1
            `,
            [
              troopId,
              previousWeighing.purchase_lot_id,
              companyId,
            ],
          );


        if (
          troopResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'La tropa no pertenece al lote de este pesaje',
          });

        }


        if (
          troopResult.rows[0].status ===
          'cancelled'
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(409).json({
            error:
              'La tropa seleccionada está cancelada',
          });

        }

      }


      // =================================================
      // VALIDAR PESADOR
      // =================================================

      if (
        pesadorPersonId !== null
      ) {

        const pesadorResult =
          await client.query(
            `
              SELECT id

              FROM slaughterhouse_people

              WHERE
                id = $1
                AND company_id = $2
                AND is_active = true

              LIMIT 1
            `,
            [
              pesadorPersonId,
              companyId,
            ],
          );


        if (
          pesadorResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(400).json({
            error:
              'El pesador no existe o está inactivo',
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
              'Clasificación animal inválida o inactiva',
          });

        }

      }


      // =================================================
      // RECALCULAR
      // =================================================

      const quantity =
        normalizedItems.length;


      const grossWeightKg =
        normalizedItems.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.weight_kg
            ),
          0
        );


      const roundedGrossWeightKg =
        Number(
          grossWeightKg.toFixed(
            3
          )
        );


      const shrinkWeightKg =
        Number(
          (
            roundedGrossWeightKg *
            shrinkPercent /
            100
          ).toFixed(
            3
          )
        );


      const netWeightKg =
        Number(
          (
            roundedGrossWeightKg -
            shrinkWeightKg
          ).toFixed(
            3
          )
        );


      const totalAmount =
        pricePerKg !== null
          ? Number(
              (
                netWeightKg *
                pricePerKg
              ).toFixed(
                2
              )
            )
          : null;


      // =================================================
      // ACTUALIZAR CABECERA
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_live_weighings

            SET
              troop_id = $1,
              pesador_person_id = $2,
              classification_id = $3,

              quantity = $4,

              gross_weight_kg = $5,
              shrink_percent = $6,
              shrink_weight_kg = $7,
              net_weight_kg = $8,

              price_per_kg = $9,
              total_amount = $10,

              event_lat = $11,
              event_lng = $12,
              event_local_time = $13,

              updated_at = NOW()

            WHERE
              id = $14
              AND company_id = $15

            RETURNING *
          `,
          [
            troopId,
            pesadorPersonId,
            classificationId,

            quantity,

            roundedGrossWeightKg,
            shrinkPercent,
            shrinkWeightKg,
            netWeightKg,

            pricePerKg,
            totalAmount,

            eventLat,
            eventLng,
            eventLocalTime,

            weighingId,
            companyId,
          ],
        );


      const weighing =
        updatedResult.rows[0];


      // =================================================
      // REEMPLAZAR ITEMS
      //
      // Seguro porque el pesaje sigue siendo draft.
      // =================================================

      await client.query(
        `
          DELETE FROM slaughterhouse_live_weighing_items

          WHERE
            weighing_id = $1
        `,
        [
          weighingId,
        ],
      );


      const insertedItems =
        [];


      for (
        const item of normalizedItems
      ) {

        const itemResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_live_weighing_items (
                weighing_id,
                sequence_number,
                weight_kg,
                notes
              )

              VALUES (
                $1,
                $2,
                $3,
                $4
              )

              RETURNING *
            `,
            [
              weighingId,
              item.sequence_number,
              item.weight_kg,
              item.notes,
            ],
          );


        insertedItems.push(
          itemResult.rows[0]
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
            'live_weighing',
            $3,
            'update_draft',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            weighingId
          ),

          JSON.stringify({
            weighing:
              previousWeighing,

            items:
              previousItems,
          }),

          JSON.stringify({
            weighing,

            items:
              insertedItems,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Pesaje en borrador actualizado correctamente',

        weighing,

        items:
          insertedItems,

        calculated: {

          quantity,

          gross_weight_kg:
            roundedGrossWeightKg,

          shrink_percent:
            shrinkPercent,

          shrink_weight_kg:
            shrinkWeightKg,

          net_weight_kg:
            netWeightKg,

          price_per_kg:
            pricePerKg,

          total_amount:
            totalAmount,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'UPDATE SLAUGHTERHOUSE LIVE WEIGHING DRAFT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error actualizando pesaje en borrador',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 📝 CREAR RECTIFICACIÓN DE PESAJE CERTIFICADO
// POST /slaughterhouse/admin/weighings/:id/rectify
//
// Crea un NUEVO pesaje:
// status = draft
// original_weighing_id = pesaje certificado original
//
// El original NO se modifica todavía.
//
// La nueva versión copia:
// - vendedor
// - captador
// - pesador
// - clasificación
// - tropa
// - merma
// - precio
// - ubicación / hora del evento
// - todos los items
//
// NO copia:
// - authorization_id
// - document_hash
// - certified_by
// - certified_at
//
// Necesitará un NUEVO QR para certificarse.
// =====================================================

exports.createLiveWeighingRectification =
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


      const originalWeighingId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          originalWeighingId
        ) ||
        originalWeighingId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de pesaje inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // OBTENER Y BLOQUEAR ORIGINAL
      // =================================================

      const originalResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_live_weighings

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            originalWeighingId,
            companyId,
          ],
        );


      if (
        originalResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Pesaje original no encontrado',
        });

      }


      const original =
        originalResult.rows[0];


      // =================================================
      // SOLO UN CERTIFICADO PUEDE RECTIFICARSE
      // =================================================

      if (
        original.status !==
        'certified'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `Solo puede rectificarse un pesaje certificado. Estado actual: ${original.status}`,
        });

      }


      // =================================================
      // EVITAR RAMAS DE RECTIFICACIÓN
      //
      // No permitimos dos rectificaciones activas
      // saliendo del mismo documento.
      // =================================================

      const existingRectificationResult =
        await client.query(
          `
            SELECT
              id,
              weighing_number,
              status,
              created_at

            FROM slaughterhouse_live_weighings

            WHERE
              original_weighing_id = $1
              AND company_id = $2
              AND status <> 'cancelled'

            ORDER BY
              created_at DESC,
              id DESC

            LIMIT 1
          `,
          [
            originalWeighingId,
            companyId,
          ],
        );


      if (
        existingRectificationResult
          .rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'Este pesaje ya tiene una rectificación activa',

          rectification:
            existingRectificationResult
              .rows[0],

        });

      }


      // =================================================
      // BLOQUEAR LOTE
      //
      // Esto serializa weighing_number igual que en
      // la creación normal de pesajes.
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              id,
              lot_number,
              status

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            original.purchase_lot_id,
            companyId,
          ],
        );


      if (
        lotResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El lote asociado al pesaje ya no existe',
        });

      }


      // =================================================
      // LEER ITEMS DEL ORIGINAL
      // =================================================

      const originalItemsResult =
        await client.query(
          `
            SELECT
              id,
              sequence_number,
              weight_kg,
              notes,
              created_at

            FROM slaughterhouse_live_weighing_items

            WHERE
              weighing_id = $1

            ORDER BY
              sequence_number ASC,
              id ASC
          `,
          [
            originalWeighingId,
          ],
        );


      const originalItems =
        originalItemsResult.rows;


      if (
        originalItems.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El pesaje certificado no tiene items y no puede rectificarse',
        });

      }


      // =================================================
      // SIGUIENTE NÚMERO DE PESAJE DEL LOTE
      // =================================================

      const numberResult =
        await client.query(
          `
            SELECT
              COALESCE(
                MAX(
                  weighing_number
                ),
                0
              ) + 1
                AS next_number

            FROM slaughterhouse_live_weighings

            WHERE
              purchase_lot_id = $1
          `,
          [
            original.purchase_lot_id,
          ],
        );


      const weighingNumber =
        Number(
          numberResult.rows[0]
            .next_number
        );


      // =================================================
      // CREAR NUEVA VERSIÓN EN DRAFT
      //
      // NO copiamos autorización ni certificación.
      // =================================================

      const rectificationResult =
        await client.query(
          `
            INSERT INTO slaughterhouse_live_weighings (
              company_id,
              purchase_lot_id,
              troop_id,

              authorization_id,

              weighing_number,

              seller_person_id,
              captador_person_id,
              pesador_person_id,
              classification_id,

              quantity,

              gross_weight_kg,
              shrink_percent,
              shrink_weight_kg,
              net_weight_kg,

              price_per_kg,
              total_amount,

              signature_url,

              event_lat,
              event_lng,
              event_local_time,

              document_hash,
              certified_offline,

              status,

              original_weighing_id,

              created_by,

              certified_by,
              certified_at
            )

            VALUES (
              $1,
              $2,
              $3,

              NULL,

              $4,

              $5,
              $6,
              $7,
              $8,

              $9,

              $10,
              $11,
              $12,
              $13,

              $14,
              $15,

              NULL,

              $16,
              $17,
              $18,

              NULL,
              false,

              'draft',

              $19,

              $20,

              NULL,
              NULL
            )

            RETURNING *
          `,
          [
            companyId,

            original.purchase_lot_id,

            original.troop_id,

            weighingNumber,

            original.seller_person_id,

            original.captador_person_id,

            original.pesador_person_id,

            original.classification_id,

            original.quantity,

            original.gross_weight_kg,

            original.shrink_percent,

            original.shrink_weight_kg,

            original.net_weight_kg,

            original.price_per_kg,

            original.total_amount,

            original.event_lat,

            original.event_lng,

            original.event_local_time,

            originalWeighingId,

            userId,
          ],
        );


      const rectification =
        rectificationResult.rows[0];


      // =================================================
      // COPIAR ITEMS
      // =================================================

      const copiedItems =
        [];


      for (
        const item of originalItems
      ) {

        const itemResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_live_weighing_items (
                weighing_id,
                sequence_number,
                weight_kg,
                notes
              )

              VALUES (
                $1,
                $2,
                $3,
                $4
              )

              RETURNING *
            `,
            [
              rectification.id,

              item.sequence_number,

              item.weight_kg,

              item.notes,
            ],
          );


        copiedItems.push(
          itemResult.rows[0]
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
            'live_weighing',
            $3,
            'create_rectification_draft',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            rectification.id
          ),

          JSON.stringify({
            original_weighing:
              original,

            original_items:
              originalItems,
          }),

          JSON.stringify({
            rectification:
              rectification,

            copied_items:
              copiedItems,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({

        success: true,

        message:
          'Borrador de rectificación creado correctamente',

        original_weighing: {

          id:
            original.id,

          weighing_number:
            original.weighing_number,

          status:
            original.status,

          document_hash:
            original.document_hash,

        },

        rectification,

        items:
          copiedItems,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CREATE SLAUGHTERHOUSE LIVE WEIGHING RECTIFICATION ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Conflicto creando la rectificación. Intente nuevamente',
        });

      }


      return res.status(500).json({
        error:
          'Error creando rectificación del pesaje',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🚚 DESPACHAR TROPA DESDE ORIGEN
// POST /slaughterhouse/admin/troops/:id/dispatch
//
// Reglas:
//
// - La tropa debe estar transport_assigned.
// - Debe tener solicitud y negociación seleccionada.
// - Debe tener camión y transportista vinculados.
// - Debe existir al menos un pesaje CERTIFIED.
// - dispatched_quantity se calcula desde PostgreSQL.
// - NO modificamos Plaza Transporte aquí.
// - La guía puede vincularse posteriormente.
// =====================================================

exports.dispatchTroop =
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


      const dispatchNotes =
        req.body.notes
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

      const troopResult =
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
        troopResult.rows.length === 0
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
        troopResult.rows[0];


      // =================================================
      // ESTADO CORRECTO
      // =================================================

      if (
        previous.status !==
        'transport_assigned'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status} y no puede despacharse`,
        });

      }


      // =================================================
      // DEBE TENER TRANSPORTE COMPLETAMENTE ASIGNADO
      // =================================================

      if (
        previous.transport_request_id ===
          null ||
        previous.transport_negotiation_id ===
          null ||
        previous.truck_id ===
          null ||
        previous.transporter_user_id ===
          null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa no tiene transporte completamente asignado',
        });

      }


      // =================================================
      // VALIDAR NEGOCIACIÓN
      // =================================================

      const negotiationResult =
        await client.query(
          `
            SELECT

              tn.id,
              tn.request_id,
              tn.truck_id,
              tn.transporter_id,

              tn.status,
              tn.trip_price,

              tn.cancelled,

              truck.plate,
              truck.brand,
              truck.model,

              transporter.name
                AS transporter_name

            FROM transport_negotiations tn

            JOIN transporter_trucks truck
              ON truck.id =
                tn.truck_id

            JOIN users transporter
              ON transporter.id =
                tn.transporter_id

            WHERE
              tn.id = $1
              AND tn.request_id = $2
              AND tn.truck_id = $3
              AND tn.transporter_id = $4

            LIMIT 1
          `,
          [
            previous.transport_negotiation_id,
            previous.transport_request_id,
            previous.truck_id,
            previous.transporter_user_id,
          ],
        );


      if (
        negotiationResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La asignación de transporte de la tropa no coincide con la negociación',
        });

      }


      const negotiation =
        negotiationResult.rows[0];


      if (
        negotiation.cancelled ===
        true
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación de transporte está cancelada',
        });

      }


      // =================================================
      // OBTENER PESAJE CERTIFICADO REAL
      //
      // Solo status = certified.
      //
      // Los originales reemplazados quedan rectified
      // y por tanto NO entran en esta suma.
      // =================================================

      const weighingSummaryResult =
        await client.query(
          `
            SELECT

              COUNT(*)::int
                AS weighings_count,

              COALESCE(
                SUM(quantity),
                0
              )::int
                AS quantity,

              COALESCE(
                SUM(gross_weight_kg),
                0
              )::numeric(14,3)
                AS gross_weight_kg,

              COALESCE(
                SUM(net_weight_kg),
                0
              )::numeric(14,3)
                AS net_weight_kg

            FROM slaughterhouse_live_weighings

            WHERE
              troop_id = $1
              AND company_id = $2
              AND status = 'certified'
          `,
          [
            troopId,
            companyId,
          ],
        );


      const weighingSummary =
        weighingSummaryResult.rows[0];


      const certifiedWeighingsCount =
        Number(
          weighingSummary.weighings_count
        );


      const dispatchedQuantity =
        Number(
          weighingSummary.quantity
        );


      if (
        certifiedWeighingsCount <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa debe tener al menos un pesaje certificado antes del despacho',
        });

      }


      if (
        !Number.isInteger(
          dispatchedQuantity
        ) ||
        dispatchedQuantity <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La cantidad certificada de la tropa es inválida',
        });

      }


      // =================================================
      // DESPACHAR TROPA
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              dispatched_quantity = $1,
              status = 'dispatched',
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            dispatchedQuantity,
            troopId,
            companyId,
          ],
        );


      const troop =
        updatedResult.rows[0];


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
            'dispatch',
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

            troop,

            dispatch: {

              certified_weighings_count:
                certifiedWeighingsCount,

              dispatched_quantity:
                dispatchedQuantity,

              gross_weight_kg:
                Number(
                  weighingSummary
                    .gross_weight_kg
                ),

              net_weight_kg:
                Number(
                  weighingSummary
                    .net_weight_kg
                ),

              negotiation_id:
                negotiation.id,

              truck_id:
                negotiation.truck_id,

              plate:
                negotiation.plate,

              transporter_id:
                negotiation.transporter_id,

              transporter_name:
                negotiation.transporter_name,

              notes:
                dispatchNotes,

            },

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Tropa despachada correctamente',

        troop,

        dispatch: {

          certified_weighings_count:
            certifiedWeighingsCount,

          dispatched_quantity:
            dispatchedQuantity,

          gross_weight_kg:
            Number(
              weighingSummary
                .gross_weight_kg
            ),

          net_weight_kg:
            Number(
              weighingSummary
                .net_weight_kg
            ),

          transport: {

            negotiation_id:
              negotiation.id,

            truck_id:
              negotiation.truck_id,

            plate:
              negotiation.plate,

            brand:
              negotiation.brand,

            model:
              negotiation.model,

            transporter_id:
              negotiation.transporter_id,

            transporter_name:
              negotiation.transporter_name,

          },

          notes:
            dispatchNotes,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'DISPATCH SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error despachando tropa',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 📄 VINCULAR GUÍA DE PLAZA TRANSPORTE A TROPA
// POST /slaughterhouse/admin/troops/:id/link-guide
//
// No crea una nueva guía.
//
// Busca la guía existente mediante:
// - transport_negotiation_id
// - truck_id
//
// Y guarda:
// slaughterhouse_troops.transport_guide_id
//
// NO cambia el estado de la tropa.
// =====================================================

exports.linkTransportGuideToTroop =
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

      const troopResult =
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
        troopResult.rows.length === 0
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
        troopResult.rows[0];


      // =================================================
      // NECESITAMOS NEGOCIACIÓN Y CAMIÓN
      // =================================================

      if (
        previous.transport_negotiation_id ===
          null ||
        previous.truck_id ===
          null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa todavía no tiene negociación y camión asignados',
        });

      }


      // =================================================
      // ESTADOS DONDE TIENE SENTIDO VINCULAR GUÍA
      // =================================================

      if (
        ![
          'transport_assigned',
          'dispatched',
          'in_transit',
        ].includes(
          previous.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status} y no corresponde vincular una guía`,
        });

      }


      // =================================================
      // SI YA TIENE GUÍA, VALIDAMOS LA RELACIÓN
      // Y RESPONDEMOS DE FORMA IDEMPOTENTE
      // =================================================

      if (
        previous.transport_guide_id !==
        null
      ) {

        const existingGuideResult =
          await client.query(
            `
              SELECT

                id,
                truck_id,
                user_id,
                negotiation_id,

                origin,
                destination,

                driver_name,
                driver_ci,

                plate,

                male_0_12,
                female_0_12,

                male_13_24,
                female_13_24,

                male_25_36,
                female_25_36,

                male_36_plus,
                female_36_plus,

                guide_image_url,

                status,

                official_guide_photo_url,
                official_uploaded_at,
                official_guide_number,

                created_at

              FROM transport_guides

              WHERE
                id = $1

              LIMIT 1
            `,
            [
              previous.transport_guide_id,
            ],
          );


        if (
          existingGuideResult.rows.length === 0
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(409).json({
            error:
              'La tropa tiene transport_guide_id pero la guía vinculada no existe',
          });

        }


        const existingGuide =
          existingGuideResult.rows[0];


        if (
          Number(
            existingGuide.negotiation_id
          ) !==
            Number(
              previous.transport_negotiation_id
            ) ||
          Number(
            existingGuide.truck_id
          ) !==
            Number(
              previous.truck_id
            )
        ) {

          await client.query(
            'ROLLBACK'
          );


          return res.status(409).json({
            error:
              'La guía actualmente vinculada no coincide con la negociación o el camión de la tropa',
          });

        }


        await client.query(
          'COMMIT'
        );


        return res.json({

          success: true,

          already_linked: true,

          message:
            'La guía ya estaba vinculada correctamente a la tropa',

          troop:
            previous,

          guide:
            existingGuide,

        });

      }


      // =================================================
      // BUSCAR GUÍA GENERADA POR PLAZA TRANSPORTE
      //
      // Puede haber más de un registro histórico;
      // tomamos el más reciente que corresponda
      // exactamente a negociación + camión.
      // =================================================

      const guideResult =
        await client.query(
          `
            SELECT

              tg.id,
              tg.truck_id,
              tg.user_id,
              tg.negotiation_id,

              tg.origin,
              tg.destination,

              tg.driver_name,
              tg.driver_ci,

              tg.plate,

              tg.male_0_12,
              tg.female_0_12,

              tg.male_13_24,
              tg.female_13_24,

              tg.male_25_36,
              tg.female_25_36,

              tg.male_36_plus,
              tg.female_36_plus,

              tg.guide_image_url,

              tg.status,

              tg.official_guide_photo_url,
              tg.official_uploaded_at,
              tg.official_guide_number,

              tg.created_at

            FROM transport_guides tg

            WHERE
              tg.negotiation_id = $1
              AND tg.truck_id = $2

            ORDER BY
              tg.created_at DESC,
              tg.id DESC

            LIMIT 1
          `,
          [
            previous.transport_negotiation_id,
            previous.truck_id,
          ],
        );


      if (
        guideResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Plaza Transporte todavía no tiene una guía para esta negociación',
        });

      }


      const guide =
        guideResult.rows[0];


      // =================================================
      // VINCULAR GUÍA A TROPA
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              transport_guide_id = $1,
              updated_at = NOW()

            WHERE
              id = $2
              AND company_id = $3

            RETURNING *
          `,
          [
            guide.id,
            troopId,
            companyId,
          ],
        );


      const troop =
        updatedResult.rows[0];


      // =================================================
      // AUDITORÍA
      //
      // NO almacenamos share_token.
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
            'link_transport_guide',
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

            troop,

            guide: {

              id:
                guide.id,

              negotiation_id:
                guide.negotiation_id,

              truck_id:
                guide.truck_id,

              plate:
                guide.plate,

              driver_name:
                guide.driver_name,

              driver_ci:
                guide.driver_ci,

              status:
                guide.status,

              official_guide_number:
                guide.official_guide_number,

            },

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        already_linked: false,

        message:
          'Guía de transporte vinculada correctamente a la tropa',

        troop,

        guide,

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'LINK TRANSPORT GUIDE TO SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error vinculando la guía de transporte a la tropa',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🔄 SINCRONIZAR ESTADO DE VIAJE DE UNA TROPA
// POST /slaughterhouse/admin/troops/:id/sync-transport-state
//
// Fuente de verdad del viaje:
// transport_negotiations.trip_started_at
//
// Regla:
//
// dispatched
//    +
// trip_started_at != NULL
//    ↓
// in_transit
//
// IMPORTANTE:
//
// - NO modifica transport_negotiations.
// - NO modifica transport_requests.
// - NO marca received por delivered_at.
// - La recepción física la controla Frigosi.
// =====================================================

exports.syncTroopTransportState =
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

      const troopResult =
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
        troopResult.rows.length === 0
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
        troopResult.rows[0];


      // =================================================
      // NECESITAMOS NEGOCIACIÓN
      // =================================================

      if (
        previous.transport_negotiation_id ===
        null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa no tiene una negociación de transporte vinculada',
        });

      }


      // =================================================
      // OBTENER ESTADO REAL DEL VIAJE
      // =================================================

      const negotiationResult =
        await client.query(
          `
            SELECT

              tn.id,
              tn.request_id,
              tn.truck_id,
              tn.transporter_id,

              tn.status,

              tn.trip_started_at,
              tn.delivered_at,

              tn.route_id,

              tn.cancelled,

              truck.plate,

              transporter.name
                AS transporter_name

            FROM transport_negotiations tn

            JOIN transporter_trucks truck
              ON truck.id =
                tn.truck_id

            JOIN users transporter
              ON transporter.id =
                tn.transporter_id

            WHERE
              tn.id = $1
              AND tn.request_id = $2
              AND tn.truck_id = $3
              AND tn.transporter_id = $4

            LIMIT 1
          `,
          [
            previous.transport_negotiation_id,
            previous.transport_request_id,
            previous.truck_id,
            previous.transporter_user_id,
          ],
        );


      if (
        negotiationResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación de transporte no coincide con los datos vinculados a la tropa',
        });

      }


      const negotiation =
        negotiationResult.rows[0];


      // =================================================
      // NEGOCIACIÓN CANCELADA
      // =================================================

      if (
        negotiation.cancelled ===
        true
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación de transporte está cancelada',
        });

      }


      // =================================================
      // YA ESTÁ EN TRÁNSITO
      //
      // Respuesta idempotente.
      // =================================================

      if (
        previous.status ===
        'in_transit'
      ) {

        await client.query(
          'COMMIT'
        );


        return res.json({

          success: true,

          changed: false,

          message:
            'La tropa ya está marcada como en tránsito',

          troop:
            previous,

          transport: {

            negotiation_id:
              negotiation.id,

            trip_started_at:
              negotiation.trip_started_at,

            delivered_at:
              negotiation.delivered_at,

            route_id:
              negotiation.route_id,

            plate:
              negotiation.plate,

            transporter_name:
              negotiation.transporter_name,

          },

        });

      }


      // =================================================
      // SOLO DISPATCHED PUEDE PASAR AUTOMÁTICAMENTE
      // A IN_TRANSIT
      // =================================================

      if (
        previous.status !==
        'dispatched'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status}. La sincronización automática del viaje solo aplica desde dispatched`,
        });

      }


      // =================================================
      // VIAJE TODAVÍA NO INICIADO
      // =================================================

      if (
        negotiation.trip_started_at ===
        null
      ) {

        await client.query(
          'COMMIT'
        );


        return res.json({

          success: true,

          changed: false,

          message:
            'Plaza Transporte todavía no registra el inicio del viaje',

          troop:
            previous,

          transport: {

            negotiation_id:
              negotiation.id,

            trip_started_at:
              null,

            delivered_at:
              negotiation.delivered_at,

            route_id:
              negotiation.route_id,

            plate:
              negotiation.plate,

            transporter_name:
              negotiation.transporter_name,

          },

        });

      }


      // =================================================
      // SINCRONIZAR:
      // dispatched → in_transit
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              status = 'in_transit',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2
              AND status = 'dispatched'

            RETURNING *
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        updatedResult.rows.length === 0
      ) {

        throw new Error(
          'No fue posible sincronizar el estado de la tropa'
        );

      }


      const troop =
        updatedResult.rows[0];


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
            'sync_transport_started',
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

            troop,

            transport: {

              negotiation_id:
                negotiation.id,

              trip_started_at:
                negotiation.trip_started_at,

              route_id:
                negotiation.route_id,

              truck_id:
                negotiation.truck_id,

              plate:
                negotiation.plate,

              transporter_id:
                negotiation.transporter_id,

              transporter_name:
                negotiation.transporter_name,

            },

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        changed: true,

        message:
          'Inicio de viaje sincronizado correctamente',

        troop,

        transport: {

          negotiation_id:
            negotiation.id,

          trip_started_at:
            negotiation.trip_started_at,

          delivered_at:
            negotiation.delivered_at,

          route_id:
            negotiation.route_id,

          truck_id:
            negotiation.truck_id,

          plate:
            negotiation.plate,

          transporter_id:
            negotiation.transporter_id,

          transporter_name:
            negotiation.transporter_name,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'SYNC SLAUGHTERHOUSE TROOP TRANSPORT STATE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error sincronizando estado de transporte de la tropa',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 🏭 RECEPCIONAR TROPA EN PORTERÍA
// POST /slaughterhouse/admin/troops/:id/receive
//
// Body:
//
// {
//   "troop_number": "T-2026-00125",
//   "received_quantity": 40,
//   "live_weight_kg": 18450.50,
//   "reception_notes": null
// }
//
// Reglas:
//
// - Plaza Transporte debe registrar delivered_at.
// - Debe existir guía.
// - Si cantidad guía != cantidad recibida,
//   exige observación.
// - No permite doble recepción.
// - Reutiliza automáticamente una recepción OPEN
//   del mismo lote.
// - Si no existe, crea una.
// - Vincula la tropa con reception +
//   reception_truck.
// - Tropa pasa a received.
// =====================================================

exports.receiveTroop =
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


      const receivedQuantity =
        Number(
          req.body.received_quantity
        );


      const liveWeightRaw =
        req.body.live_weight_kg;


      const liveWeightKg =
        liveWeightRaw !== undefined &&
        liveWeightRaw !== null &&
        liveWeightRaw !== ''
          ? Number(
              liveWeightRaw
            )
          : null;


      const receptionNotes =
        req.body.reception_notes
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
        !Number.isInteger(
          receivedQuantity
        ) ||
        receivedQuantity < 0
      ) {

        return res.status(400).json({
          error:
            'received_quantity inválido',
        });

      }


      if (
        liveWeightKg !== null &&
        (
          !Number.isFinite(
            liveWeightKg
          ) ||
          liveWeightKg <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'live_weight_kg inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // TROPA + LOTE
      // =================================================

      const troopResult =
        await client.query(
          `
            SELECT

              st.*,

              spl.lot_number,
              spl.status
                AS purchase_lot_status

            FROM slaughterhouse_troops st

            JOIN slaughterhouse_purchase_lots spl
              ON spl.id =
                st.purchase_lot_id
              AND spl.company_id =
                st.company_id

            WHERE
              st.id = $1
              AND st.company_id = $2

            FOR UPDATE OF st, spl
          `,
          [
            troopId,
            companyId,
          ],
        );


      if (
        troopResult.rows.length === 0
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
        troopResult.rows[0];


      // =================================================
      // EVITAR DOBLE RECEPCIÓN
      // =================================================

      if (
        previous.reception_id !== null ||
        previous.reception_truck_id !== null ||
        previous.status === 'received' ||
        previous.status === 'in_slaughter' ||
        previous.status === 'completed'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa ya fue recepcionada',
        });

      }


      // =================================================
      // DEBE TENER TRANSPORTE ASIGNADO
      // =================================================

      if (
        previous.transport_request_id === null ||
        previous.transport_negotiation_id === null ||
        previous.truck_id === null ||
        previous.transporter_user_id === null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La tropa no tiene transporte completamente vinculado',
        });

      }


      if (
        ![
          'dispatched',
          'in_transit',
        ].includes(
          previous.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La tropa está en estado ${previous.status} y no puede recepcionarse`,
        });

      }


      // =================================================
      // TRANSPORTE + CAMIÓN + ÚLTIMA GUÍA
      // =================================================

      const transportResult =
        await client.query(
          `
            SELECT

              tn.id
                AS negotiation_id,

              tn.request_id,

              tn.status
                AS negotiation_status,

              tn.trip_started_at,
              tn.delivered_at,

              tn.truck_id,
              tn.transporter_id,

              tn.cancelled,


              tr.origin,
              tr.destination,
              tr.animal_type,
              tr.quantity
                AS request_quantity,


              truck.plate,
              truck.brand,
              truck.model,


              tg.id
                AS guide_id,

              tg.status
                AS guide_status,

              tg.driver_name,
              tg.driver_ci,

              tg.plate
                AS guide_plate,

              tg.male_0_12,
              tg.female_0_12,

              tg.male_13_24,
              tg.female_13_24,

              tg.male_25_36,
              tg.female_25_36,

              tg.male_36_plus,
              tg.female_36_plus,

              tg.guide_image_url,
              tg.official_guide_photo_url,
              tg.official_guide_number

            FROM transport_negotiations tn

            JOIN transport_requests tr
              ON tr.id =
                tn.request_id

            JOIN transporter_trucks truck
              ON truck.id =
                tn.truck_id

            LEFT JOIN LATERAL (

              SELECT
                tg2.*

              FROM transport_guides tg2

              WHERE
                tg2.negotiation_id =
                  tn.id
                AND tg2.truck_id =
                  tn.truck_id

              ORDER BY
                tg2.created_at DESC,
                tg2.id DESC

              LIMIT 1

            ) tg
              ON true

            WHERE
              tn.id = $1
              AND tn.request_id = $2
              AND tn.truck_id = $3
              AND tn.transporter_id = $4

              AND tr.requester_company_id = $5

            LIMIT 1

            FOR UPDATE OF tn
          `,
          [
            previous.transport_negotiation_id,
            previous.transport_request_id,
            previous.truck_id,
            previous.transporter_user_id,
            companyId,
          ],
        );


      if (
        transportResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El transporte vinculado a la tropa no es válido para este frigorífico',
        });

      }


      const transport =
        transportResult.rows[0];


      // =================================================
      // NEGOCIACIÓN NO CANCELADA
      // =================================================

      if (
        transport.cancelled === true
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La negociación de transporte está cancelada',
        });

      }


      // =================================================
      // PLAZA TRANSPORTE DEBE HABER REGISTRADO LLEGADA
      // =================================================

      if (
        transport.delivered_at === null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'Plaza Transporte todavía no registra la llegada del camión',
        });

      }


      // =================================================
      // DEBE EXISTIR GUÍA
      // =================================================

      if (
        transport.guide_id === null
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'El transporte no tiene guía registrada',
        });

      }


      // =================================================
      // CANTIDAD DE GUÍA
      // =================================================

      const guideQuantity =

        Number(
          transport.male_0_12 || 0
        ) +

        Number(
          transport.female_0_12 || 0
        ) +

        Number(
          transport.male_13_24 || 0
        ) +

        Number(
          transport.female_13_24 || 0
        ) +

        Number(
          transport.male_25_36 || 0
        ) +

        Number(
          transport.female_25_36 || 0
        ) +

        Number(
          transport.male_36_plus || 0
        ) +

        Number(
          transport.female_36_plus || 0
        );


      // =================================================
      // DIFERENCIA GUÍA VS RECEPCIÓN
      // =================================================

      if (
        receivedQuantity !==
          guideQuantity &&
        !receptionNotes
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(400).json({

          error:
            'Existe diferencia entre la guía y lo recibido. Debe registrar una observación.',

          guide_quantity:
            guideQuantity,

          received_quantity:
            receivedQuantity,

          difference:
            receivedQuantity -
            guideQuantity,

        });

      }


      // =================================================
      // EVITAR DOBLE RECEPCIÓN DE LA NEGOCIACIÓN
      // =================================================

      const duplicateResult =
        await client.query(
          `
            SELECT
              id,
              reception_id,
              received_at

            FROM slaughterhouse_reception_trucks

            WHERE
              transport_negotiation_id = $1

            LIMIT 1
          `,
          [
            transport.negotiation_id,
          ],
        );


      if (
        duplicateResult.rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'Este transporte ya fue recepcionado',

          reception:
            duplicateResult.rows[0],

        });

      }


      // =================================================
      // BUSCAR RECEPCIÓN OPEN DEL MISMO LOTE
      //
      // Si otra tropa del mismo lote ya llegó,
      // usamos la misma recepción.
      // =================================================

      const openReceptionResult =
        await client.query(
          `
            SELECT
              sr.*

            FROM slaughterhouse_troops other_troop

            JOIN slaughterhouse_receptions sr
              ON sr.id =
                other_troop.reception_id

            WHERE
              other_troop.purchase_lot_id = $1
              AND other_troop.company_id = $2

              AND sr.company_id = $2
              AND sr.status = 'open'

            ORDER BY
              sr.opened_at ASC,
              sr.id ASC

            LIMIT 1

            FOR UPDATE OF sr
          `,
          [
            previous.purchase_lot_id,
            companyId,
          ],
        );


      let reception;


      if (
        openReceptionResult.rows.length > 0
      ) {

        reception =
          openReceptionResult.rows[0];

      } else {

        // ===============================================
        // PRIMER CAMIÓN DEL LOTE:
        // CREAR RECEPCIÓN
        //
        // plant_lot_number hereda el número del lote
        // comercial para mantener trazabilidad.
        // ===============================================

        const newReceptionResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_receptions (
                company_id,
                plant_lot_number,
                status,
                created_by,
                opened_at
              )

              VALUES (
                $1,
                $2,
                'open',
                $3,
                NOW()
              )

              RETURNING *
            `,
            [
              companyId,
              previous.lot_number,
              userId,
            ],
          );


        reception =
          newReceptionResult.rows[0];

      }


      // =================================================
      // SNAPSHOT DEL CAMIÓN RECIBIDO
      // =================================================

      const receptionTruckResult =
        await client.query(
          `
            INSERT INTO slaughterhouse_reception_trucks (

              reception_id,

              transport_negotiation_id,
              transport_request_id,
              transport_guide_id,

              truck_id,
              transporter_id,

              plate_snapshot,

              animal_type_snapshot,
              origin_snapshot,
              destination_snapshot,

              guide_quantity,
              received_quantity,

              male_0_12,
              female_0_12,

              male_13_24,
              female_13_24,

              male_25_36,
              female_25_36,

              male_36_plus,
              female_36_plus,

              guide_image_url,

              live_weight_kg,

              transport_delivered_at,

              received_at,
              received_by,

              reception_notes,

              official_guide_number_snapshot,

              truck_brand_snapshot,
              truck_model_snapshot,

              driver_name_snapshot,
              driver_ci_snapshot

            )

            VALUES (

              $1,

              $2,
              $3,
              $4,

              $5,
              $6,

              $7,

              $8,
              $9,
              $10,

              $11,
              $12,

              $13,
              $14,

              $15,
              $16,

              $17,
              $18,

              $19,
              $20,

              $21,

              $22,

              $23,

              NOW(),
              $24,

              $25,

              $26,

              $27,
              $28,

              $29,
              $30

            )

            RETURNING *
          `,
          [
            reception.id,

            transport.negotiation_id,
            transport.request_id,
            transport.guide_id,

            transport.truck_id,
            transport.transporter_id,

            transport.plate,

            transport.animal_type,
            transport.origin,
            transport.destination,

            guideQuantity,
            receivedQuantity,

            Number(
              transport.male_0_12 || 0
            ),

            Number(
              transport.female_0_12 || 0
            ),

            Number(
              transport.male_13_24 || 0
            ),

            Number(
              transport.female_13_24 || 0
            ),

            Number(
              transport.male_25_36 || 0
            ),

            Number(
              transport.female_25_36 || 0
            ),

            Number(
              transport.male_36_plus || 0
            ),

            Number(
              transport.female_36_plus || 0
            ),

            transport.official_guide_photo_url ||
            transport.guide_image_url,

            liveWeightKg,

            transport.delivered_at,

            userId,

            receptionNotes,

            transport.official_guide_number,

            transport.brand,

            transport.model,

            transport.driver_name,

            transport.driver_ci,
          ],
        );


      const receptionTruck =
        receptionTruckResult.rows[0];


      // =================================================
      // ACTUALIZAR TROPA
      //
      // Portería puede asignar aquí troop_number.
      // =================================================

      const updatedTroopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              troop_number =
                COALESCE(
                  $1,
                  troop_number
                ),

              transport_guide_id = $2,

              reception_id = $3,
              reception_truck_id = $4,

              received_quantity = $5,

              status = 'received',

              updated_at = NOW()

            WHERE
              id = $6
              AND company_id = $7

            RETURNING *
          `,
          [
            troopNumber,

            transport.guide_id,

            reception.id,

            receptionTruck.id,

            receivedQuantity,

            troopId,

            companyId,
          ],
        );


      const troop =
        updatedTroopResult.rows[0];


      // =================================================
      // ¿YA LLEGARON TODAS LAS TROPAS DEL LOTE?
      // =================================================

      const lotProgressResult =
        await client.query(
          `
            SELECT

              COUNT(*) FILTER (
                WHERE
                  status <> 'cancelled'
              )::int
                AS active_troops,

              COUNT(*) FILTER (
                WHERE
                  status <> 'cancelled'
                  AND status NOT IN (
                    'received',
                    'in_slaughter',
                    'completed'
                  )
              )::int
                AS pending_troops

            FROM slaughterhouse_troops

            WHERE
              purchase_lot_id = $1
              AND company_id = $2
          `,
          [
            previous.purchase_lot_id,
            companyId,
          ],
        );


      const lotProgress =
        lotProgressResult.rows[0];


      const allTroopsReceived =
        Number(
          lotProgress.active_troops
        ) > 0 &&
        Number(
          lotProgress.pending_troops
        ) === 0;


      if (
        allTroopsReceived
      ) {

        await client.query(
          `
            UPDATE slaughterhouse_purchase_lots

            SET
              status = 'received',
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2
              AND status IN (
                'open',
                'in_transport'
              )
          `,
          [
            previous.purchase_lot_id,
            companyId,
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
            'troop',
            $3,
            'receive',
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

            troop,

            reception: {
              id:
                reception.id,

              reception_number:
                reception.reception_number,

              plant_lot_number:
                reception.plant_lot_number,
            },

            reception_truck: {
              id:
                receptionTruck.id,

              guide_quantity:
                guideQuantity,

              received_quantity:
                receivedQuantity,

              difference:
                receivedQuantity -
                guideQuantity,

              live_weight_kg:
                liveWeightKg,

              official_guide_number:
                transport.official_guide_number,

              received_at:
                receptionTruck.received_at,
            },

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({

        success: true,

        message:
          'Tropa recepcionada correctamente',

        troop,

        reception: {

          id:
            reception.id,

          reception_number:
            reception.reception_number,

          plant_lot_number:
            reception.plant_lot_number,

          status:
            reception.status,

        },

        reception_truck:
          receptionTruck,

        reconciliation: {

          guide_quantity:
            guideQuantity,

          received_quantity:
            receivedQuantity,

          difference:
            receivedQuantity -
            guideQuantity,

        },

        purchase_lot: {

          id:
            previous.purchase_lot_id,

          all_troops_received:
            allTroopsReceived,

          active_troops:
            Number(
              lotProgress.active_troops
            ),

          pending_troops:
            Number(
              lotProgress.pending_troops
            ),

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'RECEIVE SLAUGHTERHOUSE TROOP ERROR:',
        error
      );


      if (
        error.code === '23505' &&
        error.constraint ===
          'uq_slaughterhouse_troop_number'
      ) {

        return res.status(409).json({
          error:
            'Ese número de tropa ya está utilizado',
        });

      }


      if (
        error.code === '23505' &&
        error.constraint ===
          'slaughterhouse_reception_trucks_negotiation_unique'
      ) {

        return res.status(409).json({
          error:
            'Este transporte ya fue recepcionado',
        });

      }


      return res.status(500).json({
        error:
          'Error recepcionando la tropa',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 📋 LISTAR RECEPCIONES - ADMIN FRIGOSI
// GET /slaughterhouse/admin/receptions
//
// Filtros opcionales:
// ?status=open
// ?q=REC-000123
//
// Devuelve resumen por recepción.
// El detalle de tropas/camiones irá en:
// GET /receptions/:id
// =====================================================

exports.getAdminReceptions =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


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
      // VALIDAR ESTADO
      // =================================================

      const allowedStatuses =
        [
          'open',
          'closed',
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
            'Estado de recepción inválido',
        });

      }


      // =================================================
      // CONSULTA
      //
      // IMPORTANTE:
      //
      // Camiones y tropas se agregan por separado
      // mediante LATERAL.
      //
      // Así evitamos multiplicación de filas:
      //
      // 2 camiones x 3 tropas
      // NO genera 6 registros para los SUM().
      // =================================================

      const result =
        await pool.query(
          `
            SELECT

              sr.id,
              sr.company_id,

              sr.reception_number,
              sr.plant_lot_number,

              sr.status,
              sr.notes,

              sr.created_by,

              creator.name
                AS created_by_name,

              sr.opened_at,
              sr.closed_at,
              sr.slaughter_started_at,
              sr.completed_at,

              sr.created_at,
              sr.updated_at,


              COALESCE(
                trucks.trucks_count,
                0
              )::int
                AS trucks_count,


              COALESCE(
                troops.troops_count,
                0
              )::int
                AS troops_count,


              COALESCE(
                trucks.guide_quantity_total,
                0
              )::int
                AS guide_quantity_total,


              COALESCE(
                trucks.received_quantity_total,
                0
              )::int
                AS received_quantity_total,


              (
                COALESCE(
                  trucks.received_quantity_total,
                  0
                )
                -
                COALESCE(
                  trucks.guide_quantity_total,
                  0
                )
              )::int
                AS quantity_difference,


              COALESCE(
                trucks.live_weight_kg_total,
                0
              )::numeric(16,2)
                AS live_weight_kg_total,


              trucks.first_truck_received_at,

              trucks.last_truck_received_at


            FROM slaughterhouse_receptions sr


            // =================================================
            // CAMIONES AGREGADOS INDEPENDIENTEMENTE
            // =================================================

            LEFT JOIN LATERAL (

              SELECT

                COUNT(*)::int
                  AS trucks_count,


                COALESCE(
                  SUM(
                    srt.guide_quantity
                  ),
                  0
                )::int
                  AS guide_quantity_total,


                COALESCE(
                  SUM(
                    srt.received_quantity
                  ),
                  0
                )::int
                  AS received_quantity_total,


                COALESCE(
                  SUM(
                    srt.live_weight_kg
                  ),
                  0
                )::numeric(16,2)
                  AS live_weight_kg_total,


                MIN(
                  srt.received_at
                )
                  AS first_truck_received_at,


                MAX(
                  srt.received_at
                )
                  AS last_truck_received_at


              FROM slaughterhouse_reception_trucks srt

              WHERE
                srt.reception_id =
                  sr.id

            ) trucks
              ON true


            // =================================================
            // TROPAS AGREGADAS INDEPENDIENTEMENTE
            // =================================================

            LEFT JOIN LATERAL (

              SELECT

                COUNT(*)::int
                  AS troops_count

              FROM slaughterhouse_troops st

              WHERE
                st.reception_id =
                  sr.id

                AND st.company_id =
                  sr.company_id

            ) troops
              ON true


            LEFT JOIN users creator
              ON creator.id =
                sr.created_by


            WHERE
              sr.company_id = $1

              AND (
                $2::text IS NULL
                OR sr.status = $2
              )

              AND (
                $3::text IS NULL

                OR sr.reception_number ILIKE
                  '%' || $3 || '%'

                OR sr.plant_lot_number ILIKE
                  '%' || $3 || '%'
              )


            ORDER BY

              CASE

                WHEN sr.status = 'open'
                  THEN 1

                WHEN sr.status = 'closed'
                  THEN 2

                WHEN sr.status = 'in_slaughter'
                  THEN 3

                WHEN sr.status = 'completed'
                  THEN 4

                WHEN sr.status = 'cancelled'
                  THEN 5

                ELSE 6

              END,

              sr.opened_at DESC,
              sr.id DESC
          `,
          [
            companyId,
            status,
            q,
          ],
        );


      const receptions =
        result.rows;


      // =================================================
      // RESUMEN GENERAL
      // =================================================

      const summary = {

        total:
          receptions.length,

        open:
          receptions.filter(
            (item) =>
              item.status ===
              'open'
          ).length,

        closed:
          receptions.filter(
            (item) =>
              item.status ===
              'closed'
          ).length,

        in_slaughter:
          receptions.filter(
            (item) =>
              item.status ===
              'in_slaughter'
          ).length,

        completed:
          receptions.filter(
            (item) =>
              item.status ===
              'completed'
          ).length,

      };


      return res.json({

        success: true,

        summary,

        receptions,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ADMIN RECEPTIONS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo recepciones',
      });

    }

  };

// =====================================================
// 📋 DETALLE DE RECEPCIÓN - ADMIN FRIGOSI
// GET /slaughterhouse/admin/receptions/:id
//
// Devuelve:
// - cabecera de recepción
// - tropas vinculadas
// - lote(s) de compra
// - camiones recibidos
// - snapshots de guía/transporte
// - resumen de cantidades y peso vivo
// =====================================================

exports.getAdminReceptionById =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );


      const receptionId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          receptionId
        ) ||
        receptionId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de recepción inválido',
        });

      }


      // =================================================
      // CABECERA
      // =================================================

      const receptionResult =
        await pool.query(
          `
            SELECT

              sr.*,

              creator.name
                AS created_by_name,

              creator.full_name
                AS created_by_full_name

            FROM slaughterhouse_receptions sr

            LEFT JOIN users creator
              ON creator.id =
                sr.created_by

            WHERE
              sr.id = $1
              AND sr.company_id = $2

            LIMIT 1
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        receptionResult.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });

      }


      const reception =
        receptionResult.rows[0];


      // =================================================
      // TROPAS + LOTE DE COMPRA
      // =================================================

      const troopsResult =
        await pool.query(
          `
            SELECT

              st.id,
              st.purchase_lot_id,

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

              st.created_at,
              st.updated_at,


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

              spl.captador_person_id,
              captador.full_name
                AS captador_name,

              spl.commissioner_person_id,
              commissioner.full_name
                AS commissioner_name,

              spl.classification_id,

              spl.purchase_type,

              spl.expected_quantity
                AS lot_expected_quantity,

              spl.price_per_unit,

              spl.currency,

              spl.shrink_percent,

              spl.planned_date,

              spl.status
                AS purchase_lot_status

            FROM slaughterhouse_troops st

            JOIN slaughterhouse_purchase_lots spl
              ON spl.id =
                st.purchase_lot_id
              AND spl.company_id =
                st.company_id

            LEFT JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id

            LEFT JOIN slaughterhouse_people captador
              ON captador.id =
                spl.captador_person_id

            LEFT JOIN slaughterhouse_people commissioner
              ON commissioner.id =
                spl.commissioner_person_id

            WHERE
              st.reception_id = $1
              AND st.company_id = $2

            ORDER BY
              st.troop_number ASC NULLS LAST,
              st.id ASC
          `,
          [
            receptionId,
            companyId,
          ],
        );


      const troops =
        troopsResult.rows;


      // =================================================
      // CAMIONES RECEPCIONADOS
      //
      // Usamos principalmente los snapshots porque
      // representan exactamente lo recibido en Portería.
      //
      // También mostramos información actual de la guía
      // para trazabilidad.
      // =================================================

      const trucksResult =
        await pool.query(
          `
            SELECT

              srt.*,


              tg.status
                AS current_guide_status,

              tg.official_guide_number
                AS current_official_guide_number,

              tg.official_guide_photo_url
                AS current_official_guide_photo_url,

              tg.guide_image_url
                AS current_guide_image_url,

              tg.driver_name
                AS current_driver_name,

              tg.driver_ci
                AS current_driver_ci,


              tn.status
                AS transport_status,

              tn.trip_started_at,

              tn.delivered_at,

              tn.route_id,


              truck.plate
                AS current_plate,

              truck.brand
                AS current_truck_brand,

              truck.model
                AS current_truck_model,


              transporter.name
                AS transporter_name,

              transporter.full_name
                AS transporter_full_name

            FROM slaughterhouse_reception_trucks srt

            LEFT JOIN transport_guides tg
              ON tg.id =
                srt.transport_guide_id

            LEFT JOIN transport_negotiations tn
              ON tn.id =
                srt.transport_negotiation_id

            LEFT JOIN transporter_trucks truck
              ON truck.id =
                srt.truck_id

            LEFT JOIN users transporter
              ON transporter.id =
                srt.transporter_id

            WHERE
              srt.reception_id = $1

            ORDER BY
              srt.received_at ASC,
              srt.id ASC
          `,
          [
            receptionId,
          ],
        );


      const trucks =
        trucksResult.rows;


      // =================================================
      // RESUMEN
      // =================================================

      let guideQuantityTotal = 0;

      let receivedQuantityTotal = 0;

      let liveWeightKgTotal = 0;


      for (
        const truck of trucks
      ) {

        guideQuantityTotal +=
          Number(
            truck.guide_quantity || 0
          );


        receivedQuantityTotal +=
          Number(
            truck.received_quantity || 0
          );


        if (
          truck.live_weight_kg !==
            null &&
          truck.live_weight_kg !==
            undefined
        ) {

          liveWeightKgTotal +=
            Number(
              truck.live_weight_kg
            );

        }

      }


      // =================================================
      // LOTES DE COMPRA ÚNICOS
      //
      // Normalmente habrá uno.
      // Lo dejamos preparado para histórico / migraciones.
      // =================================================

      const purchaseLotsMap =
        new Map();


      for (
        const troop of troops
      ) {

        if (
          !purchaseLotsMap.has(
            troop.purchase_lot_id
          )
        ) {

          purchaseLotsMap.set(
            troop.purchase_lot_id,
            {

              id:
                troop.purchase_lot_id,

              lot_number:
                troop.lot_number,

              external_order_number:
                troop.external_order_number,

              seller_person_id:
                troop.seller_person_id,

              seller_name:
                troop.seller_name,

              seller_document_number:
                troop.seller_document_number,

              seller_phone:
                troop.seller_phone,

              estate_id:
                troop.estate_id,

              captador_person_id:
                troop.captador_person_id,

              captador_name:
                troop.captador_name,

              commissioner_person_id:
                troop.commissioner_person_id,

              commissioner_name:
                troop.commissioner_name,

              classification_id:
                troop.classification_id,

              purchase_type:
                troop.purchase_type,

              expected_quantity:
                troop.lot_expected_quantity,

              price_per_unit:
                troop.price_per_unit,

              currency:
                troop.currency,

              shrink_percent:
                troop.shrink_percent,

              planned_date:
                troop.planned_date,

              status:
                troop.purchase_lot_status,

            },
          );

        }

      }


      const purchaseLots =
        Array.from(
          purchaseLotsMap.values()
        );


      return res.json({

        success: true,

        reception,

        summary: {

          troops_count:
            troops.length,

          trucks_count:
            trucks.length,

          purchase_lots_count:
            purchaseLots.length,

          guide_quantity_total:
            guideQuantityTotal,

          received_quantity_total:
            receivedQuantityTotal,

          quantity_difference:
            receivedQuantityTotal -
            guideQuantityTotal,

          live_weight_kg_total:
            Number(
              liveWeightKgTotal.toFixed(
                2
              )
            ),

        },

        purchase_lots:
          purchaseLots,

        troops,

        trucks,

      });

    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE ADMIN RECEPTION DETAIL ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo detalle de recepción',
      });

    }

  };

// =====================================================
// 🔒 CERRAR RECEPCIÓN
// POST /slaughterhouse/admin/receptions/:id/close
//
// Reglas:
//
// - recepción debe estar OPEN
// - debe existir al menos una tropa recibida
// - debe existir al menos un camión recibido
// - todas las tropas activas del/los lote(s)
//   asociados deben haber llegado
// - todas las tropas recibidas deben tener
//   troop_number asignado
// - NO inicia faena
//
// Resultado:
//
// open → closed
// =====================================================

exports.closeAdminReception =
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


      const receptionId =
        Number(
          req.params.id
        );


      // =================================================
      // VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          receptionId
        ) ||
        receptionId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de recepción inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // BLOQUEAR RECEPCIÓN
      // =================================================

      const receptionResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_receptions

            WHERE
              id = $1
              AND company_id = $2

            FOR UPDATE
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        receptionResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });

      }


      const previous =
        receptionResult.rows[0];


      // =================================================
      // SOLO OPEN
      // =================================================

      if (
        previous.status !==
        'open'
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            `La recepción está en estado ${previous.status} y no puede cerrarse`,
        });

      }


      // =================================================
      // RESUMEN DE RECEPCIÓN
      // =================================================

      const summaryResult =
        await client.query(
          `
            SELECT

              (
                SELECT
                  COUNT(*)::int

                FROM slaughterhouse_troops st

                WHERE
                  st.reception_id = $1
                  AND st.company_id = $2
              )
                AS troops_count,


              (
                SELECT
                  COUNT(*)::int

                FROM slaughterhouse_reception_trucks srt

                WHERE
                  srt.reception_id = $1
              )
                AS trucks_count,


              (
                SELECT
                  COALESCE(
                    SUM(
                      st.received_quantity
                    ),
                    0
                  )::int

                FROM slaughterhouse_troops st

                WHERE
                  st.reception_id = $1
                  AND st.company_id = $2
              )
                AS received_quantity_total,


              (
                SELECT
                  COUNT(*)::int

                FROM slaughterhouse_troops st

                WHERE
                  st.reception_id = $1
                  AND st.company_id = $2

                  AND (
                    st.troop_number IS NULL
                    OR BTRIM(
                      st.troop_number
                    ) = ''
                  )
              )
                AS missing_troop_number_count
          `,
          [
            receptionId,
            companyId,
          ],
        );


      const summary =
        summaryResult.rows[0];


      const troopsCount =
        Number(
          summary.troops_count
        );


      const trucksCount =
        Number(
          summary.trucks_count
        );


      const receivedQuantityTotal =
        Number(
          summary.received_quantity_total
        );


      const missingTroopNumberCount =
        Number(
          summary.missing_troop_number_count
        );


      // =================================================
      // DEBE HABER TROPAS
      // =================================================

      if (
        troopsCount <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La recepción no tiene tropas vinculadas',
        });

      }


      // =================================================
      // DEBE HABER CAMIONES
      // =================================================

      if (
        trucksCount <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La recepción no tiene camiones recepcionados',
        });

      }


      // =================================================
      // CONTROL DE CONSISTENCIA
      //
      // En el flujo nuevo:
      // 1 tropa = 1 camión
      // =================================================

      if (
        troopsCount !==
        trucksCount
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'La recepción tiene inconsistencia entre tropas y camiones',

          troops_count:
            troopsCount,

          trucks_count:
            trucksCount,

        });

      }


      // =================================================
      // DEBE HABER GANADO RECIBIDO
      // =================================================

      if (
        receivedQuantityTotal <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'La recepción no tiene animales recibidos',
        });

      }


      // =================================================
      // TODA TROPA DEBE TENER NÚMERO DEFINITIVO
      // =================================================

      if (
        missingTroopNumberCount > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'Hay tropas recibidas sin número de tropa asignado',

          missing_troop_number_count:
            missingTroopNumberCount,

        });

      }


      // =================================================
      // BUSCAR TROPAS PENDIENTES DE LOS LOTES
      // ASOCIADOS A ESTA RECEPCIÓN
      //
      // Esto evita cerrar la recepción si todavía
      // viene otro camión del mismo lote.
      // =================================================

      const pendingResult =
        await client.query(
          `
            SELECT

              st.id,
              st.troop_number,
              st.purchase_lot_id,
              st.status,

              spl.lot_number

            FROM slaughterhouse_troops st

            JOIN slaughterhouse_purchase_lots spl
              ON spl.id =
                st.purchase_lot_id
              AND spl.company_id =
                st.company_id

            WHERE
              st.company_id = $2

              AND st.purchase_lot_id IN (

                SELECT DISTINCT
                  linked.purchase_lot_id

                FROM slaughterhouse_troops linked

                WHERE
                  linked.reception_id = $1
                  AND linked.company_id = $2

              )

              AND st.status <> 'cancelled'

              AND st.status NOT IN (
                'received',
                'in_slaughter',
                'completed'
              )

            ORDER BY
              st.purchase_lot_id ASC,
              st.id ASC
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        pendingResult.rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({

          error:
            'Todavía existen tropas pendientes de recepción para este lote',

          pending_troops:
            pendingResult.rows,

        });

      }


      // =================================================
      // CERRAR RECEPCIÓN
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_receptions

            SET
              status = 'closed',
              closed_at = NOW(),
              updated_at = NOW()

            WHERE
              id = $1
              AND company_id = $2
              AND status = 'open'

            RETURNING *
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        updatedResult.rows.length === 0
      ) {

        throw new Error(
          'No fue posible cerrar la recepción'
        );

      }


      const reception =
        updatedResult.rows[0];


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
            'reception',
            $3,
            'close',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            receptionId
          ),

          JSON.stringify(
            previous
          ),

          JSON.stringify({

            reception,

            summary: {

              troops_count:
                troopsCount,

              trucks_count:
                trucksCount,

              received_quantity_total:
                receivedQuantityTotal,

            },

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({

        success: true,

        message:
          'Recepción cerrada correctamente y lista para faena',

        reception,

        summary: {

          troops_count:
            troopsCount,

          trucks_count:
            trucksCount,

          received_quantity_total:
            receivedQuantityTotal,

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );


      console.error(
        'CLOSE SLAUGHTERHOUSE ADMIN RECEPTION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cerrando recepción',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 GENERAR BORRADOR DE PRELIQUIDACIÓN
// POST /slaughterhouse/admin/purchase-lots/:id/preliquidation
//
// La preliquidación se genera únicamente con
// pesajes CERTIFICADOS vigentes del lote.
//
// No modifica pesajes originales.
// Cada nueva preliquidación recibe una versión nueva.
// =====================================================

exports.generatePreliquidationDraft =
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


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 1. VALIDAR LOTE
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              id,
              status
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


      const lot =
        lotResult.rows[0];


      if (
        lot.status ===
        'cancelled'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'No se puede generar preliquidación de un lote cancelado',
        });

      }


      // =================================================
      // 2. VALIDAR QUE NO QUEDE FAENA PENDIENTE
      //
      // Si existen tropas, todas las tropas activas
      // deben estar completadas.
      //
      // Lotes antiguos sin tropas siguen siendo compatibles.
      // =================================================

      const troopsResult =
        await client.query(
          `
            SELECT

              COUNT(*) FILTER (
                WHERE
                  status <> 'cancelled'
              )::int
                AS active_troops,

              COUNT(*) FILTER (
                WHERE
                  status NOT IN (
                    'completed',
                    'cancelled'
                  )
              )::int
                AS pending_troops

            FROM slaughterhouse_troops
            WHERE
              company_id = $1
              AND purchase_lot_id = $2
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );


      const activeTroops =
        Number(
          troopsResult.rows[0]
            .active_troops || 0
        );

      const pendingTroops =
        Number(
          troopsResult.rows[0]
            .pending_troops || 0
        );


      if (
        activeTroops > 0 &&
        pendingTroops > 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La faena del lote todavía no está completada',
          active_troops:
            activeTroops,
          pending_troops:
            pendingTroops,
        });

      }


      // =================================================
      // 3. NO PERMITIR DOS VERSIONES ABIERTAS
      // =================================================

      const openResult =
        await client.query(
          `
            SELECT
              id,
              version,
              status
            FROM slaughterhouse_preliquidations
            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND status IN (
                'draft',
                'reviewed'
              )
            ORDER BY
              version DESC
            LIMIT 1
            FOR UPDATE
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );


      if (
        openResult.rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El lote ya tiene una preliquidación abierta',
          preliquidation:
            openResult.rows[0],
        });

      }


      // =================================================
      // 4. TOMAR SOLO PESAJES CERTIFICADOS VIGENTES
      //
      // Un pesaje rectificado ya no tiene status certified,
      // por lo que no participa nuevamente.
      // =================================================

      const sourceResult =
        await client.query(
          `
            SELECT

              COUNT(*)::int
                AS weighings_count,

              COALESCE(
                SUM(quantity),
                0
              )::int
                AS animals_count,

              COALESCE(
                SUM(gross_weight_kg),
                0
              )::numeric
                AS gross_weight_kg,

              COALESCE(
                SUM(shrink_weight_kg),
                0
              )::numeric
                AS shrink_weight_kg,

              COALESCE(
                SUM(net_weight_kg),
                0
              )::numeric
                AS net_weight_kg,

              COALESCE(
                SUM(total_amount),
                0
              )::numeric
                AS base_amount,

              COUNT(
                DISTINCT price_per_kg
              ) FILTER (
                WHERE
                  price_per_kg IS NOT NULL
              )::int
                AS distinct_prices,

              MIN(price_per_kg)
                AS single_price_per_kg,

              COUNT(*) FILTER (
                WHERE
                  gross_weight_kg IS NULL
                  OR shrink_weight_kg IS NULL
                  OR net_weight_kg IS NULL
                  OR price_per_kg IS NULL
                  OR total_amount IS NULL
              )::int
                AS incomplete_weighings

            FROM slaughterhouse_live_weighings
            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND status = 'certified'
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );


      const source =
        sourceResult.rows[0];


      const weighingsCount =
        Number(
          source.weighings_count || 0
        );


      if (
        weighingsCount === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El lote no tiene pesajes certificados para preliquidar',
        });

      }


      if (
        Number(
          source.incomplete_weighings || 0
        ) > 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Existen pesajes certificados con información financiera incompleta',
          incomplete_weighings:
            Number(
              source.incomplete_weighings
            ),
        });

      }


      const grossWeightKg =
        Number(
          source.gross_weight_kg
        );

      const shrinkWeightKg =
        Number(
          source.shrink_weight_kg
        );

      const netWeightKg =
        Number(
          source.net_weight_kg
        );

      const baseAmount =
        Number(
          source.base_amount
        );


      const shrinkPercent =
        grossWeightKg > 0
          ? (
              shrinkWeightKg /
              grossWeightKg
            ) * 100
          : 0;


      // Si todo el lote tiene el mismo precio,
      // lo conservamos en price_per_kg.
      //
      // Si existen diferentes precios certificados,
      // price_per_kg queda NULL y base_amount sigue siendo
      // la suma exacta de los documentos certificados.

      const pricePerKg =
        Number(
          source.distinct_prices
        ) === 1
          ? Number(
              source.single_price_per_kg
            )
          : null;


      // =================================================
      // 5. NUEVA VERSIÓN
      // =================================================

      const versionResult =
        await client.query(
          `
            SELECT
              COALESCE(
                MAX(version),
                0
              ) + 1
                AS next_version
            FROM slaughterhouse_preliquidations
            WHERE
              purchase_lot_id = $1
          `,
          [
            purchaseLotId,
          ],
        );


      const version =
        Number(
          versionResult.rows[0]
            .next_version
        );


      // =================================================
      // 6. CREAR PRELIQUIDACIÓN
      // =================================================

      const insertResult =
        await client.query(
          `
            INSERT INTO slaughterhouse_preliquidations (
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
              generated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,0,
              0,$9,'draft',$10,NOW()
            )
            RETURNING *
          `,
          [
            companyId,
            purchaseLotId,
            version,
            grossWeightKg,
            shrinkPercent,
            shrinkWeightKg,
            netWeightKg,
            pricePerKg,
            baseAmount,
            userId,
          ],
        );


      const preliquidation =
        insertResult.rows[0];


      // =================================================
      // 7. AUDITORÍA
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
            'preliquidation',
            $3,
            'generate_draft',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            preliquidation.id
          ),
          JSON.stringify({
            preliquidation,
            source: {
              purchase_lot_id:
                purchaseLotId,
              weighings_count:
                weighingsCount,
              animals_count:
                Number(
                  source.animals_count || 0
                ),
              distinct_prices:
                Number(
                  source.distinct_prices || 0
                ),
            },
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Preliquidación generada correctamente',

        preliquidation,

        source_summary: {
          certified_weighings:
            weighingsCount,

          animals_count:
            Number(
              source.animals_count || 0
            ),

          gross_weight_kg:
            grossWeightKg,

          shrink_weight_kg:
            shrinkWeightKg,

          net_weight_kg:
            netWeightKg,

          distinct_prices:
            Number(
              source.distinct_prices || 0
            ),

          mixed_prices:
            Number(
              source.distinct_prices || 0
            ) > 1,
        },
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'GENERATE PRELIQUIDATION DRAFT ERROR:',
        error
      );


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe esa versión de preliquidación',
        });

      }


      return res.status(500).json({
        error:
          'Error generando preliquidación',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 💰 DETALLE DE PRELIQUIDACIÓN
// GET /slaughterhouse/admin/preliquidations/:id
// =====================================================

exports.getPreliquidationById =
  async (req, res) => {

    try {

      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );

      const preliquidationId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      // =================================================
      // 1. PRELIQUIDACIÓN
      // =================================================

      const result =
        await pool.query(
          `
            SELECT
              sp.*
            FROM slaughterhouse_preliquidations sp
            WHERE
              sp.id = $1
              AND sp.company_id = $2
            LIMIT 1
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        result.rows[0];


      // =================================================
      // 2. AJUSTES
      // =================================================

      const adjustmentsResult =
        await pool.query(
          `
            SELECT
              id,
              preliquidation_id,
              code,
              description,
              adjustment_type,
              calculation_type,
              rate,
              quantity,
              amount,
              created_at
            FROM slaughterhouse_preliquidation_adjustments
            WHERE
              preliquidation_id = $1
            ORDER BY
              id ASC
          `,
          [
            preliquidationId,
          ],
        );


      const adjustments =
        adjustmentsResult.rows;


      // =================================================
      // 3. RESPUESTA
      // =================================================

      return res.json({
        success: true,

        preliquidation,

        adjustments,

        adjustments_count:
          adjustments.length,
      });


    } catch (error) {

      console.error(
        'GET PRELIQUIDATION BY ID ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo preliquidación',
      });

    }

  };
  
// =====================================================
// 💰 AGREGAR AJUSTE A PRELIQUIDACIÓN
// POST /slaughterhouse/admin/preliquidations/:id/adjustments
//
// Tipos:
// - discount
// - addition
//
// Cálculos:
// - fixed
// - percent
// - per_head
// - per_kg
//
// El servidor calcula amount.
// No confía en un amount calculado por el cliente.
// =====================================================

exports.addPreliquidationAdjustment =
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

      const preliquidationId =
        Number(
          req.params.id
        );


      const code =
        req.body.code
          ?.toString()
          .trim() ||
        null;


      const description =
        req.body.description
          ?.toString()
          .trim() ||
        null;


      const adjustmentType =
        req.body.adjustment_type
          ?.toString()
          .trim()
          .toLowerCase();


      const calculationType =
        req.body.calculation_type
          ?.toString()
          .trim()
          .toLowerCase();


      let rate =
        req.body.rate !== undefined &&
        req.body.rate !== null &&
        req.body.rate !== ''
          ? Number(
              req.body.rate
            )
          : null;


      let quantity =
        req.body.quantity !== undefined &&
        req.body.quantity !== null &&
        req.body.quantity !== ''
          ? Number(
              req.body.quantity
            )
          : null;


      const fixedAmount =
        req.body.amount !== undefined &&
        req.body.amount !== null &&
        req.body.amount !== ''
          ? Number(
              req.body.amount
            )
          : null;


      // =================================================
      // 1. VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      if (!description) {

        return res.status(400).json({
          error:
            'La descripción del ajuste es obligatoria',
        });

      }


      if (
        ![
          'discount',
          'addition',
        ].includes(
          adjustmentType
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de ajuste inválido',
        });

      }


      if (
        ![
          'fixed',
          'percent',
          'per_head',
          'per_kg',
        ].includes(
          calculationType
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de cálculo inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const preliqResult =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        preliqResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        preliqResult.rows[0];


      if (
        preliquidation.status !==
        'draft'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Solo una preliquidación en borrador puede modificarse',
          status:
            preliquidation.status,
        });

      }


      const baseAmount =
        Number(
          preliquidation.base_amount || 0
        );

      const netWeightKg =
        Number(
          preliquidation.net_weight_kg || 0
        );


      // =================================================
      // 3. CALCULAR CANTIDAD BASE SEGÚN TIPO
      // =================================================

      let amount = 0;


      if (
        calculationType ===
        'fixed'
      ) {

        if (
          !Number.isFinite(
            fixedAmount
          ) ||
          fixedAmount <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'El monto fijo debe ser mayor a cero',
          });

        }


        rate = null;
        quantity = null;
        amount =
          fixedAmount;

      }


      if (
        calculationType ===
        'percent'
      ) {

        if (
          !Number.isFinite(
            rate
          ) ||
          rate <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'El porcentaje debe ser mayor a cero',
          });

        }


        quantity =
          baseAmount;

        amount =
          (
            baseAmount *
            rate
          ) / 100;

      }


      if (
        calculationType ===
        'per_kg'
      ) {

        if (
          !Number.isFinite(
            rate
          ) ||
          rate <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'La tarifa por kilogramo debe ser mayor a cero',
          });

        }


        if (
          quantity === null
        ) {

          quantity =
            netWeightKg;

        }


        if (
          !Number.isFinite(
            quantity
          ) ||
          quantity <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'La cantidad de kilogramos debe ser mayor a cero',
          });

        }


        amount =
          rate *
          quantity;

      }


      if (
        calculationType ===
        'per_head'
      ) {

        if (
          !Number.isFinite(
            rate
          ) ||
          rate <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'La tarifa por cabeza debe ser mayor a cero',
          });

        }


        // Si el usuario no indica cantidad,
        // utilizamos la cantidad total de animales
        // de los pesajes certificados vigentes.

        if (
          quantity === null
        ) {

          const animalsResult =
            await client.query(
              `
                SELECT
                  COALESCE(
                    SUM(quantity),
                    0
                  )::numeric
                    AS animals_count
                FROM slaughterhouse_live_weighings
                WHERE
                  company_id = $1
                  AND purchase_lot_id = $2
                  AND status = 'certified'
              `,
              [
                companyId,
                preliquidation
                  .purchase_lot_id,
              ],
            );


          quantity =
            Number(
              animalsResult.rows[0]
                .animals_count || 0
            );

        }


        if (
          !Number.isFinite(
            quantity
          ) ||
          quantity <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'La cantidad de animales debe ser mayor a cero',
          });

        }


        amount =
          rate *
          quantity;

      }


      // =================================================
      // 4. REDONDEO MONETARIO
      // =================================================

      amount =
        Math.round(
          (
            amount +
            Number.EPSILON
          ) *
          100
        ) / 100;


      // =================================================
      // 5. INSERTAR AJUSTE
      // =================================================

      const adjustmentResult =
        await client.query(
          `
            INSERT INTO slaughterhouse_preliquidation_adjustments (
              preliquidation_id,
              code,
              description,
              adjustment_type,
              calculation_type,
              rate,
              quantity,
              amount
            )
            VALUES (
              $1,$2,$3,$4,
              $5,$6,$7,$8
            )
            RETURNING *
          `,
          [
            preliquidationId,
            code,
            description,
            adjustmentType,
            calculationType,
            rate,
            quantity,
            amount,
          ],
        );


      const adjustment =
        adjustmentResult.rows[0];


      // =================================================
      // 6. RECALCULAR TOTALES DESDE LA TABLA DE AJUSTES
      // =================================================

      const totalsResult =
        await client.query(
          `
            SELECT

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type =
                    'discount'
                ),
                0
              )::numeric
                AS discounts_total,

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type =
                    'addition'
                ),
                0
              )::numeric
                AS additions_total

            FROM slaughterhouse_preliquidation_adjustments
            WHERE
              preliquidation_id = $1
          `,
          [
            preliquidationId,
          ],
        );


      const discountsTotal =
        Number(
          totalsResult.rows[0]
            .discounts_total || 0
        );

      const additionsTotal =
        Number(
          totalsResult.rows[0]
            .additions_total || 0
        );


      const totalPayable =
        Math.round(
          (
            baseAmount -
            discountsTotal +
            additionsTotal +
            Number.EPSILON
          ) *
          100
        ) / 100;


      // =================================================
      // 7. ACTUALIZAR PRELIQUIDACIÓN
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              discounts_total = $1,
              additions_total = $2,
              total_payable = $3,
              updated_at = NOW()
            WHERE
              id = $4
              AND company_id = $5
            RETURNING *
          `,
          [
            discountsTotal,
            additionsTotal,
            totalPayable,
            preliquidationId,
            companyId,
          ],
        );


      const updatedPreliquidation =
        updatedResult.rows[0];


      // =================================================
      // 8. AUDITORÍA
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
            'preliquidation',
            $3,
            'add_adjustment',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            preliquidationId
          ),
          JSON.stringify({
            adjustment,
            totals: {
              discounts_total:
                discountsTotal,
              additions_total:
                additionsTotal,
              total_payable:
                totalPayable,
            },
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.status(201).json({
        success: true,

        message:
          'Ajuste agregado correctamente',

        adjustment,

        preliquidation:
          updatedPreliquidation,
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'ADD PRELIQUIDATION ADJUSTMENT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error agregando ajuste a la preliquidación',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 ELIMINAR AJUSTE DE PRELIQUIDACIÓN
// DELETE /slaughterhouse/admin/preliquidations/:id/adjustments/:adjustmentId
//
// Solo permitido mientras la preliquidación esté draft.
// Al eliminar recalcula todos los totales.
// =====================================================

exports.deletePreliquidationAdjustment =
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

      const preliquidationId =
        Number(
          req.params.id
        );

      const adjustmentId =
        Number(
          req.params.adjustmentId
        );


      // =================================================
      // 1. VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      if (
        !Number.isInteger(
          adjustmentId
        ) ||
        adjustmentId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de ajuste inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const preliqResult =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        preliqResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        preliqResult.rows[0];


      if (
        preliquidation.status !==
        'draft'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Solo una preliquidación en borrador puede modificarse',
          status:
            preliquidation.status,
        });

      }


      // =================================================
      // 3. ELIMINAR AJUSTE
      //
      // El WHERE por preliquidation_id evita borrar
      // accidentalmente un ajuste de otro documento.
      // =================================================

      const deleteResult =
        await client.query(
          `
            DELETE FROM slaughterhouse_preliquidation_adjustments
            WHERE
              id = $1
              AND preliquidation_id = $2
            RETURNING *
          `,
          [
            adjustmentId,
            preliquidationId,
          ],
        );


      if (
        deleteResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Ajuste no encontrado',
        });

      }


      const deletedAdjustment =
        deleteResult.rows[0];


      // =================================================
      // 4. RECALCULAR TOTALES
      // =================================================

      const totalsResult =
        await client.query(
          `
            SELECT

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type =
                    'discount'
                ),
                0
              )::numeric
                AS discounts_total,

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type =
                    'addition'
                ),
                0
              )::numeric
                AS additions_total

            FROM slaughterhouse_preliquidation_adjustments
            WHERE
              preliquidation_id = $1
          `,
          [
            preliquidationId,
          ],
        );


      const discountsTotal =
        Number(
          totalsResult.rows[0]
            .discounts_total || 0
        );

      const additionsTotal =
        Number(
          totalsResult.rows[0]
            .additions_total || 0
        );

      const baseAmount =
        Number(
          preliquidation.base_amount || 0
        );


      const totalPayable =
        Math.round(
          (
            baseAmount -
            discountsTotal +
            additionsTotal +
            Number.EPSILON
          ) *
          100
        ) / 100;


      // =================================================
      // 5. ACTUALIZAR PRELIQUIDACIÓN
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              discounts_total = $1,
              additions_total = $2,
              total_payable = $3,
              updated_at = NOW()
            WHERE
              id = $4
              AND company_id = $5
            RETURNING *
          `,
          [
            discountsTotal,
            additionsTotal,
            totalPayable,
            preliquidationId,
            companyId,
          ],
        );


      const updatedPreliquidation =
        updatedResult.rows[0];


      // =================================================
      // 6. AUDITORÍA
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
            'preliquidation',
            $3,
            'delete_adjustment',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            preliquidationId
          ),
          JSON.stringify({
            deleted_adjustment:
              deletedAdjustment,

            totals: {
              discounts_total:
                discountsTotal,

              additions_total:
                additionsTotal,

              total_payable:
                totalPayable,
            },
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Ajuste eliminado correctamente',

        deleted_adjustment:
          deletedAdjustment,

        preliquidation:
          updatedPreliquidation,
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'DELETE PRELIQUIDATION ADJUSTMENT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error eliminando ajuste de la preliquidación',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 MARCAR PRELIQUIDACIÓN COMO REVISADA
// PATCH /slaughterhouse/admin/preliquidations/:id/review
//
// Flujo:
// draft -> reviewed
//
// Una vez revisada ya no se pueden modificar ajustes.
// =====================================================

exports.reviewPreliquidation =
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

      const preliquidationId =
        Number(
          req.params.id
        );


      // =================================================
      // 1. VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const result =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        result.rows[0];


      if (
        preliquidation.status !==
        'draft'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Solo una preliquidación en borrador puede pasar a revisión',
          status:
            preliquidation.status,
        });

      }


      // =================================================
      // 3. VALIDAR IMPORTES
      // =================================================

      const baseAmount =
        Number(
          preliquidation.base_amount
        );

      const discountsTotal =
        Number(
          preliquidation.discounts_total || 0
        );

      const additionsTotal =
        Number(
          preliquidation.additions_total || 0
        );

      const totalPayable =
        Number(
          preliquidation.total_payable
        );


      if (
        !Number.isFinite(
          baseAmount
        ) ||
        baseAmount < 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La preliquidación no tiene un importe base válido',
        });

      }


      if (
        !Number.isFinite(
          totalPayable
        ) ||
        totalPayable < 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El total a pagar de la preliquidación no es válido',
        });

      }


      // =================================================
      // 4. REVALIDAR TOTAL CONTRA AJUSTES
      // =================================================

      const totalsResult =
        await client.query(
          `
            SELECT

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type = 'discount'
                ),
                0
              )::numeric
                AS discounts_total,

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type = 'addition'
                ),
                0
              )::numeric
                AS additions_total

            FROM slaughterhouse_preliquidation_adjustments
            WHERE
              preliquidation_id = $1
          `,
          [
            preliquidationId,
          ],
        );


      const realDiscountsTotal =
        Number(
          totalsResult.rows[0]
            .discounts_total || 0
        );

      const realAdditionsTotal =
        Number(
          totalsResult.rows[0]
            .additions_total || 0
        );


      const realTotalPayable =
        Math.round(
          (
            baseAmount -
            realDiscountsTotal +
            realAdditionsTotal +
            Number.EPSILON
          ) *
          100
        ) / 100;


      if (
        realTotalPayable < 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Los descuentos superan el importe disponible de la preliquidación',
        });

      }


      // =================================================
      // 5. PASAR A REVIEWED
      //
      // Aprovechamos para dejar los totales nuevamente
      // sincronizados con la tabla de ajustes.
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              discounts_total = $1,
              additions_total = $2,
              total_payable = $3,
              status = 'reviewed',
              updated_at = NOW()
            WHERE
              id = $4
              AND company_id = $5
            RETURNING *
          `,
          [
            realDiscountsTotal,
            realAdditionsTotal,
            realTotalPayable,
            preliquidationId,
            companyId,
          ],
        );


      const updatedPreliquidation =
        updatedResult.rows[0];


      // =================================================
      // 6. AUDITORÍA
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
            'preliquidation',
            $3,
            'review',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            preliquidationId
          ),
          JSON.stringify({
            status:
              preliquidation.status,

            discounts_total:
              discountsTotal,

            additions_total:
              additionsTotal,

            total_payable:
              totalPayable,
          }),
          JSON.stringify({
            status:
              updatedPreliquidation.status,

            discounts_total:
              realDiscountsTotal,

            additions_total:
              realAdditionsTotal,

            total_payable:
              realTotalPayable,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Preliquidación marcada como revisada',

        preliquidation:
          updatedPreliquidation,
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'REVIEW PRELIQUIDATION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error revisando la preliquidación',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 💰 APROBAR PRELIQUIDACIÓN
// PATCH /slaughterhouse/admin/preliquidations/:id/approve
//
// Flujo:
// reviewed -> approved
//
// Antes de aprobar:
// - revalida pesajes certificados vigentes
// - revalida ajustes
// - recalcula total
// - registra aprobador y fecha
// =====================================================

exports.approvePreliquidation =
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

      const preliquidationId =
        Number(
          req.params.id
        );


      // =================================================
      // 1. VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const preliqResult =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        preliqResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        preliqResult.rows[0];


      if (
        preliquidation.status !==
        'reviewed'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Solo una preliquidación revisada puede aprobarse',
          status:
            preliquidation.status,
        });

      }


      // =================================================
      // 3. REVALIDAR FUENTE CERTIFICADA
      // =================================================

      const sourceResult =
        await client.query(
          `
            SELECT

              COUNT(*)::int
                AS weighings_count,

              COALESCE(
                SUM(gross_weight_kg),
                0
              )::numeric
                AS gross_weight_kg,

              COALESCE(
                SUM(shrink_weight_kg),
                0
              )::numeric
                AS shrink_weight_kg,

              COALESCE(
                SUM(net_weight_kg),
                0
              )::numeric
                AS net_weight_kg,

              COALESCE(
                SUM(total_amount),
                0
              )::numeric
                AS base_amount,

              COUNT(*) FILTER (
                WHERE
                  gross_weight_kg IS NULL
                  OR shrink_weight_kg IS NULL
                  OR net_weight_kg IS NULL
                  OR price_per_kg IS NULL
                  OR total_amount IS NULL
              )::int
                AS incomplete_weighings

            FROM slaughterhouse_live_weighings
            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND status = 'certified'
          `,
          [
            companyId,
            preliquidation
              .purchase_lot_id,
          ],
        );


      const source =
        sourceResult.rows[0];


      if (
        Number(
          source.weighings_count || 0
        ) === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El lote ya no tiene pesajes certificados vigentes',
        });

      }


      if (
        Number(
          source.incomplete_weighings || 0
        ) > 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Existen pesajes certificados vigentes con información incompleta',
        });

      }


      const sourceGross =
        Number(
          source.gross_weight_kg || 0
        );

      const sourceShrink =
        Number(
          source.shrink_weight_kg || 0
        );

      const sourceNet =
        Number(
          source.net_weight_kg || 0
        );

      const sourceBase =
        Number(
          source.base_amount || 0
        );


      const preliqGross =
        Number(
          preliquidation
            .gross_weight_kg || 0
        );

      const preliqShrink =
        Number(
          preliquidation
            .shrink_weight_kg || 0
        );

      const preliqNet =
        Number(
          preliquidation
            .net_weight_kg || 0
        );

      const preliqBase =
        Number(
          preliquidation
            .base_amount || 0
        );


      const weightsChanged =
        Math.abs(
          sourceGross -
          preliqGross
        ) > 0.001
        ||
        Math.abs(
          sourceShrink -
          preliqShrink
        ) > 0.001
        ||
        Math.abs(
          sourceNet -
          preliqNet
        ) > 0.001;


      const amountChanged =
        Math.abs(
          sourceBase -
          preliqBase
        ) > 0.01;


      if (
        weightsChanged ||
        amountChanged
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Los pesajes certificados del lote cambiaron después de generar la preliquidación',
          requires_new_version:
            true,
        });

      }


      // =================================================
      // 4. RECALCULAR AJUSTES
      // =================================================

      const totalsResult =
        await client.query(
          `
            SELECT

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type = 'discount'
                ),
                0
              )::numeric
                AS discounts_total,

              COALESCE(
                SUM(amount) FILTER (
                  WHERE
                    adjustment_type = 'addition'
                ),
                0
              )::numeric
                AS additions_total

            FROM slaughterhouse_preliquidation_adjustments
            WHERE
              preliquidation_id = $1
          `,
          [
            preliquidationId,
          ],
        );


      const discountsTotal =
        Number(
          totalsResult.rows[0]
            .discounts_total || 0
        );

      const additionsTotal =
        Number(
          totalsResult.rows[0]
            .additions_total || 0
        );


      const totalPayable =
        Math.round(
          (
            preliqBase -
            discountsTotal +
            additionsTotal +
            Number.EPSILON
          ) *
          100
        ) / 100;


      if (
        totalPayable < 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Los descuentos superan el importe disponible de la preliquidación',
        });

      }


      // =================================================
      // 5. APROBAR
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              discounts_total = $1,
              additions_total = $2,
              total_payable = $3,
              status = 'approved',
              approved_by = $4,
              approved_at = NOW(),
              updated_at = NOW()
            WHERE
              id = $5
              AND company_id = $6
            RETURNING *
          `,
          [
            discountsTotal,
            additionsTotal,
            totalPayable,
            userId,
            preliquidationId,
            companyId,
          ],
        );


      const approvedPreliquidation =
        updatedResult.rows[0];


      // =================================================
      // 6. AUDITORÍA
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
            'preliquidation',
            $3,
            'approve',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            preliquidationId
          ),
          JSON.stringify({
            status:
              preliquidation.status,

            approved_by:
              preliquidation.approved_by,

            approved_at:
              preliquidation.approved_at,

            total_payable:
              preliquidation.total_payable,
          }),
          JSON.stringify({
            status:
              approvedPreliquidation.status,

            approved_by:
              approvedPreliquidation.approved_by,

            approved_at:
              approvedPreliquidation.approved_at,

            total_payable:
              approvedPreliquidation.total_payable,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Preliquidación aprobada correctamente',

        preliquidation:
          approvedPreliquidation,
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'APPROVE PRELIQUIDATION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error aprobando la preliquidación',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 CANCELAR PRELIQUIDACIÓN
// PATCH /slaughterhouse/admin/preliquidations/:id/cancel
//
// Permitido:
// draft    -> cancelled
// reviewed -> cancelled
//
// approved/exported NO se cancelan desde manage.
// =====================================================

exports.cancelPreliquidation =
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

      const preliquidationId =
        Number(
          req.params.id
        );

      const reason =
        req.body.reason
          ?.toString()
          .trim() ||
        null;


      // =================================================
      // 1. VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      if (!reason) {

        return res.status(400).json({
          error:
            'El motivo de cancelación es obligatorio',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const result =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        result.rows[0];


      // =================================================
      // 3. SOLO VERSIONES TODAVÍA NO APROBADAS
      // =================================================

      if (
        ![
          'draft',
          'reviewed',
        ].includes(
          preliquidation.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Esta preliquidación ya no puede cancelarse desde administración',
          status:
            preliquidation.status,
        });

      }


      // =================================================
      // 4. CANCELAR
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              status = 'cancelled',
              updated_at = NOW()
            WHERE
              id = $1
              AND company_id = $2
            RETURNING *
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      const cancelledPreliquidation =
        updatedResult.rows[0];


      // =================================================
      // 5. AUDITORÍA
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
            'preliquidation',
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
            preliquidationId
          ),
          JSON.stringify({
            status:
              preliquidation.status,
          }),
          JSON.stringify({
            status:
              'cancelled',

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
          'Preliquidación cancelada correctamente',

        reason,

        preliquidation:
          cancelledPreliquidation,
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'CANCEL PRELIQUIDATION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cancelando la preliquidación',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 LISTAR PRELIQUIDACIONES DE UN LOTE
// GET /slaughterhouse/admin/purchase-lots/:id/preliquidations
//
// Devuelve todas las versiones del lote.
// Incluye cantidad de ajustes por versión.
// =====================================================

exports.getPurchaseLotPreliquidations =
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
      // 1. VALIDAR ID
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
      // 2. VERIFICAR QUE EL LOTE SEA DE LA EMPRESA
      // =================================================

      const lotResult =
        await pool.query(
          `
            SELECT
              id,
              lot_number,
              status
            FROM slaughterhouse_purchase_lots
            WHERE
              id = $1
              AND company_id = $2
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
            'Lote no encontrado',
        });

      }


      const lot =
        lotResult.rows[0];


      // =================================================
      // 3. OBTENER TODAS LAS VERSIONES
      // =================================================

      const result =
        await pool.query(
          `
            SELECT

              p.*,

              (
                SELECT
                  COUNT(*)::int
                FROM slaughterhouse_preliquidation_adjustments a
                WHERE
                  a.preliquidation_id = p.id
              )
                AS adjustments_count

            FROM slaughterhouse_preliquidations p

            WHERE
              p.company_id = $1
              AND p.purchase_lot_id = $2

            ORDER BY
              p.version DESC,
              p.id DESC
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );


      // =================================================
      // 4. RESPUESTA
      // =================================================

      return res.json({
        success: true,

        lot,

        count:
          result.rows.length,

        preliquidations:
          result.rows,
      });


    } catch (error) {

      console.error(
        'GET PURCHASE LOT PRELIQUIDATIONS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo preliquidaciones del lote',
      });

    }

  };

// =====================================================
// 💰 MARCAR PRELIQUIDACIÓN COMO EXPORTADA
// PATCH /slaughterhouse/admin/preliquidations/:id/export
//
// Flujo:
// approved -> exported
//
// Solo una preliquidación aprobada puede exportarse.
// =====================================================

exports.exportPreliquidation =
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

      const preliquidationId =
        Number(
          req.params.id
        );


      // =================================================
      // 1. VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const result =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        result.rows[0];


      // =================================================
      // 3. SOLO APPROVED -> EXPORTED
      // =================================================

      if (
        preliquidation.status !==
        'approved'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Solo una preliquidación aprobada puede marcarse como exportada',

          status:
            preliquidation.status,
        });

      }


      // =================================================
      // 4. MARCAR EXPORTACIÓN
      // =================================================

      const updatedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              status = 'exported',
              exported_at = NOW(),
              updated_at = NOW()
            WHERE
              id = $1
              AND company_id = $2
            RETURNING *
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      const exportedPreliquidation =
        updatedResult.rows[0];


      // =================================================
      // 5. AUDITORÍA
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
            'preliquidation',
            $3,
            'export',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            preliquidationId
          ),

          JSON.stringify({
            status:
              preliquidation.status,

            exported_at:
              preliquidation.exported_at,
          }),

          JSON.stringify({
            status:
              exportedPreliquidation.status,

            exported_at:
              exportedPreliquidation.exported_at,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Preliquidación marcada como exportada',

        preliquidation:
          exportedPreliquidation,
      });


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'EXPORT PRELIQUIDATION ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error marcando la preliquidación como exportada',
      });

    } finally {

      client.release();

    }

  };
  
// =====================================================
// 💰 EXPORTAR PRELIQUIDACIÓN A CSV
// POST /slaughterhouse/admin/preliquidations/:id/export-csv
//
// Permitido:
// approved -> exported
// exported -> permite volver a descargar
//
// El archivo contiene:
// - resumen de la preliquidación
// - ajustes individuales
//
// Formato plano para facilitar importación a ERP.
// =====================================================

exports.exportPreliquidationCsv =
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

      const preliquidationId =
        Number(
          req.params.id
        );


      // =================================================
      // 1. VALIDAR ID
      // =================================================

      if (
        !Number.isInteger(
          preliquidationId
        ) ||
        preliquidationId <= 0
      ) {

        return res.status(400).json({
          error:
            'ID de preliquidación inválido',
        });

      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // 2. OBTENER Y BLOQUEAR PRELIQUIDACIÓN
      // =================================================

      const preliqResult =
        await client.query(
          `
            SELECT
              *
            FROM slaughterhouse_preliquidations
            WHERE
              id = $1
              AND company_id = $2
            FOR UPDATE
          `,
          [
            preliquidationId,
            companyId,
          ],
        );


      if (
        preliqResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Preliquidación no encontrada',
        });

      }


      const preliquidation =
        preliqResult.rows[0];


      // =================================================
      // 3. SOLO APPROVED / EXPORTED
      // =================================================

      if (
        ![
          'approved',
          'exported',
        ].includes(
          preliquidation.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Solo una preliquidación aprobada puede exportarse',

          status:
            preliquidation.status,
        });

      }


      // =================================================
      // 4. OBTENER AJUSTES
      // =================================================

      const adjustmentsResult =
        await client.query(
          `
            SELECT
              id,
              code,
              description,
              adjustment_type,
              calculation_type,
              rate,
              quantity,
              amount
            FROM slaughterhouse_preliquidation_adjustments
            WHERE
              preliquidation_id = $1
            ORDER BY
              id ASC
          `,
          [
            preliquidationId,
          ],
        );


      const adjustments =
        adjustmentsResult.rows;

        const csvExportedAt =
        preliquidation.exported_at ||
        new Date().toISOString();

      // =================================================
      // 5. ESCAPE CSV
      // =================================================

      const csvValue =
        (value) => {

          if (
            value === null ||
            value === undefined
          ) {
            return '""';
          }

          const text =
            String(value)
              .replace(
                /"/g,
                '""'
              );

          return `"${text}"`;
        };


      // =================================================
      // 6. COLUMNAS
      //
      // CSV plano:
      // una fila SUMMARY +
      // una fila por cada ADJUSTMENT.
      // =================================================

      const columns = [

        'section',

        'preliquidation_id',

        'purchase_lot_id',

        'version',

        'status',

        'adjustment_id',

        'code',

        'description',

        'adjustment_type',

        'calculation_type',

        'rate',

        'quantity',

        'amount',

        'gross_weight_kg',

        'shrink_percent',

        'shrink_weight_kg',

        'net_weight_kg',

        'price_per_kg',

        'base_amount',

        'discounts_total',

        'additions_total',

        'total_payable',

        'approved_at',

        'exported_at',

      ];


      const lines = [];


      lines.push(
        columns
          .map(csvValue)
          .join(';')
      );


      // =================================================
      // 7. FILA RESUMEN
      // =================================================

      const summaryRow = {

        section:
          'SUMMARY',

        preliquidation_id:
          preliquidation.id,

        purchase_lot_id:
          preliquidation.purchase_lot_id,

        version:
          preliquidation.version,

        status:
          'exported',

        adjustment_id:
          null,

        code:
          null,

        description:
          'Resumen preliquidación',

        adjustment_type:
          null,

        calculation_type:
          null,

        rate:
          null,

        quantity:
          null,

        amount:
          preliquidation.total_payable,

        gross_weight_kg:
          preliquidation.gross_weight_kg,

        shrink_percent:
          preliquidation.shrink_percent,

        shrink_weight_kg:
          preliquidation.shrink_weight_kg,

        net_weight_kg:
          preliquidation.net_weight_kg,

        price_per_kg:
          preliquidation.price_per_kg,

        base_amount:
          preliquidation.base_amount,

        discounts_total:
          preliquidation.discounts_total,

        additions_total:
          preliquidation.additions_total,

        total_payable:
          preliquidation.total_payable,

        approved_at:
          preliquidation.approved_at,

        exported_at:
        csvExportedAt,

      };


      lines.push(
        columns
          .map(
            (column) =>
              csvValue(
                summaryRow[column]
              )
          )
          .join(';')
      );


      // =================================================
      // 8. FILAS DE AJUSTES
      // =================================================

      for (
        const adjustment
        of adjustments
      ) {

        const row = {

          section:
            'ADJUSTMENT',

          preliquidation_id:
            preliquidation.id,

          purchase_lot_id:
            preliquidation.purchase_lot_id,

          version:
            preliquidation.version,

          status:
            'exported',

          adjustment_id:
            adjustment.id,

          code:
            adjustment.code,

          description:
            adjustment.description,

          adjustment_type:
            adjustment.adjustment_type,

          calculation_type:
            adjustment.calculation_type,

          rate:
            adjustment.rate,

          quantity:
            adjustment.quantity,

          amount:
            adjustment.amount,

          gross_weight_kg:
            null,

          shrink_percent:
            null,

          shrink_weight_kg:
            null,

          net_weight_kg:
            null,

          price_per_kg:
            null,

          base_amount:
            null,

          discounts_total:
            null,

          additions_total:
            null,

          total_payable:
            null,

          approved_at:
            preliquidation.approved_at,

            exported_at:
            csvExportedAt,

        };


        lines.push(
          columns
            .map(
              (column) =>
                csvValue(
                  row[column]
                )
            )
            .join(';')
        );

      }


      // =================================================
      // 9. MARCAR COMO EXPORTED
      //
      // Si ya estaba exportada:
      // conserva exported_at original.
      // =================================================

      const exportedResult =
        await client.query(
          `
            UPDATE slaughterhouse_preliquidations
            SET
              status = 'exported',
                exported_at = COALESCE(
                exported_at,
                $3::timestamptz
                    AT TIME ZONE 'America/La_Paz'
                ),
              updated_at = NOW()
            WHERE
              id = $1
              AND company_id = $2
            RETURNING *
          `,
            [
            preliquidationId,
            companyId,
            csvExportedAt,
            ],
        );


      const exportedPreliquidation =
        exportedResult.rows[0];


      // =================================================
      // 10. AUDITORÍA
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
            'preliquidation',
            $3,
            'export_csv',
            $4::jsonb
          )
        `,
        [
          companyId,

          userId,

          String(
            preliquidationId
          ),

          JSON.stringify({

            version:
              exportedPreliquidation.version,

            purchase_lot_id:
              exportedPreliquidation.purchase_lot_id,

            adjustments_count:
              adjustments.length,

            exported_at:
              exportedPreliquidation.exported_at,

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      // =================================================
      // 11. CONSTRUIR ARCHIVO
      // =================================================

      const csv =
        '\uFEFF' +
        lines.join(
          '\r\n'
        ) +
        '\r\n';


      const filename =
        `preliquidacion_lote_${preliquidation.purchase_lot_id}` +
        `_v${preliquidation.version}.csv`;


      // =================================================
      // 12. RESPUESTA
      // =================================================

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );

      res.setHeader(
        'Cache-Control',
        'no-store'
      );


      return res
        .status(200)
        .send(csv);


    } catch (error) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {}


      console.error(
        'EXPORT PRELIQUIDATION CSV ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error generando CSV de la preliquidación',
      });


    } finally {

      client.release();

    }

  };  