const { pool } = require('../config/db');


/// ======================================================
/// CAMPOS QUE EL CSV TIENE PERMITIDO MODIFICAR
/// ======================================================

const ALLOWED_IMPORT_FIELDS =
  new Set([
    'lot_number',
    'position',
    'title',
    'category',
    'cattle_type',
    'gender',
    'age',
    'breed',
    'quantity',
    'estimated_total_weight',
    'sale_type',
    'department',
    'province',
    'municipality',
    'arrival_time',
    'nearby_town',
    'nearby_km',
    'base_price',
    'opening_price',
    'reserve_price',
    'increment_value',
    'notes',
  ]);


/// ======================================================
/// CAMPOS NUMÉRICOS
/// ======================================================

const INTEGER_FIELDS =
  new Set([
    'lot_number',
    'position',
    'age',
    'quantity',
  ]);

const DECIMAL_FIELDS =
  new Set([
    'estimated_total_weight',
    'nearby_km',
    'base_price',
    'opening_price',
    'reserve_price',
    'increment_value',
  ]);


/// ======================================================
/// TEXTO VACÍO → NULL
/// ======================================================

function cleanText(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  return text;
}


/// ======================================================
/// NORMALIZAR NÚMERO
///
/// SOPORTA:
/// 15000
/// 15000,50
/// 15.000,50
/// 15,000.50
/// ======================================================

function normalizeNumber(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  let text =
    String(value)
      .trim()
      .replace(/\s/g, '');

  if (!text) {
    return null;
  }

  /// 15.000,50
  if (
    text.includes('.') &&
    text.includes(',')
  ) {

    const lastDot =
      text.lastIndexOf('.');

    const lastComma =
      text.lastIndexOf(',');

    if (
      lastComma > lastDot
    ) {

      text =
        text
          .replace(/\./g, '')
          .replace(',', '.');

    } else {

      /// 15,000.50
      text =
        text.replace(/,/g, '');
    }

  } else if (
    text.includes(',')
  ) {

    /// 15000,50
    text =
      text.replace(',', '.');
  }

  const number =
    Number(text);

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  return number;
}


/// ======================================================
/// NORMALIZAR VALOR SEGÚN CAMPO PG
/// ======================================================

function normalizeField(
  field,
  value,
) {

  if (
    INTEGER_FIELDS.has(field)
  ) {

    const number =
      normalizeNumber(value);

    if (number === null) {
      return null;
    }

    return Math.trunc(number);
  }

  if (
    DECIMAL_FIELDS.has(field)
  ) {

    return normalizeNumber(value);
  }

  if (
    field === 'sale_type'
  ) {

    const text =
      cleanText(value)
        ?.toLowerCase();

    if (!text) {
      return null;
    }

    if (
      text === 'kilo' ||
      text === 'kg' ||
      text === 'por kilo' ||
      text === 'por kg'
    ) {

      return 'kilo';
    }

    if (
      text === 'bulto' ||
      text === 'por bulto' ||
      text === 'cabeza' ||
      text === 'por cabeza'
    ) {

      return 'bulto';
    }

    return null;
  }

  if (
    field === 'arrival_time'
  ) {

    const text =
      cleanText(value);

    if (!text) {
      return null;
    }

    /// HH:MM o HH:MM:SS
    if (
      /^\d{1,2}:\d{2}(:\d{2})?$/
        .test(text)
    ) {

      return text;
    }

    return null;
  }

  return cleanText(value);
}


/// ======================================================
/// CONVERTIR UNA FILA CSV A CAMPOS PLAZA GANADERA
/// ======================================================

function mapRow(
  rawRow,
  mapping,
) {

  const lot = {};

  for (
    const [csvColumn, targetField]
    of Object.entries(mapping)
  ) {

    if (!targetField) {
      continue;
    }

    if (
      !ALLOWED_IMPORT_FIELDS
        .has(targetField)
    ) {
      continue;
    }

    lot[targetField] =
      normalizeField(
        targetField,
        rawRow[csvColumn],
      );
  }

  return lot;
}


/// ======================================================
/// LISTAR PLANTILLAS EMPRESA
/// ======================================================

exports.getImportTemplates =
  async (req, res) => {

  try {

    const companyId =
      req.user.company_id;

    const result =
      await pool.query(
        `
        SELECT
          id,
          company_id,
          name,
          mapping,
          has_header,
          delimiter,
          last_used_at,
          created_at,
          updated_at
        FROM auction_lot_import_templates
        WHERE company_id = $1
        ORDER BY
          last_used_at DESC NULLS LAST,
          name ASC
        `,
        [
          companyId,
        ]
      );

    res.json(
      result.rows
    );

  } catch (error) {

    console.log(
      'GET IMPORT TEMPLATES ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error obteniendo plantillas',
    });
  }
};


