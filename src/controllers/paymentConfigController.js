const { pool } = require('../config/db');

const getPaymentConfigs =
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT *
          FROM system_payment_configs
          ORDER BY id ASC
          `
        );

      res.json(
        result.rows
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo configuraciones',
      });
    }
  };

const updatePaymentConfig =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        amount,
        is_active,
      } = req.body;

      const result =
        await pool.query(
          `
          UPDATE system_payment_configs
          SET
            amount = $1,
            is_active = $2,
            updated_at = now()
          WHERE id = $3
          RETURNING *
          `,
          [
            amount,
            is_active,
            id,
          ]
        );

      res.json(
        result.rows[0]
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error actualizando configuración',
      });
    }
  };

module.exports = {
  getPaymentConfigs,
  updatePaymentConfig,
};