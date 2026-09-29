import axios from "axios"
import { formatDate, formatPhoneToUser, logger } from "./utils"
import { WAMessage } from "@whiskeysockets/baileys"

export function sendHook(hookUrl: string, type: string, message: WAMessage) {
    const token = process.env.WEBHOOK_SECRET || ''
    const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? ''

    const body = {
        id: message.key.id,
        type: 'text',
        from: formatPhoneToUser(message.key.remoteJidAlt ?? message.key.remoteJid ?? ''),
        body: text,
        date: formatDate(Number(message.messageTimestamp)),
        timestamp: Number(message.messageTimestamp),
        name: message.pushName,
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