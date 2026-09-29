import axios from "axios"
import { formatDate, formatPhoneToUser, logger } from "./utils"
import { WAMessage } from "@whiskeysockets/baileys"

export function sendHook(hookUrl: string, type: string, message: WAMessage) {
    const token = process.env.WEBHOOK_SECRET || ''

    const body = {
        id: message.key.id,
        type: 'text',
        from: formatPhoneToUser(message.key.remoteJidAlt || message.key.remoteJid || ''),
        body: message.message?.extendedTextMessage?.text,
        date: formatDate(message.messageTimestamp as number),
        timestamp: message.messageTimestamp,
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