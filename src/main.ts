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
import { formatPhoneToClient, formatPhoneToUser, logger } from './utils'
import { sendHook } from './hook'
import Queue from './queue'

let sock: ReturnType<typeof makeWASocket>
dotenv.config({ quiet: true })

function validateToken(req: Request, res: Response, next: NextFunction) {
    const authToken = process.env.AUTH_TOKEN

    if (!authToken?.length) {
        return next()
    }

    const authHeader = req.headers['authorization']

    if (!authHeader?.length) {
        res.status(401).json({
            status: false,
            error: 'Missing auth token.'
        })
        return
    }

    const token = authHeader.split(' ')[1]

    if (!token?.length || token !== authToken) {
        res.status(403).json({
            status: false,
            error: 'Invalid auth token.'
        })
        return
    }

    return next()
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('.auth')
    const pinoLogger = P({ level: 'silent' })

    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys),
        },
        logger: pinoLogger,
        syncFullHistory: false,
    })

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            if (shouldReconnect) {
                await connectToWhatsApp()
            } else {
                logger('auth', 'Client disconnected. Please delete the .auth folder and restart the application to re-authenticate.')
            }
        } else if (connection === 'open') {
            const number = formatPhoneToUser(sock.user?.phoneNumber ?? sock.user?.id ?? '')
            logger('auth', 'Successfully authenticated.')
            logger('auth', 'Client is ready.')
            logger('auth', `Connected to WhatsApp with ${number}.`)
        }

        if (qr) {
            logger('auth', 'Scan the QR Code below to connect to WhatsApp:')
            generate(qr, { small: true })
        }
    })

    sock.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify') return

        for (const m of event.messages) {
            if (m.key.fromMe) continue

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

    app.post('/send-message/:number', async (req: Request, res: Response) => {
        const { number } = req.params
        const { message } = req.body

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
            const jid = await sock.onWhatsApp(formatPhoneToClient(number as string))

            if (jid?.[0]?.exists) {
                logger('info', `Queuing message "${message}" to ${formattedPhone}...`)

                Queue.add(async () => {
                    await sock.sendMessage(jid[0].jid, { text: message })
                    logger('info', `Message sent to ${formattedPhone}.`)
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
        logger('info', `Server is running on port ${PORT}.`)
    })
}

connectToWhatsApp()
initializeServer()