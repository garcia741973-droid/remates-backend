const { pool } =
    require('../config/db');

/// 🔥 OBTENER PLANES ACTIVOS
exports.getPlans = async (req, res) => {

    try {

        const result = await pool.query(`

            SELECT *
            FROM promotion_plans
            WHERE is_active = true
            ORDER BY priority DESC

        `);

        res.json(result.rows);

    } catch (err) {

        console.log(
            '❌ GET PLANS ERROR',
            err,
        );

        res.status(500).json({
            error: 'Error obteniendo planes',
        });
    }
};

/// 🔥 CREAR SOLICITUD PROMOCIÓN
exports.createPromotionRequest = async (
    req,
    res,
) => {

    try {

        const userId =
            req.user.user_id;

        const companyId =
            req.user.company_id;

        const {

            promotion_plan_id,

            entity_type,

            entity_id,

            payment_proof_url,

        } = req.body;

        /// 🔥 OBTENER PLAN
        const planResult =
            await pool.query(

                `
                SELECT *
                FROM promotion_plans
                WHERE id = $1
                `,
                [promotion_plan_id],
            );

        if (
            planResult.rows.length === 0
        ) {

            return res.status(404).json({
                error: 'Plan no encontrado',
            });
        }

        const plan =
            planResult.rows[0];

        /// 🔥 CREAR SOLICITUD
        const result =
            await pool.query(

                `
                INSERT INTO promotion_requests
                (
                    company_id,
                    user_id,
                    promotion_plan_id,
                    entity_type,
                    entity_id,
                    payment_proof_url,
                    amount
                )
                VALUES
                (
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

                    userId,

                    promotion_plan_id,

                    entity_type,

                    entity_id,

                    payment_proof_url,

                    plan.price,
                ],
            );

        res.json({
            success: true,
            request: result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ CREATE PROMOTION ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error creando promoción',
        });
    }
};

/// 🔥 ADMIN APROBAR PROMOCIÓN
exports.approvePromotion =
    async (req, res) => {

        try {

            const { id } =
                req.params;

            /// 🔥 BUSCAR REQUEST
            const requestResult =
                await pool.query(

                    `
                    SELECT
                        pr.*,
                        pp.days,
                        pp.priority
                    FROM promotion_requests pr
                    JOIN promotion_plans pp
                    ON pp.id = pr.promotion_plan_id
                    WHERE pr.id = $1
                    `,
                    [id],
                );

            if (
                requestResult.rows.length === 0
            ) {

                return res.status(404).json({
                    error:
                        'Solicitud no encontrada',
                });
            }

            const request =
                requestResult.rows[0];

            /// 🔥 CALCULAR FECHAS
            const startDate =
                new Date();

            const endDate =
                new Date();

            endDate.setDate(
                endDate.getDate() +
                    request.days,
            );

            /// 🔥 ACTUALIZAR REQUEST
            await pool.query(

                `
                UPDATE promotion_requests
                SET
                    status = 'approved',
                    starts_at = $1,
                    ends_at = $2,
                    approved_at = NOW()
                WHERE id = $3
                `,
                [
                    startDate,
                    endDate,
                    id,
                ],
            );

            /// 🔥 SI ES LOTE
            if (
                request.entity_type ===
                'lot'
            ) {

                await pool.query(

                    `
                    UPDATE lots
                    SET
                        promoted_until = $1,
                        promotion_priority = $2
                    WHERE id = $3
                    `,
                    [
                        endDate,
                        request.priority,
                        request.entity_id,
                    ],
                );
            }

            res.json({
                success: true,
            });

        } catch (err) {

            console.log(
                '❌ APPROVE PROMOTION ERROR',
                err,
            );

            res.status(500).json({
                error:
                    'Error aprobando promoción',
            });
        }
    };

/// 🔥 ADMIN LISTAR SOLICITUDES
exports.getPromotionRequests =
    async (req, res) => {

        try {

            const result =
                await pool.query(`

                SELECT

                    pr.*,

                    pp.name as plan_name,
                    pp.days,
                    pp.priority,

                    l.class,
                    l.breed,
                    l.department,
                    l.municipality,

                    l.images[1] as image

                FROM promotion_requests pr

                JOIN promotion_plans pp
                ON pp.id = pr.promotion_plan_id

                LEFT JOIN lots l
                ON l.id = pr.entity_id

                ORDER BY pr.created_at DESC

            `);

            res.json(result.rows);

        } catch (err) {

            console.log(
                '❌ GET PROMOTION REQUESTS ERROR',
                err,
            );

            res.status(500).json({
                error:
                    'Error obteniendo solicitudes',
            });
        }
    };