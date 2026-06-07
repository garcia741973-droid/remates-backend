const { pool } = require('../config/db');

const {
  processLotAlerts,
} = require('../services/processLotAlerts');

const {
  createOperationEvent,
} = require('../services/operationEventsService');

const {
  sendAdminNotification,
} = require('../services/notificationService');

exports.createLot = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const user_id = req.user.user_id;

    const userResult = await pool.query(
      `SELECT seller_status FROM users WHERE id = $1`,
      [user_id]
    );

    const user = userResult.rows[0];

    if (!user || user.seller_status !== 'approved') {
      return res.status(403).json({
        error: 'Debes ser vendedor aprobado para publicar lotes'
      });
    }

    const {
      quantity,
      class: lot_class,
      gender,
      town,
      distance_km,
      breed,
      weight,
      sale_type,
      base_price,
      has_destare,
      destare_percent,      
      department,
      province,
      municipality,
      images,
      video,
      promotion_plan_id,
    } = req.body;

    if (!department || !province || !municipality) {
      return res.status(400).json({
        error: 'Debes seleccionar departamento, provincia y municipio'
      });
    }

    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({
        error: 'Cantidad inválida'
      });
    }

    if (!base_price || Number(base_price) <= 0) {
      return res.status(400).json({
        error: 'Precio base inválido'
      });
    }

    const countResult = await pool.query(
      `
      SELECT COUNT(*)
      FROM lots
      WHERE company_id = $1
      AND seller_id = $2
      `,
      [company_id, user_id]
    );

    const count =
        parseInt(countResult.rows[0].count) + 1;

    const lot_number = count;

    const { rows } = await pool.query(
      `
      INSERT INTO lots
      (
        company_id,
        seller_id,
        lot_number,

        quantity,
        class,
        breed,
        gender,

        weight,
        sale_type,

        base_price,
        current_price,

        department,
        province,
        municipality,

        town,
        distance_km,

        images,
        video_url,

        has_destare,
        destare_percent,

        featured
      )
      VALUES
      (
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
        false
      )
      RETURNING *
      `,
      [
        company_id,
        user_id,
        lot_number,

        quantity,
        lot_class,
        breed,
        gender,

        weight,
        sale_type,

        base_price,
        base_price,

        department.trim(),
        province.trim(),
        municipality.trim(),

        town?.trim() || null,
        distance_km || 0,

        images || [],
        video || null,

        has_destare || false,
        destare_percent || 5,
      ]
    );

    const createdLot = rows[0];

    let promotionRequest = null;

    if (promotion_plan_id != null) {
      const planRes = await pool.query(
        `
        SELECT *
        FROM promotion_plans
        WHERE id = $1
        AND is_active = true
        LIMIT 1
        `,
        [promotion_plan_id]
      );

      if (planRes.rows.length === 0) {
        return res.status(400).json({
          error: 'Plan de promoción inválido'
        });
      }

      const plan = planRes.rows[0];

      const promoRes = await pool.query(
        `
        INSERT INTO promotion_requests
        (
          company_id,
          user_id,
          promotion_plan_id,
          entity_type,
          entity_id,
          status,
          amount
        )
        VALUES
        (
          $1,
          $2,
          $3,
          'lot',
          $4,
          'pending_payment',
          $5
        )
        RETURNING *
        `,
        [
          company_id,
          user_id,
          plan.id,
          createdLot.id,
          plan.price,
        ]
      );

      promotionRequest = promoRes.rows[0];

      console.log(
        '🚀 PROMOTION REQUEST CREATED:',
        promotionRequest.id
      );
    }

    console.log(
      '🔥 LOT CREATED:',
      createdLot.id
    );

    await processLotAlerts(createdLot);

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type: 'new_lot',

      title:
          '🐄 Nuevo lote publicado',

      message:
          `${lot_class} ${breed} publicado por vendedor ${user_id}`,

      priority: 'high',

      data: {

        lot_id:
            createdLot.id,

        seller_id:
            user_id,
      },
    });    

    await sendAdminNotification({

      title:
        '🐄 Nuevo lote publicado',

      body:
        `${lot_class} ${breed} publicado`,

      data: {

        type: 'new_lot',

        lot_id:
          createdLot.id.toString(),
      },
    });

    res.json({
      lot: createdLot,

      promotion_request:
          promotionRequest,

      requires_promotion_payment:
          promotionRequest != null,
    });

  } catch (error) {
    console.error(
      'ERROR CREATE LOT:',
      error
    );

    res.status(500).json({
      error: 'Error creando lote'
    });
  }
};

