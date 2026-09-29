import { jidDecode } from "@whiskeysockets/baileys"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const phoneMap = new Map<string, string>()
const phoneMapFile = join(process.cwd(), '.phone-map.json')

function loadPhoneMap(): void {
    try {
        const fileContent = readFileSync(phoneMapFile, 'utf-8')
        const entries = JSON.parse(fileContent) as Array<[string, string]>

        if (!Array.isArray(entries)) return

        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 2) continue

            const [phone, jid] = entry
            if (typeof phone !== 'string' || typeof jid !== 'string') continue

            phoneMap.set(phone, jid)
        }
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            logger('warning', 'Failed to load phone cache from disk', error)
        }
    }
}

export function savePhoneMap(): void {
    try {
        writeFileSync(phoneMapFile, JSON.stringify([...phoneMap.entries()], null, 2), 'utf-8')
    } catch (error) {
        logger('warning', 'Failed to persist phone cache to disk', error)
    }
}

loadPhoneMap()

export function setCachedPhone(phone: string, jid: string): void {
    const digits = phone.replace(/\D/g, '')
    if (!digits) return
    phoneMap.set(digits, jid)
    savePhoneMap()
}

export function getCachedPhone(phone: string): string | null {
    const digits = phone.replace(/\D/g, '')
    return phoneMap.get(digits) ?? null
}

export function logger(type: string, message: string, ...optionalParams: any[]): void {
    const colors: Record<string, string> = {
        reset: '\x1b[0m',
        warning: '\x1b[33m',
        error: '\x1b[31m',
        info: '\x1b[34m',
        auth: '\x1b[35m'
    }

    const levels: Record<string, (...args: any[]) => void> = {
        warning: console.warn,
        error: console.error,
        info: console.log,
        auth: console.log
    }

    const date = new Date().toLocaleString()
    const color = colors[type] || colors.reset
    const log = levels[type] || console.log

    log(`${color}[${date}] [${type.toUpperCase()}] ${message}${colors.reset}`, ...optionalParams)
}

export function formatPhoneToUser(phone: string): string {
    const parts = phone.split(':')
    return '+' + parts[0].replace('@s.whatsapp.net', '')
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString()
}

export function formatUptime(totalSeconds: number) {
    const days = Math.floor(totalSeconds / (3600 * 24))
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)
    return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

export async function getCachedJid(sock: any, phone: string) {
    const digits = phone.replace(/\D/g, '')
    const cached = phoneMap.get(digits)
    if (cached) return cached

    const resolved = await resolvePhoneToJid(sock, digits)
    if (resolved) {
        phoneMap.set(digits, resolved)
        savePhoneMap()
    }
    return resolved
}

export async function resolvePhoneToJid(sock: any, phone: string): Promise<string | null> {
    const digits = phone.replace(/\D/g, '')
    if (!digits) return null

    const pnJid = `${digits}@s.whatsapp.net`
    const [result] = await sock.onWhatsApp(pnJid)

    if (!result?.exists) return null
    const canonical = result.jid || pnJid

    try {
        const lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pnJid)
        if (lid) return lid
    } catch { }

    return canonical
}

export function extractPhoneFromJid(jid?: string | null): string | null {
    if (!jid) return null

    const decoded = jidDecode(jid)
    if (!decoded) return null

    const user = decoded.user
    const server = decoded.server

    if (server === 's.whatsapp.net' && user && /^\d+$/.test(user)) {
        return user
    }

    return null
}