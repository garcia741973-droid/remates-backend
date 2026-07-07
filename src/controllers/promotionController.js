const { pool } =
    require('../config/db');

    const {
    sendAdminNotification,
} = require(
    '../services/notificationService'
);

const {
    analyzePaymentProof,
} = require(
    '../services/paymentAiService'
);

const {
    buildPaymentAudit,
} = require(
    '../services/paymentAuditService'
);

/// 🔥 OBTENER PLANES ACTIVOS
exports.getPlans = async (req, res) => {

    try {

        const { type } = req.query;

        let sql = `
            SELECT *
            FROM promotion_plans
            WHERE is_active = true
        `;

        const values = [];

        if (type) {

            sql += `
                AND type = $1
            `;

            values.push(type);
        }

        sql += `
            ORDER BY priority DESC
        `;

        const result =
            await pool.query(
                sql,
                values,
            );

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
                    amount
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6
                )
                RETURNING *
                `,
                [

                    companyId,

                    userId,

                    promotion_plan_id,

                    entity_type,

                    entity_id,

                    plan.price,
                ],
            );

            /// 🔥 NOTIFICAR SUPER ADMIN
            await sendAdminNotification({

                title:
                    '⭐ Nueva solicitud premium',

                body:
                    `Usuario ${userId} solicitó promoción para lote ${entity_id}`,

                data: {

                    type: 'premium_request',

                    request_id:
                        result.rows[0].id.toString(),

                    entity_id:
                        entity_id.toString(),
                },
            });

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

            /// 🔥 VALIDAR LIMITE DESTACADOS
            if (
                request.entity_type === 'lot'
            ) {

                /// 🔥 SOLO DESTACADOS NORMALES
                if (request.priority < 2) {

                    const activeResult =
                        await pool.query(

                            `
                            SELECT COUNT(*) as total
                            FROM lots
                            WHERE

                                promotion_priority = 1

                                AND promoted_until IS NOT NULL

                                AND promoted_until > NOW()
                            `
                        );

                    const activeTotal =
                        parseInt(
                            activeResult.rows[0].total
                        );

                    console.log(
                        '🔥 ACTIVE NORMAL FEATURED:',
                        activeTotal,
                    );

                    if (activeTotal >= 10) {

                        return res.status(400).json({

                            error:
                                'Ya existen 10 destacados activos',
                        });
                    }
                }
            }

            /// 🔥 CALCULAR FECHAS
            const startDate =
                new Date();

            const endDate =
                new Date();

            endDate.setDate(
                endDate.getDate() +
                    request.days,
            );


            /// 🔥 VALIDAR CUPOS ACTIVOS

            const activeResult =
                await pool.query(

                    `
                    SELECT COUNT(*) as total
                    FROM lots
                    WHERE

                        promoted_until IS NOT NULL

                        AND promoted_until > NOW()
                    `
                );

            const activeTotal =
                parseInt(
                    activeResult.rows[0].total,
                );

            if (activeTotal >= 10) {

                return res.status(400).json({

                    error:
                        'No hay espacios disponibles en destacados',
                });
            }

            /// 🔥 VALIDAR PREMIUM
            if (request.priority >= 2) {

                const premiumResult =
                    await pool.query(

                        `
                        SELECT COUNT(*) as total
                        FROM lots
                        WHERE

                            promotion_priority >= 2

                            AND promoted_until IS NOT NULL

                            AND promoted_until > NOW()
                        `
                    );

                const premiumTotal =
                    parseInt(
                        premiumResult.rows[0].total,
                    );

                if (premiumTotal >= 3) {

                    return res.status(400).json({

                        error:
                            'No hay espacios premium disponibles',
                    });
                }
            }

            /// 🔥 SI ES LOTE
            if (
                request.entity_type ===
                'lot'
            ) {

                console.log(
                    '🔥 PROMOTING LOT:',
                    request.entity_id,
                );

                console.log(
                    '🔥 PRIORITY:',
                    request.priority,
                );

                console.log(
                    '🔥 END DATE:',
                    endDate,
                );

                const updateResult =
                    await pool.query(

                        `
                        UPDATE lots
                        SET
                            promoted_until = $1,
                            promotion_priority = $2
                        WHERE id = $3
                        RETURNING *
                        `,
                        [
                            endDate,
                            request.priority,
                            request.entity_id,
                        ],
                    );


                    
                console.log(
                    '🔥 LOT UPDATED:',
                    updateResult.rows[0],
                );
            }

            /// 🔥 ACTUALIZAR REQUEST
            await pool.query(

                `
                UPDATE promotion_requests
                SET

                    status = 'approved',

                    is_visible = true,

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

            /// 🔥 REGISTRAR INGRESO EN CAJA
            await pool.query(

                `
                INSERT INTO cash_movements
                (
                    company_id,
                    type,
                    category,
                    amount,
                    description,
                    reference_type,
                    reference_id,
                    proof_url,
                    created_by
                )

                VALUES
                (
                    $1,
                    'income',
                    'destacados',
                    $2,
                    $3,
                    'promotion',
                    $4,
                    $5,
                    $6
                )
                `,
                [

                    request.company_id,

                    request.amount || 0,

                    `Promoción lote #${request.entity_id}`,

                    request.id,

                    request.payment_proof_url,

                    req.user.user_id,
                ],
            );

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

/// 🔥 ADMIN LISTAR PROMOCIONES
exports.getPromotionRequests =
    async (req, res) => {

    try {

        const result =
            await pool.query(

                `
                SELECT

                    pr.*,

                    pp.name as plan_name,

                    pp.type,

                    pp.days,

                    pp.priority as promotion_priority,

                    c.name as company_name,

                    l.lot_number,

                    l.images,

                    l.class,

                    l.breed,

                    l.promoted_until,

                    COALESCE(
                        u.full_name,
                        u.name
                    ) as seller_name

                FROM promotion_requests pr

                JOIN promotion_plans pp
                    ON pp.id =
                        pr.promotion_plan_id

                LEFT JOIN companies c
                    ON c.id =
                        pr.company_id

                LEFT JOIN lots l
                    ON l.id =
                        pr.entity_id

                LEFT JOIN users u
                    ON u.id =
                        l.seller_id

                WHERE

                    pr.entity_type = 'lot'

                    AND pp.type =
                        'featured_lot'

                ORDER BY

                    pr.created_at DESC
                `
            );

        res.json(
            result.rows,
        );

    } catch (err) {

        console.log(
            '❌ GET PROMOTION REQUESTS ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo promociones',
        });
    }
};