/// 🔥 GET LOTS
exports.getLots = async (req, res) => {

  try {

    /// 🔥 TOLERANTE A GUEST
    const company_id =
        req.user?.company_id ||
        req.query.company_id;

    let query = `
      SELECT

        l.*,

        CASE
          WHEN
            l.promoted_until IS NOT NULL
            AND l.promoted_until > NOW()
          THEN true
          ELSE false
        END AS featured,

        COALESCE(
          u.full_name,
          u.name
        ) as seller_name,

        u.seller_rating_avg,

        u.seller_rating_count,

        u.successful_sales_count,

        u.seller_status

      FROM lots l

      JOIN users u
        ON u.id = l.seller_id

      WHERE
        (
          l.status IS NULL
          OR l.status != 'sold'
        )
    `;

    const params = [];

    /// 🔥 SOLO FILTRAR SI EXISTE company_id
    if (company_id) {

      params.push(company_id);

      query += `
        AND l.company_id = $${params.length}
      `;
    }

    query += `
      ORDER BY

        CASE
          WHEN
            l.promoted_until IS NOT NULL
            AND l.promoted_until > NOW()
          THEN 0
          ELSE 1
        END,

        COALESCE(
          l.promotion_priority,
          0
        ) DESC,

        l.promoted_until DESC NULLS LAST,

        u.successful_sales_count DESC,

        l.created_at DESC
    `;

    const { rows } =
        await pool.query(
      query,
      params
    );

    /// 🔥 LOTES DE REMATE
    const auctionLotsResult =
        await pool.query(
    `
    SELECT

      l.id,

      l.company_id,

      l.lot_number,

      l.title,

      l.breed,

      l.quantity,

      l.weight,

      l.sale_type,

      l.current_price AS base_price,

      l.department,

      l.province,

      l.municipality,

      l.images,

      l.videos,

      l.cattle_type AS class,

      l.status,

      c.name AS company_name,

      'auction' AS source

    FROM auction_live_lots l

    JOIN companies c
      ON c.id = l.company_id

    JOIN auctions a
      ON a.id = l.auction_id

    WHERE

      l.status IN (
        'queued',
        'live'
      )

      AND a.status != 'closed'
    `
    );

    const auctionLots =
        auctionLotsResult.rows;    

    const plazaLots =
        rows.map((lot) => ({
          ...lot,
          source: 'plaza',
        }));

    res.json([
      ...auctionLots,
      ...plazaLots,
    ]);

  } catch (error) {

    console.error(
      'ERROR GET LOTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo lotes'
    });
  }
};

/// 🔥 MIS LOTES (VENDEDOR)
exports.getMyLots = async (req, res) => {
  try {

    const company_id =
        req.user.company_id;

    const user_id =
        req.user.user_id;

    const { rows } = await pool.query(
      `
      SELECT

        l.*,

        u.full_name as seller_name,

        u.seller_rating_avg,

        u.seller_rating_count,

        u.successful_sales_count,

        u.seller_status

      FROM lots l

      JOIN users u
        ON u.id = l.seller_id
        WHERE l.company_id = $1
        AND l.seller_id = $2
      ORDER BY created_at DESC
      `,
      [
        company_id,
        user_id
      ]
    );

    res.json(rows);

  } catch (error) {

    console.error(
      'ERROR GET MY LOTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo mis lotes'
    });
  }
};