/// ======================================================
/// CREAR PLANTILLA
/// ======================================================

exports.createImportTemplate =
  async (req, res) => {

  try {

    const companyId =
      req.user.company_id;

    const userId =
      req.user.user_id;

    const {
      name,
      mapping,
      has_header = true,
      delimiter = null,
    } = req.body;

    if (
      !name ||
      !name.toString().trim()
    ) {

      return res.status(400).json({
        error:
          'Nombre de plantilla requerido',
      });
    }

    if (
      !mapping ||
      typeof mapping !== 'object' ||
      Array.isArray(mapping)
    ) {

      return res.status(400).json({
        error:
          'Mapeo inválido',
      });
    }

    /// 🔒 VALIDAR DESTINOS
    for (
      const targetField
      of Object.values(mapping)
    ) {

      if (
        targetField !== null &&
        targetField !== '' &&
        !ALLOWED_IMPORT_FIELDS
          .has(targetField)
      ) {

        return res.status(400).json({
          error:
            `Campo no permitido: ${targetField}`,
        });
      }
    }

    const result =
      await pool.query(
        `
        INSERT INTO auction_lot_import_templates (
          company_id,
          name,
          mapping,
          has_header,
          delimiter,
          created_by_user_id
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        RETURNING *
        `,
        [
          companyId,
          name.toString().trim(),
          mapping,
          Boolean(has_header),
          delimiter,
          userId,
        ]
      );

    res.json(
      result.rows[0]
    );

  } catch (error) {

    console.log(
      'CREATE IMPORT TEMPLATE ERROR:',
      error,
    );

    if (
      error.code === '23505'
    ) {

      return res.status(409).json({
        error:
          'Ya existe una plantilla con ese nombre',
      });
    }

    res.status(500).json({
      error:
        'Error creando plantilla',
    });
  }
};


/// ======================================================
/// ACTUALIZAR PLANTILLA
/// ======================================================

exports.updateImportTemplate =
  async (req, res) => {

  try {

    const companyId =
      req.user.company_id;

    const { id } =
      req.params;

    const {
      name,
      mapping,
      has_header,
      delimiter,
    } = req.body;

    if (
      !name ||
      !name.toString().trim()
    ) {

      return res.status(400).json({
        error:
          'Nombre requerido',
      });
    }

    if (
      !mapping ||
      typeof mapping !== 'object' ||
      Array.isArray(mapping)
    ) {

      return res.status(400).json({
        error:
          'Mapeo inválido',
      });
    }

    for (
      const targetField
      of Object.values(mapping)
    ) {

      if (
        targetField !== null &&
        targetField !== '' &&
        !ALLOWED_IMPORT_FIELDS
          .has(targetField)
      ) {

        return res.status(400).json({
          error:
            `Campo no permitido: ${targetField}`,
        });
      }
    }

    const result =
      await pool.query(
        `
        UPDATE auction_lot_import_templates
        SET
          name = $1,
          mapping = $2,
          has_header = $3,
          delimiter = $4,
          updated_at = NOW()
        WHERE id = $5
        AND company_id = $6
        RETURNING *
        `,
        [
          name.toString().trim(),
          mapping,
          Boolean(has_header),
          delimiter,
          id,
          companyId,
        ]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'Plantilla no encontrada',
      });
    }

    res.json(
      result.rows[0]
    );

  } catch (error) {

    console.log(
      'UPDATE IMPORT TEMPLATE ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error actualizando plantilla',
    });
  }
};


/// ======================================================
/// ELIMINAR PLANTILLA
/// ======================================================

exports.deleteImportTemplate =
  async (req, res) => {

  try {

    const companyId =
      req.user.company_id;

    const { id } =
      req.params;

    const result =
      await pool.query(
        `
        DELETE FROM auction_lot_import_templates
        WHERE id = $1
        AND company_id = $2
        RETURNING id
        `,
        [
          id,
          companyId,
        ]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'Plantilla no encontrada',
      });
    }

    res.json({
      success: true,
    });

  } catch (error) {

    console.log(
      'DELETE IMPORT TEMPLATE ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error eliminando plantilla',
    });
  }
};