/// 🔥 SUBIR COMPROBANTE
exports.uploadProof = async (
    req,
    res,
) => {

    try {

const { id } = req.params;

const {
    payment_proof_url,
} = req.body;

/// 🔥 OBTENER SOLICITUD
const requestResult =
    await pool.query(
        `
        SELECT
            pr.*,
            pp.price,
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

/// 🤖 ANALIZAR COMPROBANTE CON IA
const aiResult =
    await analyzePaymentProof({

        proofImageUrl:
            payment_proof_url,

        expectedAmount:
            Number(request.price),
    });

console.log(
    '🤖 AI RESULT:',
    aiResult,
);

const paymentStatus =
    aiResult.status;

        await pool.query(

            `
            UPDATE promotion_requests
            SET
                payment_proof_url = $1,
                status = 'pending_approval'
            WHERE id = $2
            `,
            [
                payment_proof_url,
                id,
            ],
        );

        /// 🔥 PUSH SUPER ADMIN
        await sendAdminNotification({

            title:
                'Nuevo pago destacado 💰',

            body:
                'Un usuario subió comprobante para promoción de lote',

            data: {

                type:
                    'featured_payment',

                promotion_request_id:
                    id,
            },
        });

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ UPLOAD PROOF ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error subiendo comprobante',
        });
    }
};

/// 🔥 CANCELAR PROMOCIÓN
exports.cancelPromotion =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        /// 🔥 BUSCAR REQUEST
        const result =
            await pool.query(

                `
                SELECT *
                FROM promotion_requests
                WHERE id = $1
                LIMIT 1
                `,
                [id],
            );

        if (
            result.rows.length === 0
        ) {

            return res.status(404).json({

                error:
                    'Promoción no encontrada',
            });
        }

        const request =
            result.rows[0];

        /// 🔥 CANCELAR REQUEST
        await pool.query(

            `
            UPDATE promotion_requests
            SET
                status = 'cancelled'
            WHERE id = $1
            `,
            [id],
        );

        /// 🔥 SI ES LOTE
        if (
            request.entity_type === 'lot'
        ) {

            await pool.query(

                `
                UPDATE lots
                SET

                    promoted_until = NULL,

                    promotion_priority = 0

                WHERE id = $1
                `,
                [
                    request.entity_id,
                ],
            );
        }

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ CANCEL PROMOTION ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error cancelando promoción',
        });
    }
};

/// 🔥 STATS PROMOCIONES ACTIVAS
exports.getActivePromotionsStats =
    async (req, res) => {

    try {

        /// 🔥 DESTACADOS NORMALES
        const featuredResult =
            await pool.query(

                `
                SELECT COUNT(*) as total
                FROM lots
                WHERE

                    promotion_priority = 1

                    AND promoted_until IS NOT NULL

                    AND promoted_until > NOW()
                `
            );

        const featuredTotal =
            parseInt(
                featuredResult.rows[0].total
            );

        /// 🔥 PREMIUM
        const premiumResult =
            await pool.query(

                `
                SELECT COUNT(*) as total
                FROM lots
                WHERE

                    promotion_priority >= 2

                    AND promoted_until IS NOT NULL

                    AND promoted_until > NOW()
                `
            );

        const premiumTotal =
            parseInt(
                premiumResult.rows[0].total
            );

        /// 🔥 TOTAL GENERAL
        const total =
            featuredTotal + premiumTotal;

        /// 🔥 LISTA ACTIVAS
        const promotionsResult =
            await pool.query(

                `
                    SELECT

                        l.id,

                        l.lot_number,

                        l.class,

                        l.breed,

                        l.base_price,

                        l.images,

                        l.images[1] as image_url,

                        l.promoted_until,

                        l.promotion_priority,

                    COALESCE(
                        u.full_name,
                        u.name
                    ) as seller_name

                FROM lots l

                LEFT JOIN users u
                    ON u.id = l.seller_id

                WHERE

                    l.promoted_until IS NOT NULL

                    AND l.promoted_until > NOW()

                ORDER BY

                    l.promotion_priority DESC,

                    l.promoted_until ASC
                `
            );

            res.json({

                total,

                featured_total:
                    featuredTotal,

                featured_limit: 10,

                featured_available:
                    10 - featuredTotal,

                premium_total:
                    premiumTotal,

                premium_limit: 3,

                premium_available:
                    3 - premiumTotal,

                promotions:
                    promotionsResult.rows,
            });

    } catch (err) {

        console.log(
            '❌ ACTIVE PROMO STATS ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo estadísticas',
        });
    }
};

/// 🔥 CREAR PLAN
exports.createPlan = async (
    req,
    res,
) => {

    try {

        const {

            type,

            name,            

            description,

            days,

            price,

            priority,

            badge_color,

        } = req.body;

        const result =
            await pool.query(

                `
                INSERT INTO promotion_plans
                (
                    type,
                    name,
                    description,
                    days,
                    price,
                    priority,
                    badge_color,
                    is_active
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
                    true
                )
                RETURNING *
                `,
                [

                    type,

                    name,

                    description,

                    days,

                    price,

                    priority,

                    badge_color,
                ],
            );

        res.json({
            success: true,
            plan: result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ CREATE PLAN ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error creando plan',
        });
    }
};

/// 🔥 EDITAR PLAN
exports.updatePlan = async (
    req,
    res,
) => {

    try {

        const { id } =
            req.params;

        const {

            name,

            description,

            days,

            price,

            priority,

            badge_color,

        } = req.body;

        const result =
            await pool.query(

                `
                UPDATE promotion_plans
                SET

                    name = $1,

                    description = $2,

                    days = $3,

                    price = $4,

                    priority = $5,

                    badge_color = $6

                WHERE id = $7

                RETURNING *
                `,
                [

                    name,

                    description,

                    days,

                    price,

                    priority,

                    badge_color,

                    id,
                ],
            );

        res.json({
            success: true,
            plan: result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ UPDATE PLAN ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error actualizando plan',
        });
    }
};

/// 🔥 ACTIVAR / DESACTIVAR PLAN
exports.togglePlan = async (
    req,
    res,
) => {

    try {

        const { id } =
            req.params;

        const result =
            await pool.query(

                `
                UPDATE promotion_plans
                SET
                    is_active = NOT is_active
                WHERE id = $1
                RETURNING *
                `,
                [id],
            );

        res.json({
            success: true,
            plan: result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ TOGGLE PLAN ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error cambiando estado',
        });
    }
};

/// ❌ RECHAZAR PROMOCIÓN
exports.rejectPromotion =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const requestResult =
            await pool.query(

                `
                SELECT *
                FROM promotion_requests
                WHERE id = $1
                LIMIT 1
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

        /// 🔥 ACTUALIZAR REQUEST
        await pool.query(

            `
            UPDATE promotion_requests
            SET

                status = 'rejected',

                rejected_at = NOW()

            WHERE id = $1
            `,
            [id],
        );

        /// 🔥 LIMPIAR LOTE
        if (
            request.entity_type ===
            'lot'
        ) {

            await pool.query(

                `
                UPDATE lots
                SET

                    promoted_until = NULL,

                    promotion_priority = 0

                WHERE id = $1
                `,
                [
                    request.entity_id,
                ],
            );
        }

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ REJECT PROMOTION ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error rechazando promoción',
        });
    }
};

