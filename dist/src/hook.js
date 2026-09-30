"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendHook = sendHook;
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("./utils");
function sendHook(hookUrl, type, message) {
    const token = process.env.WEBHOOK_SECRET || '';
    const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? '';
    const directJid = message.key.remoteJid ?? '';
    const altJid = message.key.remoteJidAlt ?? '';
    const preferredJid = altJid || directJid;
    const fromPhone = (0, utils_1.extractPhoneFromJid)(preferredJid) ??
        (0, utils_1.extractPhoneFromJid)(directJid) ??
        (0, utils_1.getCachedPhone)(preferredJid || directJid) ??
        null;
    if (fromPhone) {
        (0, utils_1.setCachedPhone)(fromPhone, preferredJid || directJid);
    }
    const body = {
        id: message.key.id,
        type: 'text',
        from: fromPhone ? `+${fromPhone}` : null,
        body: text,
        date: (0, utils_1.formatDate)(Number(message.messageTimestamp)),
        timestamp: Number(message.messageTimestamp),
        name: message.pushName,
        jid: preferredJid || directJid,
    };
    axios_1.default.post(hookUrl, {
        type,
        data: body
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }).then(() => {
        (0, utils_1.logger)('info', `"${type}" hook sent successfully.`);
    }).catch((error) => {
        (0, utils_1.logger)('error', `Failed to sent "${type}" hook.`, error);
    });
}
