"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePhoneMap = savePhoneMap;
exports.setCachedPhone = setCachedPhone;
exports.getCachedPhone = getCachedPhone;
exports.logger = logger;
exports.formatPhoneToUser = formatPhoneToUser;
exports.formatDate = formatDate;
exports.formatUptime = formatUptime;
exports.getCachedJid = getCachedJid;
exports.resolvePhoneToJid = resolvePhoneToJid;
exports.extractPhoneFromJid = extractPhoneFromJid;
const baileys_1 = require("@whiskeysockets/baileys");
const fs_1 = require("fs");
const path_1 = require("path");
const phoneMap = new Map();
const phoneMapFile = (0, path_1.join)(process.cwd(), '.phone-map.json');
function loadPhoneMap() {
    try {
        const fileContent = (0, fs_1.readFileSync)(phoneMapFile, 'utf-8');
        const entries = JSON.parse(fileContent);
        if (!Array.isArray(entries))
            return;
        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2)
                continue;
            const [phone, jid] = entry;
            if (typeof phone !== 'string' || typeof jid !== 'string')
                continue;
            phoneMap.set(phone, jid);
        }
    }
    catch (error) {
        if (error?.code !== 'ENOENT') {
            logger('warning', 'Failed to load phone cache from disk', error);
        }
    }
}
function savePhoneMap() {
    try {
        (0, fs_1.writeFileSync)(phoneMapFile, JSON.stringify([...phoneMap.entries()], null, 2), 'utf-8');
    }
    catch (error) {
        logger('warning', 'Failed to persist phone cache to disk', error);
    }
}
loadPhoneMap();
function setCachedPhone(phone, jid) {
    const digits = phone.replace(/\D/g, '');
    if (!digits)
        return;
    phoneMap.set(digits, jid);
    savePhoneMap();
}
function getCachedPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return phoneMap.get(digits) ?? null;
}
function logger(type, message, ...optionalParams) {
    const colors = {
        reset: '\x1b[0m',
        warning: '\x1b[33m',
        error: '\x1b[31m',
        info: '\x1b[34m',
        auth: '\x1b[35m'
    };
    const levels = {
        warning: console.warn,
        error: console.error,
        info: console.log,
        auth: console.log
    };
    const date = new Date().toLocaleString();
    const color = colors[type] || colors.reset;
    const log = levels[type] || console.log;
    log(`${color}[${date}] [${type.toUpperCase()}] ${message}${colors.reset}`, ...optionalParams);
}
function formatPhoneToUser(phone) {
    const parts = phone.split(':');
    return '+' + parts[0].replace('@s.whatsapp.net', '');
}
function formatDate(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}
function formatUptime(totalSeconds) {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
async function getCachedJid(sock, phone) {
    const digits = phone.replace(/\D/g, '');
    const cached = phoneMap.get(digits);
    if (cached)
        return cached;
    const resolved = await resolvePhoneToJid(sock, digits);
    if (resolved) {
        phoneMap.set(digits, resolved);
        savePhoneMap();
    }
    return resolved;
}
async function resolvePhoneToJid(sock, phone) {
    const digits = phone.replace(/\D/g, '');
    if (!digits)
        return null;
    const pnJid = `${digits}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(pnJid);
    if (!result?.exists)
        return null;
    const canonical = result.jid || pnJid;
    try {
        const lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pnJid);
        if (lid)
            return lid;
    }
    catch { }
    return canonical;
}
function extractPhoneFromJid(jid) {
    if (!jid)
        return null;
    const decoded = (0, baileys_1.jidDecode)(jid);
    if (!decoded)
        return null;
    const user = decoded.user;
    const server = decoded.server;
    if (server === 's.whatsapp.net' && user && /^\d+$/.test(user)) {
        return user;
    }
    return null;
}