/// 👁️ TOGGLE VISIBILITY
exports.togglePromotionVisibility =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const {
            is_visible,
        } = req.body;

        const result =
            await pool.query(

                `
                UPDATE promotion_requests
                SET
                    is_visible = $1
                WHERE id = $2
                RETURNING *
                `,
                [
                    is_visible,
                    id,
                ],
            );

        res.json({
            success: true,
            promotion:
                result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ TOGGLE VISIBILITY ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error actualizando visibilidad',
        });
    }
};

/// ⭐ TOGGLE SPONSOR
exports.toggleSponsor =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const {
            sponsor,
        } = req.body;

        const result =
            await pool.query(

                `
                UPDATE promotion_requests
                SET
                    sponsor = $1
                WHERE id = $2
                RETURNING *
                `,
                [
                    sponsor,
                    id,
                ],
            );

        res.json({
            success: true,
            promotion:
                result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ TOGGLE SPONSOR ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error actualizando sponsor',
        });
    }
};

/// 🔥 UPDATE PRIORITY
exports.updatePromotionPriority =
    async (req, res) => {
    
    try {

        const { id } =
            req.params;

        const {
            priority,
        } = req.body;

        const result =
            await pool.query(

                `
                UPDATE promotion_requests
                SET
                    priority = $1
                WHERE id = $2
                RETURNING *
                `,
                [
                    priority,
                    id,
                ],
            );

        res.json({
            success: true,
            promotion:
                result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ UPDATE PRIORITY ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error actualizando prioridad',
        });
    }
};

