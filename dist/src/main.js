"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const qrcode_terminal_1 = require("qrcode-terminal");
const pino_1 = __importDefault(require("pino"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const utils_1 = require("./utils");
const hook_1 = require("./hook");
const queue_1 = __importDefault(require("./queue"));
const button_helper_1 = require("@destroyer/button-helper");
let sock;
dotenv_1.default.config({ quiet: true });
function validateToken(req, res, next) {
    const authToken = process.env.AUTH_TOKEN;
    if (!authToken?.length) {
        return next();
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader?.length) {
        res.status(401).json({
            status: false,
            error: 'Missing auth token.'
        });
        return;
    }
    const token = authHeader.split(' ')[1];
    if (!token?.length || token !== authToken) {
        res.status(403).json({
            status: false,
            error: 'Invalid auth token.'
        });
        return;
    }
    return next();
}
async function connectToWhatsApp() {
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)('.auth');
    const pinoLogger = (0, pino_1.default)({ level: 'silent' });
    sock = (0, baileys_1.default)({
        auth: {
            creds: state.creds,
            keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys),
        },
        logger: pinoLogger,
        syncFullHistory: false,
    });
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
            if (shouldReconnect) {
                await connectToWhatsApp();
            }
            else {
                (0, utils_1.logger)('auth', 'Client disconnected. Please delete the .auth folder and restart the application to re-authenticate.');
            }
        }
        else if (connection === 'open') {
            const number = (0, utils_1.formatPhoneToUser)(sock.user?.phoneNumber ?? sock.user?.id ?? '');
            (0, utils_1.logger)('auth', 'Successfully authenticated.');
            (0, utils_1.logger)('auth', 'Client is ready.');
            (0, utils_1.logger)('auth', `Connected to WhatsApp with ${number}.`);
        }
        if (qr) {
            (0, utils_1.logger)('auth', 'Scan the QR Code below to connect to WhatsApp:');
            (0, qrcode_terminal_1.generate)(qr, { small: true });
        }
    });
    sock.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify')
            return;
        for (const m of event.messages) {
            if (m.key.fromMe)
                continue;
            const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? '';
            if (text && text.trim().toLowerCase() === '/ping') {
                const uptime = (0, utils_1.formatUptime)(process.uptime());
                await sock.sendMessage(String(m.key.remoteJid), { text: `🤖 Pong!\nUptime: ${uptime}` });
            }
            const hookUrl = process.env.WEBHOOK_URL;
            if (!hookUrl?.length)
                return;
            (0, hook_1.sendHook)(hookUrl, 'message_received', m);
        }
    });
    sock.ev.on('creds.update', saveCreds);
}
async function initializeServer() {
    const app = (0, express_1.default)();
    const PORT = process.env.PORT || 3000;
    app.use(express_1.default.json());
    app.use(validateToken);
    app.post('/send-message/:number', async (req, res) => {
        const { number } = req.params;
        const { message, buttons } = req.body;
        if (!number?.length) {
            res.status(400).json({
                status: false,
                error: 'Missing "number" parameter in URL.'
            });
            return;
        }
        if (!message?.length) {
            res.status(400).json({
                status: false,
                error: 'Missing "message" parameter in request body.'
            });
            return;
        }
        const formattedPhone = (0, utils_1.formatPhoneToUser)(number);
        try {
            const jid = await (0, utils_1.getCachedJid)(sock, number);
            if (jid) {
                (0, utils_1.logger)('info', `Queuing message "${message}" to ${formattedPhone}...`);
                queue_1.default.add(async () => {
                    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
                        await (0, button_helper_1.sendButtons)(sock, jid, {
                            text: message,
                            buttons: buttons.map((btn) => {
                                return {
                                    name: button_helper_1.InteractiveButtonName.CtaUrl,
                                    buttonParamsJson: JSON.stringify({
                                        display_text: btn.text,
                                        url: btn.url
                                    })
                                };
                            })
                        });
                    }
                    else {
                        await sock.sendMessage(jid, { text: message });
                    }
                    (0, utils_1.logger)('info', `Message sent to ${formattedPhone}.`);
                });
                res.status(201).json({
                    status: true,
                    message: `Message sent successfully to ${formattedPhone}.`
                });
            }
            else {
                res.status(404).json({
                    status: false,
                    error: `Number ${formattedPhone} is invalid or not registered on WhatsApp.`
                });
                return;
            }
        }
        catch (error) {
            (0, utils_1.logger)('error', `Failed to send message to ${formattedPhone}.`, error);
            res.status(500).json({
                status: false,
                error: `Error sending message to ${formattedPhone}.`,
                details: error?.message
            });
        }
    });
    app.listen(PORT, () => {
        (0, utils_1.logger)('info', `Server is running on port ${PORT}.`);
    });
}
connectToWhatsApp();
initializeServer();
