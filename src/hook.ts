import axios from "axios"
import { extractPhoneFromJid, formatDate, getCachedPhone, hashString, logger, setCachedPhone } from "./utils"
import { WAMessage } from "@whiskeysockets/baileys"

export async function sendHook(hookUrl: string, type: string, message: WAMessage) {
    try {
        const token = process.env.WEBHOOK_SECRET || ''
        const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? ''

        const directJid = message.key.remoteJid ?? ''
        const altJid = message.key.remoteJidAlt ?? ''
        const preferredJid = altJid || directJid

        const phoneNumber =
            extractPhoneFromJid(preferredJid) ??
            extractPhoneFromJid(directJid) ??
            getCachedPhone(preferredJid || directJid) ??
            null

        if (phoneNumber) {
            setCachedPhone(phoneNumber, preferredJid || directJid)
        }

        const body = {
            id: message.key.id,
            number: phoneNumber ? `+${phoneNumber}` : null,
            body: text,
            date: formatDate(Number(message.messageTimestamp)),
            timestamp: Number(message.messageTimestamp),
            name: message.pushName,
            jid: preferredJid || directJid,
        }

        const hash = await hashString(String(body.id))

        axios.post(hookUrl, {
            id: hash,
            type,
            data: body
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }).then(() => {
            logger('success', `"${type}" hook sent successfully.`)
        }).catch((error) => {
            logger('error', `Failed to sent "${type}" hook.`, error)
        })
    } catch (error) {
        logger('error', `Failed to sent "${type}" hook.`, error)
    }
}