/// ✏️ UPDATE PROMOTION
exports.updatePromotion =
    async (req, res) => {

    console.log(
        '🔥🔥🔥 UPDATE PROMOTION ENDPOINT HIT'
    );

    try {

        const { id } =
            req.params;

        console.log(
            '🔥 PARAM ID:',
            id,
        );

        console.log(
            '🔥 BODY RECEIVED:',
            req.body,
        );

        const {

            title,

            description,

            redirect_url,

            whatsapp,

            button_text,

            priority,

            sponsor,

            is_visible,

            starts_at,

            ends_at,

        } = req.body;

        console.log(
            '🔥 STARTS_AT:',
            starts_at,
        );

        console.log(
            '🔥 ENDS_AT:',
            ends_at,
        );

        const result =
            await pool.query(

                `
                UPDATE promotion_requests
                SET

                    title = $1,

                    description = $2,

                    redirect_url = $3,

                    whatsapp = $4,

                    button_text = $5,

                    priority = $6,

                    sponsor = $7,

                    is_visible = $8,

                    starts_at = $9,

                    ends_at = $10

                WHERE id = $11

                RETURNING *
                `,
                [

                    title,

                    description,

                    redirect_url,

                    whatsapp,

                    button_text,

                    priority,

                    sponsor,

                    is_visible,

                    starts_at,

                    ends_at,

                    id,
                ]
            );

        console.log(
            '🔥 PROMOTION UPDATED:',
            id,
        );

        console.log(
            '🔥 UPDATED DATA:',
            result.rows[0]
        );

        res.json({

            success: true,

            promotion:
                result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ UPDATE PROMOTION ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error actualizando promoción',
        });
    }
};

