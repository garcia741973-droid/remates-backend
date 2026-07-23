const supportService =
    require('../services/supportService');

const deviceCommandService =
    require('../services/deviceCommandService');


/// =======================================
/// USUARIO
/// =======================================

async function createSupportRequest(
    req,
    res,
) {

    try {

        const userId =
            req.user.id;

        const {

            firebase_id,

            module,

            subject,

        } = req.body;

        const support =
            await supportService.createSupportRequest({

                userId,

                firebase_id,

                module,

                subject,

            });

        res.json({

            success: true,

            support,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            message:
                'Error creando conversación.',

        });

    }

}


async function getMySupportRequests(
    req,
    res,
) {

    try {

        const support =
            await supportService.getUserRequests(
                req.user.id,
            );

        res.json({

            success: true,

            support,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

        });

    }

}


/// =======================================
/// SUPER ADMIN
/// =======================================

async function getOpenSupportRequests(
    req,
    res,
) {

    try {

        const support =
            await supportService.getOpenRequests();

        res.json({

            success: true,

            support,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

        });

    }

}


async function resolveSupportRequest(
    req,
    res,
) {

    try {

        await supportService.resolveRequest(
            req.params.id,
        );

        res.json({

            success: true,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

        });

    }

}


/// =======================================
/// DEVICE COMMANDS
/// =======================================

async function sendDeviceCommand(
    req,
    res,
) {

    try {

        const command =
            await deviceCommandService.sendCommand(
                req.body,
            );

        res.json({

            success: true,

            command,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

        });

    }

}


async function getPendingDeviceCommand(
    req,
    res,
) {

    try {

        const command =
            await deviceCommandService.getPendingCommand(
                req.user.id,
            );

        res.json({

            success: true,

            command,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

        });

    }

}


async function confirmDeviceCommand(
    req,
    res,
) {

    try {

        await deviceCommandService.confirmCommand(
            req.params.id,
        );

        res.json({

            success: true,

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

        });

    }

}


module.exports = {

    createSupportRequest,

    getMySupportRequests,

    getOpenSupportRequests,

    resolveSupportRequest,

    sendDeviceCommand,

    getPendingDeviceCommand,

    confirmDeviceCommand,

};