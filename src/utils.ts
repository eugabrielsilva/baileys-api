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

export function formatPhoneToClient(phone: string): string {
    return phone.replace(/\D/g, '') + '@s.whatsapp.net';
}

export function formatPhoneToUser(phone: string): string {
    return '+' + phone.replace('@s.whatsapp.net', '')
}

export function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString()
}