/// 🏠 HOME BANNERS
exports.getHomeBanners =
    async (req, res) => {

    try {

        const company_id =
            req.user?.company_id || 1;

        /// 🔥 MAIN BANNERS
        const mainResult =
            await pool.query(

                `
                SELECT

                    pr.*,

                    pp.type,

                    pp.priority

                FROM promotion_requests pr

                JOIN promotion_plans pp
                    ON pp.id =
                        pr.promotion_plan_id

                    WHERE

                        (
                            pr.company_id = $1
                            OR pr.company_id IS NULL
                        )

                        AND pr.status = 'approved'

                        AND pr.is_visible = true

                        AND pr.ends_at > NOW()

                        AND pp.type =
                            'home_banner_main'

                        ORDER BY

                            pr.sponsor DESC,

                            pr.priority DESC,

                            pp.priority DESC,

                            pr.created_at DESC

                LIMIT 10
                `,
                [company_id],
            );

        /// 🔥 SMALL BANNERS
        const smallResult =
            await pool.query(

                `
                SELECT

                    pr.*,

                    pp.type,

                    pp.priority

                FROM promotion_requests pr

                JOIN promotion_plans pp
                    ON pp.id =
                        pr.promotion_plan_id

                WHERE

                    (
                        pr.company_id = $1
                        OR pr.company_id IS NULL
                    )

                    AND pr.status = 'approved'

                    AND pr.ends_at > NOW()

                    AND pp.type =
                        'home_banner_small'

                    AND pr.is_visible = true    

                    ORDER BY

                        pr.sponsor DESC,

                        pr.priority DESC,

                        pp.priority DESC,

                        pr.created_at DESC

                LIMIT 20
                `,
                [company_id],
            );

        res.json({

            main_banners:
                mainResult.rows,

            small_banners:
                smallResult.rows,
        });

    } catch (err) {

        console.log(
            '❌ HOME BANNERS ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo banners',
        });
    }
};

