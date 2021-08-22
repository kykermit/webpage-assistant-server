import { ClientConfig, Client, WebhookEvent, TextMessage, Profile } from '@line/bot-sdk';
import express, { Request, Response } from 'express';
import { Server } from 'ws';
import fetch from 'node-fetch';

const clientConfig: ClientConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET,
};

const PORT = process.env.PORT || '3000';
const INDEX_HTML = '/index.html';
const PROFILE_URL = 'https://api.line.me/v2/bot/profile/';
const client = new Client(clientConfig);
const postStack: Map<string, string> = new Map();

const getUserImage = async (event: WebhookEvent): Promise<string> => {
    if (event.source.type !== 'user') {
        return '';
    }

    const res = await fetch(`${PROFILE_URL}/${event.source.userId}`, {
        headers: {
            Authorization: 'Bearer ' + clientConfig.channelAccessToken,
        }
    });
    const data = await res.json() as Profile;

    return data.pictureUrl;
};

const textEventHandler = async (event: WebhookEvent) => {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return;
    }

    const { replyToken } = event;
    const { text, id } = event.message;
    const imageUrl = await getUserImage(event);

    wss.clients.forEach((wsClient) => {
        wsClient.send(JSON.stringify({
            text,
            id,
            imageUrl,
        }));
    });

    // Websocket応答用に保持
    postStack.set(id, replyToken);
};

const onPost = (req: Request, res: Response) => {
    const events: WebhookEvent[] = req.body.events;

    events.forEach((event: WebhookEvent) => {
        try {
            textEventHandler(event);
        } catch (err: unknown) {
            if (err instanceof Error) {
                console.error(err);
            }

            res.status(500).json({
                status: 'error',
            });
        }
    });

    res.status(200).json({
        status: 'success'
    });
}

const server = express()
    .use(express.urlencoded({
        extended: true,
    }))
    .use(express.json())
    .get('/', (_req: Request, res: Response) => {
        res.sendFile(INDEX_HTML, {
            root: __dirname
        });
    })
    .post('/', onPost)
    .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (data) => {
        const parseData = JSON.parse(data.toString());

        postStack.forEach((replyToken, id) => {
            if (parseData.id === id) {
                const response: TextMessage = {
                    type: 'text',
                    text: parseData.replyMessage,
                };

                client.replyMessage(replyToken, response);

                postStack.delete(id);
            }
        });
    });
    ws.on('close', () => console.log('Client disconnected'));
});