/// ======================================================
/// IMPORTAR LOTES
/// ======================================================

exports.importAuctionLots =
  async (req, res) => {

  const client =
    await pool.connect();

  try {

    const companyId =
      req.user.company_id;

    const {
      auction_id,
      rows,
      mapping,
      template_id,
    } = req.body;

    if (
      !auction_id
    ) {

      return res.status(400).json({
        error:
          'Remate requerido',
      });
    }

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      return res.status(400).json({
        error:
          'No hay filas para importar',
      });
    }

    if (
      !mapping ||
      typeof mapping !== 'object' ||
      Array.isArray(mapping)
    ) {

      return res.status(400).json({
        error:
          'Mapeo inválido',
      });
    }

    /// 🔒 VALIDAR CAMPOS
    for (
      const targetField
      of Object.values(mapping)
    ) {

      if (
        targetField !== null &&
        targetField !== '' &&
        !ALLOWED_IMPORT_FIELDS
          .has(targetField)
      ) {

        return res.status(400).json({
          error:
            `Campo no permitido: ${targetField}`,
        });
      }
    }

    /// 🔒 LOTE DEBE ESTAR MAPEADO
    const mappedFields =
      Object.values(mapping);

    if (
      !mappedFields.includes(
        'lot_number'
      )
    ) {

      return res.status(400).json({
        error:
          'Debes mapear una columna como Número de lote',
      });
    }

    /// 🔒 VALIDAR REMATE
    const auctionResult =
      await client.query(
        `
        SELECT id
        FROM auctions
        WHERE id = $1
        AND company_id = $2
        `,
        [
          auction_id,
          companyId,
        ]
      );

    if (
      auctionResult.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'Remate no encontrado',
      });
    }

    await client.query(
      'BEGIN'
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const details = [];

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {

      const rawRow =
        rows[index];

      const lot =
        mapRow(
          rawRow,
          mapping,
        );

      const lotNumber =
        lot.lot_number;

      /// ❌ SIN NÚMERO
      if (
        !Number.isInteger(lotNumber) ||
        lotNumber <= 0
      ) {

        errors++;

        details.push({
          row:
            index + 1,
          status:
            'error',
          message:
            'Número de lote inválido',
        });

        continue;
      }

      /// 🔎 BUSCAR EXISTENTE
      const existingResult =
        await client.query(
          `
          SELECT
            id,
            status,
            weight,
            quantity,
            opening_price
          FROM auction_live_lots
          WHERE auction_id = $1
          AND lot_number = $2
          AND company_id = $3
          FOR UPDATE
          `,
          [
            auction_id,
            lotNumber,
            companyId,
          ]
        );

      const existing =
        existingResult.rows[0];

      /// ==================================================
      /// LOTE NUEVO
      /// ==================================================

      if (!existing) {

        const position =
          lot.position ??
          lotNumber;

        const title =
          lot.title ??
          `Lote ${lotNumber}`;

        const saleType =
          lot.sale_type ??
          'kilo';

        const result =
          await client.query(
            `
            INSERT INTO auction_live_lots (

              company_id,
              auction_id,

              lot_number,
              position,
              title,

              category,
              cattle_type,
              gender,
              age,
              breed,

              quantity,
              estimated_total_weight,

              sale_type,

              department,
              province,
              municipality,

              arrival_time,
              nearby_town,
              nearby_km,

              base_price,
              opening_price,
              current_price,
              reserve_price,
              increment_value,

              notes
            )

            VALUES (

              $1,$2,

              $3,$4,$5,

              $6,$7,$8,$9,$10,

              $11,$12,

              $13,

              $14,$15,$16,

              $17,$18,$19,

              $20,$21,$22,$23,$24,

              $25
            )

            RETURNING id
            `,
            [
              companyId,
              auction_id,

              lotNumber,
              position,
              title,

              lot.category ?? null,
              lot.cattle_type ?? null,
              lot.gender ?? null,
              lot.age ?? null,
              lot.breed ?? null,

              lot.quantity ?? null,
              lot.estimated_total_weight ?? null,

              saleType,

              lot.department ?? null,
              lot.province ?? null,
              lot.municipality ?? null,

              lot.arrival_time ?? null,
              lot.nearby_town ?? null,
              lot.nearby_km ?? null,

              lot.base_price ?? null,
              lot.opening_price ?? null,
              lot.opening_price ?? null,
              lot.reserve_price ?? null,
              lot.increment_value ?? null,

              lot.notes ?? null,
            ]
          );

        created++;

        details.push({
          row:
            index + 1,
          lot_number:
            lotNumber,
          lot_id:
            result.rows[0].id,
          status:
            'created',
        });

        continue;
      }

      /// ==================================================
      /// EXISTENTE PERO YA OPERATIVO
      /// ==================================================

      if (
        existing.status !== 'queued'
      ) {

        skipped++;

        details.push({
          row:
            index + 1,
          lot_number:
            lotNumber,
          status:
            'skipped',
          message:
            `Lote en estado ${existing.status}`,
        });

        continue;
      }

      /// ==================================================
      /// LOTE EXISTENTE QUEUE
      /// SOLO ACTUALIZAMOS CAMPOS PRESENTES
      /// ==================================================

      const updates = [];
      const values = [];

      const editableFields =
        [
          'position',
          'title',

          'category',
          'cattle_type',
          'gender',
          'age',
          'breed',

          'quantity',
          'estimated_total_weight',

          'sale_type',

          'department',
          'province',
          'municipality',

          'arrival_time',
          'nearby_town',
          'nearby_km',

          'base_price',
          'opening_price',
          'reserve_price',
          'increment_value',

          'notes',
        ];

      for (
        const field
        of editableFields
      ) {

        /// IMPORTANTE:
        /// SOLO SI ESA COLUMNA
        /// FUE MAPEADA
        const fieldWasMapped =
          Object.values(mapping)
            .includes(field);

        if (!fieldWasMapped) {
          continue;
        }

        /// VACÍO NO BORRA
        /// INFORMACIÓN EXISTENTE
        if (
          lot[field] === null ||
          lot[field] === undefined
        ) {
          continue;
        }

        values.push(
          lot[field]
        );

        updates.push(
          `${field} = $${values.length}`
        );
      }

      /// 🔥 SI CAMBIA CANTIDAD,
      /// RECALCULAR PROMEDIO
      if (
        Object.values(mapping)
          .includes('quantity') &&
        lot.quantity !== null &&
        lot.quantity !== undefined
      ) {

        values.push(
          lot.quantity
        );

        updates.push(
          `
          average_weight =
            CASE
              WHEN weight IS NOT NULL
               AND weight > 0
               AND $${values.length} > 0
              THEN ROUND(
                weight / $${values.length},
                2
              )
              ELSE NULL
            END
          `
        );
      }

      /// 🔥 SI CAMBIA APERTURA
      /// Y TODAVÍA NO EXISTEN PUJAS,
      /// SISTEMA SINCRONIZA CURRENT_PRICE
      if (
        Object.values(mapping)
          .includes('opening_price') &&
        lot.opening_price !== null &&
        lot.opening_price !== undefined
      ) {

        values.push(
          lot.opening_price
        );

        updates.push(
          `
          current_price =
            CASE
              WHEN NOT EXISTS (
                SELECT 1
                FROM bids
                WHERE lot_id =
                  auction_live_lots.id
                AND status = 'active'
              )
              THEN $${values.length}
              ELSE current_price
            END
          `
        );
      }

      if (
        updates.length === 0
      ) {

        skipped++;

        details.push({
          row:
            index + 1,
          lot_number:
            lotNumber,
          status:
            'skipped',
          message:
            'Sin datos nuevos',
        });

        continue;
      }

      values.push(
        existing.id
      );

      values.push(
        companyId
      );

      await client.query(
        `
        UPDATE auction_live_lots
        SET
          ${updates.join(',\n')}

        WHERE id =
          $${values.length - 1}

        AND company_id =
          $${values.length}
        `,
        values
      );

      updated++;

      details.push({
        row:
          index + 1,
        lot_number:
          lotNumber,
        status:
          'updated',
      });
    }

    /// 🔥 MARCAR PLANTILLA UTILIZADA
    if (template_id) {

      await client.query(
        `
        UPDATE auction_lot_import_templates
        SET
          last_used_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        AND company_id = $2
        `,
        [
          template_id,
          companyId,
        ]
      );
    }

    await client.query(
      'COMMIT'
    );

    /// 🔥 ACTUALIZAR MINI PLAZA
    const io =
      req.app.get('io');

    io.emit(
      'miniPlazaUpdated'
    );

    res.json({

      success: true,

      total:
        rows.length,

      created,

      updated,

      skipped,

      errors,

      details,
    });

  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}

    console.log(
      'IMPORT AUCTION LOTS ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error importando lotes',
    });

  } finally {

    client.release();
  }
};