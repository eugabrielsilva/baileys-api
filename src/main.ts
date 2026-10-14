import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { generate } from 'qrcode-terminal'
import P from 'pino'
import dotenv from 'dotenv'
import express, { NextFunction, Request, Response } from 'express'
import { formatPhoneToUser, formatUptime, getCachedJid, logger } from './utils'
import { sendHook } from './hook'
import Queue from './queue'
import { InteractiveButtonName, sendButtons } from '@destroyer/button-helper'
import { rmSync } from 'fs'

let sock: ReturnType<typeof makeWASocket>
dotenv.config({ quiet: true })

function validateToken(req: Request, res: Response, next: NextFunction) {
    const authToken = process.env.AUTH_TOKEN

    if (!authToken?.length) {
        return next()
    }

    const authHeader = req.headers['authorization']

    if (!authHeader?.length) {
        res.status(400).json({
            status: false,
            error: 'Missing auth token header.'
        })
        return
    }

    const token = authHeader.split(' ')[1]

    if (!token?.length || token !== authToken) {
        res.status(401).json({
            status: false,
            error: 'Invalid auth token header.'
        })
        return
    }

    return next()
}

async function connectToWhatsApp() {
    logger('auth', 'Connecting to WhatsApp client...')

    const { state, saveCreds } = await useMultiFileAuthState('.auth')
    const pinoLogger = P({ level: 'silent' })

    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys),
        },
        logger: pinoLogger,
        syncFullHistory: false,
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 120000,
        enableAutoSessionRecreation: true,
        enableRecentMessageCache: false,
        keepAliveIntervalMs: 25000,
    })

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            if (shouldReconnect) {
                await connectToWhatsApp()
            } else {
                rmSync('.auth', { recursive: true, force: true })
                logger('warning', 'Client disconnected. Please restart the application to re-authenticate.')
                process.exit(0)
            }
        } else if (connection === 'open') {
            const number = formatPhoneToUser(sock.user?.phoneNumber ?? sock.user?.id ?? '')
            logger('auth', 'Successfully authenticated.')
            logger('auth', `Connected to WhatsApp with ${number}.`)
            logger('success', 'Client is ready!')
        }

        if (qr) {
            console.clear()
            logger('auth', 'Scan the QR Code below to connect to WhatsApp:')
            generate(qr, { small: true })
        }
    })

    sock.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify') return

        for (const m of event.messages) {
            if (m.key.fromMe) continue
            const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? ''

            if (text && text.trim().toLowerCase() === '/ping') {
                const uptime = formatUptime(process.uptime())

                try {
                    await sock.sendMessage(String(m.key.remoteJid), { text: `🤖 Pong!\nUptime: ${uptime}` })
                    logger('info', 'Ping message received. Responded with Pong and uptime.')
                } catch (error) {
                    logger('error', 'Failed to send Pong response.', error)
                }

                return
            }

            const hookUrl = process.env.WEBHOOK_URL
            if (!hookUrl?.length) return

            sendHook(hookUrl, 'message_received', m)
        }
    })

    sock.ev.on('creds.update', saveCreds)
}

async function initializeServer() {
    const app = express()
    const PORT = process.env.PORT || 3000

    app.use(express.json())
    app.use(validateToken)

    app.post('/message/:number', async (req: Request, res: Response) => {
        if (!req.body) {
            res.status(400).json({
                status: false,
                error: 'Missing request body.'
            })
            return
        }

        const { number } = req.params
        const { message, buttons } = req.body

        if (!number?.length) {
            res.status(400).json({
                status: false,
                error: 'Missing "number" parameter in URL.'
            })
            return
        }

        if (!message?.length) {
            res.status(400).json({
                status: false,
                error: 'Missing "message" parameter in request body.'
            })
            return
        }

        const formattedPhone = formatPhoneToUser(number as string)

        try {
            const jid = await getCachedJid(sock, number as string)

            if (jid) {
                logger('info', `Queuing message "${message}" to ${formattedPhone}...`)

                Queue.add(async () => {
                    let m: any

                    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
                        m = await sendButtons(sock, jid, {
                            text: message,
                            buttons: buttons.map((btn: any) => {
                                return {
                                    name: InteractiveButtonName.CtaUrl,
                                    buttonParamsJson: JSON.stringify({
                                        display_text: btn.text,
                                        url: btn.url
                                    })
                                }
                            })
                        })
                    } else {
                        m = await sock.sendMessage(jid, { text: message })
                    }

                    logger('success', `Message sent to ${formattedPhone}.`)

                    if (m) {
                        const hookUrl = process.env.WEBHOOK_URL
                        if (!hookUrl?.length) return

                        sendHook(hookUrl, 'message_sent', m)
                    }
                })

                res.status(201).json({
                    status: true,
                    message: `Message sent successfully to ${formattedPhone}.`
                })
            } else {
                res.status(404).json({
                    status: false,
                    error: `Number ${formattedPhone} is invalid or not registered on WhatsApp.`
                })
                return
            }
        } catch (error: any) {
            logger('error', `Failed to send message to ${formattedPhone}.`, error)

            res.status(500).json({
                status: false,
                error: `Error sending message to ${formattedPhone}.`,
                details: error?.message
            })
        }
    })

    app.listen(PORT, () => {
        logger('success', `HTTP server is running on port ${PORT}.`)
    })
}

connectToWhatsApp()
initializeServer()