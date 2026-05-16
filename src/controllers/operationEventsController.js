const { pool } = require('../config/db');

/// ======================================================
/// 🔥 GET OPERATION EVENTS
/// ======================================================
exports.getOperationEvents =
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT *
          FROM operation_events
          ORDER BY created_at DESC
          LIMIT 100
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        '❌ GET OPERATION EVENTS ERROR',
        error,
      );

      res.status(500).json({
        error:
          'Error obteniendo eventos'
      });
    }
};