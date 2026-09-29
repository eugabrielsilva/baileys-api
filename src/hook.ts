import axios from "axios"
import { extractPhoneFromJid, formatDate, getCachedPhone, logger, setCachedPhone } from "./utils"
import { WAMessage } from "@whiskeysockets/baileys"

export function sendHook(hookUrl: string, type: string, message: WAMessage) {
    const token = process.env.WEBHOOK_SECRET || ''
    const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? ''

    const directJid = message.key.remoteJid ?? ''
    const altJid = message.key.remoteJidAlt ?? ''
    const preferredJid = altJid || directJid

    const fromPhone =
        extractPhoneFromJid(preferredJid) ??
        extractPhoneFromJid(directJid) ??
        getCachedPhone(preferredJid || directJid) ??
        null

    if (fromPhone) {
        setCachedPhone(fromPhone, preferredJid || directJid)
    }

    const body = {
        id: message.key.id,
        type: 'text',
        from: fromPhone ? `+${fromPhone}` : null,
        body: text,
        date: formatDate(Number(message.messageTimestamp)),
        timestamp: Number(message.messageTimestamp),
        name: message.pushName,
        jid: preferredJid || directJid,
    }

    axios.post(hookUrl, {
        type,
        data: body
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }).then(() => {
        logger('info', `"${type}" hook sent successfully.`)
    }).catch((error: Error) => {
        logger('error', `Failed to sent "${type}" hook.`, error)
    })
}