"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const oauthClient_1 = require("./oauthClient");
const googleapis_1 = require("googleapis");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
// app.use(cors({
//   origin: '*',
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.get('/login', (_req, res) => {
    console.log('login');
    const scopes = ['https://www.googleapis.com/auth/calendar'];
    const authUrl = oauthClient_1.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
    res.redirect(authUrl);
});
app.get('/oauth2callback', async (req, res) => {
    console.log('oauth2callback');
    const code = req.query.code;
    try {
        const { tokens } = await oauthClient_1.oauth2Client.getToken(code);
        oauthClient_1.oauth2Client.setCredentials(tokens);
        // Store tokens in global (not recommended for production)
        global.tokens = tokens;
        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    }
    catch (err) {
        console.error('Error al intercambiar tokens:', err);
        res.status(500).send('Error al autenticar');
    }
});
app.get('/events', async (_req, res) => {
    console.log('events');
    try {
        oauthClient_1.oauth2Client.setCredentials(global.tokens);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauthClient_1.oauth2Client });
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(today);
        monday.setDate(today.getDate() - daysToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const timeMin = monday.toISOString();
        const timeMax = sunday.toISOString();
        const events = await calendar.events.list({
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });
        res.json(events.data.items);
    }
    catch (err) {
        console.error('Error al obtener eventos:', err);
        res.status(500).send('Error al obtener eventos');
    }
});
app.post('/new-event', express_1.default.json(), async (req, res) => {
    console.log('new-event');
    const event = req.body;
    if (!event.summary || !event.start || !event.end) {
        res.status(400).send('Missing required fields');
        return;
    }
    try {
        oauthClient_1.oauth2Client.setCredentials(global.tokens);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauthClient_1.oauth2Client });
        const newEvent = {
            summary: event.summary,
            description: event.description || 'No description provided',
            location: event.location || '',
            start: {
                dateTime: event.start.dateTime,
                timeZone: event.start.timeZone || 'America/Santiago',
            },
            end: {
                dateTime: event.end.dateTime,
                timeZone: event.end.timeZone || 'America/Santiago',
            },
            reminders: event.reminders || {
                useDefault: true,
            },
        };
        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: newEvent, // Changed from 'resource' to 'requestBody' as per latest Google Calendar API
        });
        console.log('Event created:', response.data);
        res.status(200).json(response.data);
    }
    catch (err) {
        console.error('Error creating event:', err);
        res.status(500).send('Error creating event');
    }
});
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
