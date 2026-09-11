const { pool } = require('../config/db');

// =====================================================
// 🔔 LISTAR NOTIFICACIONES DEL USUARIO
// =====================================================

exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        company_id,
        type,
        title,
        body,
        data,
        event_key,
        is_read,
        read_at,
        created_at
      FROM user_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 100
      `,
      [userId],
    );

    res.json({
      notifications: result.rows,
    });
  } catch (error) {
    console.error(
      '❌ GET USER NOTIFICATIONS ERROR:',
      error,
    );

    res.status(500).json({
      error: 'Error obteniendo notificaciones',
    });
  }
};

// =====================================================
// 🔴 CONTADOR NO LEÍDAS
// =====================================================

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM user_notifications
      WHERE user_id = $1
        AND is_read = FALSE
      `,
      [userId],
    );

    res.json({
      count: result.rows[0]?.count ?? 0,
    });
  } catch (error) {
    console.error(
      '❌ GET USER NOTIFICATIONS UNREAD COUNT ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error obteniendo contador de notificaciones',
    });
  }
};

// =====================================================
// ✅ MARCAR UNA COMO LEÍDA
// =====================================================

exports.markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const notificationId =
      Number(req.params.id);

    if (
      !Number.isInteger(notificationId) ||
      notificationId <= 0
    ) {
      return res.status(400).json({
        error: 'Notificación inválida',
      });
    }

    const result = await pool.query(
      `
      UPDATE user_notifications
      SET
        is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
      WHERE id = $1
        AND user_id = $2
      RETURNING
        id,
        is_read,
        read_at
      `,
      [
        notificationId,
        userId,
      ],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: 'Notificación no encontrada',
      });
    }

    res.json({
      success: true,
      notification: result.rows[0],
    });
  } catch (error) {
    console.error(
      '❌ MARK USER NOTIFICATION READ ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error marcando notificación como leída',
    });
  }
};

// =====================================================
// ✅ MARCAR TODAS COMO LEÍDAS
// =====================================================

exports.markAllNotificationsRead = async (
  req,
  res,
) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      UPDATE user_notifications
      SET
        is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
      WHERE user_id = $1
        AND is_read = FALSE
      RETURNING id
      `,
      [userId],
    );

    res.json({
      success: true,
      updated: result.rowCount,
    });
  } catch (error) {
    console.error(
      '❌ MARK ALL USER NOTIFICATIONS READ ERROR:',
      error,
    );

    res.status(500).json({
      error:
        'Error marcando notificaciones como leídas',
    });
  }
};