/// 🔥 EDITAR LOTE
exports.updateLot = async (req, res) => {
  try {

    const company_id =
        req.user.company_id;

    const user_id =
        req.user.user_id;

    const { id } = req.params;

    const {

      quantity,

      class: lot_class,
      gender,

      has_destare,
      destare_percent,      
      
      breed,

      weight,

      sale_type,

      base_price,

      department,

      province,

      municipality,

      town,

      distance_km,

      images,

      video,

    } = req.body;

    /// 🔥 VALIDAR LOTE
    const lotRes = await pool.query(
      `
      SELECT *
      FROM lots
      WHERE id = $1
      `,
      [id]
    );

    if (lotRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    const lot = lotRes.rows[0];

    /// 🔥 VALIDAR DUEÑO
    if (
      lot.seller_id !== user_id
    ) {

      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    /// 🔥 BLOQUEAR VENDIDOS
    if (
      lot.status === 'sold'
    ) {

      return res.status(400).json({
        error: 'No puedes editar un lote vendido'
      });
    }

    /// 🔥 UPDATE
    const { rows } = await pool.query(
      `
      UPDATE lots
      SET

        quantity = $1,

        class = $2,

        breed = $3,

        gender = $4,

        weight = $5,

        sale_type = $6,

        base_price = $7,

        current_price = $7,

        department = $8,

        province = $9,

        municipality = $10,

        town = $11,

        distance_km = $12,

        images = $13,

        video_url = $14,

        has_destare = $15,

        destare_percent = $16

        WHERE id = $17

      RETURNING *
      `,
      [

        quantity,

        lot_class,

        breed,

        weight,

        gender,

        sale_type,

        base_price,

        department,

        province,

        municipality,

        town,

        distance_km,

        images || [],

        video || null,

        has_destare || false,

        destare_percent || 5,

        id,
      ]
    );

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type: 'lot_updated',

      title:
          '✏️ Lote actualizado',

      message:
          `Lote ${id} fue editado por vendedor ${user_id}`,

      priority: 'medium',

      data: {

        lot_id: id,

        seller_id:
            user_id,
      },
    });

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR UPDATE LOT:',
      error
    );

    res.status(500).json({
      error: 'Error editando lote'
    });
  }
};


/// 🔥 ELIMINAR LOTE
exports.deleteLot = async (req, res) => {
  try {

    const user_id =
        req.user.user_id;

    const { id } = req.params;

    /// 🔥 VALIDAR
    const lotRes = await pool.query(
      `
      SELECT *
      FROM lots
      WHERE id = $1
      `,
      [id]
    );

    if (lotRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    const lot = lotRes.rows[0];

    /// 🔥 VALIDAR DUEÑO
    if (
      lot.seller_id !== user_id
    ) {

      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    /// 🔥 BLOQUEAR SI YA VENDIDO
    if (
      lot.status === 'sold'
    ) {

      return res.status(400).json({
        error: 'No puedes eliminar un lote vendido'
      });
    }

    /// 🔥 DELETE
    await pool.query(
      `
      DELETE FROM lots
      WHERE id = $1
      `,
      [id]
    );

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type: 'lot_deleted',

      title:
          '🗑 Lote eliminado',

      message:
          `Lote ${id} eliminado por vendedor ${user_id}`,

      priority: 'medium',

      data: {

        lot_id: id,

        seller_id:
            user_id,
      },
    });

    res.json({
      success: true
    });

  } catch (error) {

    console.error(
      'ERROR DELETE LOT:',
      error
    );

    res.status(500).json({
      error: 'Error eliminando lote'
    });
  }
};

