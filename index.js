"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bot_sdk_1 = require("@line/bot-sdk");
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const node_fetch_1 = __importDefault(require("node-fetch"));
const clientConfig = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.CHANNEL_SECRET,
};
const PORT = process.env.PORT || '3000';
const INDEX_HTML = '/index.html';
const PROFILE_URL = 'https://api.line.me/v2/bot/profile/';
const client = new bot_sdk_1.Client(clientConfig);
const postStack = new Map();
const getUserImage = async (event) => {
    if (event.source.type !== 'user') {
        return '';
    }
    const res = await node_fetch_1.default(`${PROFILE_URL}/${event.source.userId}`, {
        headers: {
            Authorization: 'Bearer ' + clientConfig.channelAccessToken,
        }
    });
    const data = await res.json();
    return data.pictureUrl;
};
const textEventHandler = async (event) => {
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
const onPost = (req, res) => {
    const events = req.body.events;
    events.forEach((event) => {
        try {
            textEventHandler(event);
        }
        catch (err) {
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
};
const server = express_1.default()
    .use(express_1.default.urlencoded({
    extended: true,
}))
    .use(express_1.default.json())
    .get('/', (_req, res) => {
    res.sendFile(INDEX_HTML, {
        root: __dirname
    });
})
    .post('/', onPost)
    .listen(PORT, () => console.log(`Listening on ${PORT}`));
const wss = new ws_1.Server({ server });
wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('message', (data) => {
        const parseData = JSON.parse(data.toString());
        postStack.forEach((replyToken, id) => {
            if (parseData.id === id) {
                const response = {
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