/// 📢 CREAR CAMPAÑA PUBLICITARIA
exports.createAdCampaign =
    async (req, res) => {

    try {

        console.log(
            '🔥 CREATE AD BODY 👉',
            req.body,
        );

        console.log(
            '🔥 USER 👉',
            req.user,
        );

        const companyId =
            req.user.company_id || null;

        const userId =
            req.user.user_id;

        const {

            type,

            title,

            description,

            image_url,

            redirect_url,

            button_text,

            whatsapp,

            days,

            amount,

        } = req.body;

        /// 🔥 VALIDAR TIPO
        const allowedTypes = [

            'home_banner_main',

            'home_banner_small',

            'search_banner',

            'auction_banner',

            'seller_boost',
        ];

        if (
            !allowedTypes.includes(type)
        ) {

            return res.status(400).json({

                error:
                    'Tipo inválido',
            });
        }

        /// 🔥 BUSCAR PLAN
        const planResult =
            await pool.query(

                `
                SELECT *
                FROM promotion_plans
                WHERE type = $1
                AND is_active = true
                ORDER BY priority DESC
                LIMIT 1
                `,
                [type],
            );

        if (
            planResult.rows.length === 0
        ) {

            return res.status(404).json({

                error:
                    'No existe plan para este tipo',
            });
        }

        const plan =
            planResult.rows[0];

        /// 🔥 FECHAS

        let startDate =
            new Date();

        let endDate =
            new Date();

        /// 🔥 SI VIENEN FECHAS MANUALES
        if (
            req.body.starts_at &&
            req.body.ends_at
        ) {

            startDate =
                new Date(req.body.starts_at);

            endDate =
                new Date(req.body.ends_at);

        } else {

            /// 🔥 MODO POR DÍAS
            const totalDays =
                parseInt(days);

            if (
                isNaN(totalDays) ||
                totalDays <= 0
            ) {

                return res.status(400).json({

                    error:
                        'Cantidad de días inválida',
                });
            }

            endDate.setDate(
                endDate.getDate() +
                    totalDays,
            );
        }

        /// 🔥 VALIDAR FECHAS
        if (
            isNaN(startDate.getTime()) ||
            isNaN(endDate.getTime())
        ) {

            return res.status(400).json({

                error:
                    'Fechas inválidas',
            });
        }

        /// 🔥 INSERT
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

                    status,

                    starts_at,

                    ends_at,

                    approved_at,

                    amount,

                    title,

                    description,

                    image_url,

                    redirect_url,

                    button_text,

                    whatsapp
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,

                    'advertising',

                    NULL,

                    'approved',

                    $4,

                    $5,

                    NOW(),

                    $6,

                    $7,

                    $8,

                    $9,

                    $10,

                    $11,

                    $12
                )
                RETURNING *
                `,
                [

                    companyId,

                    userId,

                    plan.id,

                    startDate,

                    endDate,

                    amount,

                    title,

                    description,

                    image_url,

                    redirect_url,

                    button_text,

                    whatsapp,
                ],
            );

        console.log(
            '🔥 CAMPAIGN CREATED 👉',
            result.rows[0],
        );

        res.json({

            success: true,

            campaign:
                result.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ CREATE AD CAMPAIGN ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error creando campaña',
        });
    }
};

/// 👁 INCREMENT IMPRESSION
exports.incrementImpression =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        await pool.query(

            `
            UPDATE promotion_requests
            SET impressions =
                COALESCE(impressions, 0) + 1
            WHERE id = $1
            `,
            [id]
        );

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ IMPRESSION ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error incrementando impression',
        });
    }
};

/// 🖱 INCREMENT CLICK
exports.incrementClick =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        await pool.query(

            `
            UPDATE promotion_requests
            SET clicks =
                COALESCE(clicks, 0) + 1
            WHERE id = $1
            `,
            [id]
        );

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ CLICK ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error incrementando click',
        });
    }
};
/// 🧹 CLEAN EXPIRED CAMPAIGNS
exports.cleanExpiredCampaigns =
    async () => {

    try {

        const result =
            await pool.query(

                `
                UPDATE promotion_requests

                SET

                    is_visible = false,

                    status = 'expired'

                WHERE

                    entity_type = 'advertising'

                    AND status = 'approved'

                    AND is_visible = true

                    AND ends_at IS NOT NULL

                    AND ends_at < NOW()

                RETURNING id
                `
            );

        console.log(

            '🧹 EXPIRED CAMPAIGNS CLEANED:',

            result.rowCount,
        );

    } catch (err) {

        console.log(

            '❌ CLEAN EXPIRED CAMPAIGNS ERROR',

            err,
        );
    }
};