import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import { oauth2Client } from './oauthClient';
import { google } from 'googleapis';
import cors from 'cors';

// Define interfaces for type safety
interface EventRequest {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  reminders?: {
    useDefault: boolean;
  };
}

// Extend global to include tokens
declare global {
  namespace NodeJS {
    interface Global {
      tokens: any; // You might want to define a proper type for tokens
    }
  }
}

const app = express();

app.use(express.json());
// app.use(cors({
//   origin: '*',
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));



app.get('/login', (_req: Request, res: Response) => {
  console.log('login');
  const scopes = ['https://www.googleapis.com/auth/calendar'];
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req: Request, res: Response) => {
  console.log('oauth2callback');
  const code = req.query.code as string;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Store tokens in global (not recommended for production)
    (global as any).tokens = tokens;

    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error('Error al intercambiar tokens:', err);
    res.status(500).send('Error al autenticar');
  }
});

app.get('/events', async (_req: Request, res: Response) => {
  console.log('events');
  try {
    oauth2Client.setCredentials((global as any).tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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
  } catch (err) {
    console.error('Error al obtener eventos:', err);
    res.status(500).send('Error al obtener eventos');
  }
});

app.post('/new-event', express.json(), async (req: Request<{}, {}, EventRequest>, res: Response) => {
  console.log('new-event');
  const event = req.body;

  if (!event.summary || !event.start || !event.end) {
    res.status(400).send('Missing required fields');
    return;
  }

  try {
    oauth2Client.setCredentials((global as any).tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

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
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).send('Error creating event');
  }
});

const PORT: number = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
}); 