/// 🔥 SEARCH LOTS
exports.searchLots = async (
  req,
  res
) => {

  try {

    const company_id =
      req.user.company_id;

    const user_id =
      req.user.user_id;      

    const {

      query,

      class: lot_class,

      breed,

      sale_type,

      department,

      province,

      municipality,

      quantity_min,

      quantity_max,

      weight_min,

      weight_max,

      price_min,

      price_max,

      distance_min,

      distance_max,

      only_featured,

      only_top_sellers,

      only_verified,

      alerts_enabled,

      sort_by,

    } = req.body;

    let sql = `
      SELECT

        l.*,

        COALESCE(
          u.full_name,
          u.name
        ) as seller_name,

        u.seller_rating_avg,

        u.seller_rating_count,

        u.successful_sales_count,

        u.seller_status

      FROM lots l

      JOIN users u
        ON u.id = l.seller_id

      WHERE l.company_id = $1

      AND l.status != 'sold'
    `;

    const values = [company_id];

    let index = 2;

    /// 🔍 BUSCADOR GENERAL
    if (query) {

      sql += `
        AND (

          l.class ILIKE $${index}

          OR l.breed ILIKE $${index}

          OR l.department ILIKE $${index}

          OR l.province ILIKE $${index}

          OR l.municipality ILIKE $${index}

          OR l.town ILIKE $${index}

        )
      `;

      values.push(`%${query}%`);

      index++;
    }

    /// 🐄 CLASE
    if (lot_class) {

      sql += `
        AND l.class = $${index}
      `;

      values.push(lot_class);

      index++;
    }

    /// 🧬 RAZA
    if (breed) {

      sql += `
        AND l.breed = $${index}
      `;

      values.push(breed);

      index++;
    }

    /// 💰 TIPO VENTA
    if (sale_type) {

      sql += `
        AND l.sale_type = $${index}
      `;

      values.push(sale_type);

      index++;
    }

    /// 📍 DEPARTAMENTO
    if (department) {

      sql += `
        AND l.department = $${index}
      `;

      values.push(department);

      index++;
    }

    /// 📍 PROVINCIA
    if (province) {

      sql += `
        AND l.province = $${index}
      `;

      values.push(province);

      index++;
    }

    /// 📍 MUNICIPIO
    if (municipality) {

      sql += `
        AND l.municipality = $${index}
      `;

      values.push(municipality);

      index++;
    }

    /// 📦 CANTIDAD MÍNIMA
    if (
      quantity_min != null
    ) {

      sql += `
        AND l.quantity >= $${index}
      `;

      values.push(quantity_min);

      index++;
    }

    /// 📦 CANTIDAD MÁXIMA
    if (
      quantity_max != null
    ) {

      sql += `
        AND l.quantity <= $${index}
      `;

      values.push(quantity_max);

      index++;
    }

    /// ⚖️ PESO MÍNIMO
    if (
      weight_min != null
    ) {

      sql += `
        AND l.weight >= $${index}
      `;

      values.push(weight_min);

      index++;
    }

    /// ⚖️ PESO MÁXIMO
    if (
      weight_max != null
    ) {

      sql += `
        AND l.weight <= $${index}
      `;

      values.push(weight_max);

      index++;
    }

    /// 💵 PRECIO MÍNIMO
    if (
      price_min != null
    ) {

      sql += `
        AND l.base_price >= $${index}
      `;

      values.push(price_min);

      index++;
    }

    /// 💵 PRECIO MÁXIMO
    if (
      price_max != null
    ) {

      sql += `
        AND l.base_price <= $${index}
      `;

      values.push(price_max);

      index++;
    }

    /// 🚛 DISTANCIA MÍNIMA
    if (
      distance_min != null
    ) {

      sql += `
        AND COALESCE(l.distance_km, 0) >= $${index}
      `;

      values.push(distance_min);

      index++;
    }

    /// 🚛 DISTANCIA MÁXIMA
    if (
      distance_max != null
    ) {

      sql += `
        AND COALESCE(l.distance_km, 0) <= $${index}
      `;

      values.push(distance_max);

      index++;
    }

    /// ⭐ DESTACADOS
    if (
      only_featured === true
    ) {

      sql += `
      AND l.promoted_until IS NOT NULL
      AND l.promoted_until > NOW()
      `;
    }

    /// 🏆 TOP SELLERS
    if (
      only_top_sellers === true
    ) {

      sql += `
        AND u.successful_sales_count >= 5

        AND u.seller_rating_avg >= 4
      `;
    }
    
    /// ✅ VENDEDORES VERIFICADOS
    if (
      only_verified === true
    ) {

      sql += `
        AND u.seller_status = 'approved'
      `;
    }    

    /// 🔥 ORDER BY
    switch (sort_by) {

      case 'Menor precio':

        sql += `
          ORDER BY l.base_price ASC
        `;

        break;

      case 'Mayor peso':

        sql += `
          ORDER BY l.weight DESC
        `;

        break;

      case 'Mayor cantidad':

        sql += `
          ORDER BY l.quantity DESC
        `;

        break;

        default:

          sql += `
            ORDER BY

            CASE

              WHEN

                l.promoted_until IS NOT NULL
                AND l.promoted_until > NOW()

              THEN 0

              ELSE 1

            END,

            COALESCE(
              l.promotion_priority,
              0
            ) DESC,

            l.promoted_until DESC NULLS LAST,

            u.successful_sales_count DESC,

            l.created_at DESC
          `;
    }

    console.log(
      '🔍 SEARCH SQL:',
      sql
    );

    console.log(
      '🔍 VALUES:',
      values
    );

    const result =
      await pool.query(
        sql,
        values
      );

    /// 🔔 GUARDAR ALERTA
    if (
      alerts_enabled === true
    ) {

      /// 🔍 VERIFICAR SI YA EXISTE
      const existing =
          await pool.query(
        `
        SELECT id
        FROM saved_searches
        WHERE user_id = $1
        AND company_id = $2
        AND filters = $3
        LIMIT 1
        `,
        [
          user_id,
          company_id,
          JSON.stringify(req.body),
        ]
      );

      /// 🆕 CREAR NUEVA
      if (
        existing.rows.length === 0
      ) {

        await pool.query(
          `
          INSERT INTO saved_searches
          (
            user_id,
            company_id,
            filters,
            alerts_enabled
          )
          VALUES
          (
            $1,
            $2,
            $3,
            true
          )
          `,
          [
            user_id,
            company_id,
            JSON.stringify(req.body),
          ]
        );

        console.log(
          '🔔 ALERTA GUARDADA'
        );
      }
    }

    res.json(result.rows);

  } catch (error) {

    console.error(
      'ERROR SEARCH LOTS:',
      error
    );

    res.status(500).json({
      error:
        'Error buscando lotes'
    });
  }
};

