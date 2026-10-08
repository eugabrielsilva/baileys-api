# Baileys WhatsApp API

A simple HTTP REST API for sending WhatsApp messages using [Baileys](https://github.com/WhiskeySockets/Baileys). The application connects to WhatsApp through a QR code, exposes an endpoint for sending messages, and can forward incoming messages to a webhook URL.

Outgoing messages are queued and sent after randomized delays, a mechanism intended to reduce the risk of account bans.

**This tool is designed for lightweight integrations that only need to send simple text messages via WhatsApp, such as order notifications, alerts, and automated updates.**

> This tool is an unofficial, independent project and is not affiliated with, maintained, authorized, or endorsed by WhatsApp or Meta Platforms, Inc. Use this tool at your own risk and ensure compliance with WhatsApp's Terms of Service and API policies.

## Requirements

- Node.js 22+ and npm
- A phone with a WhatsApp account to connect

## Installation

```sh
git clone https://github.com/eugabrielsilva/baileys-api.git
cd baileys-api
npm install
```

Copy the example environment file and edit it with your settings:

```sh
cp .env.example .env
```

Start the API:

```sh
npm start
```

On the first start, scan the QR code printed in the terminal using WhatsApp's linked-devices feature. The authentication data is saved in the `.auth` directory, so subsequent starts can reuse it. **Keep this directory private and DO NOT COMMIT IT!**

If the WhatsApp account is logged out, delete `.auth` and restart the application to pair again.

## Configuration

The application loads values from `.env` at startup. All settings are optional; the defaults are shown below.

| Variable          | Default | Description                                                                                                                                     |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`            | `3000`  | HTTP server port.                                                                                                                               |
| `AUTH_TOKEN`      | Empty   | When set, protects the HTTP API. Send it in the `Authorization` header using the `Bearer` scheme. If empty, API requests are not authenticated. |
| `WEBHOOK_URL`     | Empty   | URL that receives notifications for incoming messages. Leave empty to disable webhook delivery.                                                 |
| `WEBHOOK_SECRET`  | Empty   | Secret used by the webhook integration.                                                                                                         |
| `QUEUE_MIN_DELAY` | `2500`  | Minimum delay, in milliseconds, before a queued message is sent.                                                                                |
| `QUEUE_MAX_DELAY` | `5000`  | Maximum delay, in milliseconds, before a queued message is sent.                                                                                |

Choose a strong, private `AUTH_TOKEN` before exposing the API to a network.

**Do not commit `.env`, `.auth`, or other credentials.**

## Usage

### Send a message

Send a JSON `POST` request to `/send-message/{number}`. Use the recipient's **phone number with its country calling code**; non-digit characters are stripped when resolving the WhatsApp recipient.

```sh
curl -X POST http://localhost:3000/send-message/15551234567 \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"message":"Hello from the API"}'
```

The `Authorization` header is only required when `AUTH_TOKEN` is configured. A successful request returns HTTP `201` and queues the message for delivery. **The response indicates that the message was queued for sending, not that WhatsApp has confirmed delivery.**

To include URL buttons, provide a `buttons` array with `text` and `url` properties:

```json
{
  "message": "Choose an option",
  "buttons": [
    {
      "text": "Visit our site",
      "url": "https://example.com"
    }
  ]
}
```

### Incoming messages

When `WEBHOOK_URL` is set, each incoming message triggers a POST request to that URL with a `type` of `message_received` and a `data` object containing message details, including the sender, text body, timestamp, and JID. **Only the message text is included in the body field.**

When `WEBHOOK_SECRET` is configured, it is sent in the request's `Authorization` header.

### Health check

Send `/ping` to the connected WhatsApp account to receive a Pong response and the API process uptime. This message is not sent to the webhook.