/// 🔥 GET LOT BY ID
exports.getLotById = async (req, res) => {

  try {

    const { id } = req.params;

    const { rows } =
      await pool.query(
        `
        SELECT

          l.*,

          COALESCE(
            u.full_name,
            u.name
          ) as seller_name,

          u.seller_rating_avg,

          u.seller_rating_count,

          u.successful_sales_count,

          u.seller_status

        FROM lots l

        JOIN users u
          ON u.id = l.seller_id

        WHERE l.id = $1

        LIMIT 1
        `,
        [id]
      );

    if (rows.length === 0) {

      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR GET LOT BY ID:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo lote'
    });
  }
};

/// ⭐ LOTES DESTACADOS
exports.getFeaturedLots =
  async (req, res) => {

  try {

    const company_id =
      req.user?.company_id || 1;

    const { rows } =
      await pool.query(
        `
        SELECT

          l.*,

          COALESCE(
            u.full_name,
            u.name
          ) as seller_name,

          COALESCE(
            u.successful_sales_count,
            0
          ) as successful_sales_count

        FROM lots l

        LEFT JOIN users u
          ON u.id = l.seller_id

        WHERE

          l.company_id = $1

          AND l.status != 'sold'

          AND l.promoted_until IS NOT NULL

          AND l.promoted_until > NOW()

        ORDER BY

          COALESCE(
            l.promotion_priority,
            0
          ) DESC,

          l.promoted_until DESC,

          successful_sales_count DESC,

          l.created_at DESC

        LIMIT 10
        `,
        [company_id]
      );

    res.json(rows);

  } catch (error) {

    console.error(
      'ERROR FEATURED LOTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo destacados'
    });
  }
};