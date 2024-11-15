const express = require('express');
const oauth2Client = require('./oauthClient');
const { google } = require('googleapis');

const cors = require('cors');
const app = express();

app.use(express.json()); // For parsing application/json
// ADD CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));



app.get('/login', (req, res) => {
  console.log('login');
  const scopes = ['https://www.googleapis.com/auth/calendar']; // Add full access scope
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
  res.redirect(authUrl); // Redirige a Google para autenticación
});

app.get('/oauth2callback', async (req, res) => {
  console.log('oauth2callback');
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Opcional: Guarda los tokens en memoria (simulado)
    global.tokens = tokens;

    res.redirect(process.env.URL + '/dashboard'); // Redirige al frontend
  } catch (err) {
    console.error('Error al intercambiar tokens:', err);
    res.status(500).send('Error al autenticar');
  }
});

app.get('/events', async (req, res) => {
  console.log('events');
  try {
    oauth2Client.setCredentials(global.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const today = new Date();
    const dayOfWeek = today.getDay();  // Obtiene el día de la semana (0-6)

    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;  // Si hoy es domingo (0), resta 6 días para llegar al lunes
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);  // Establece el lunes de esta semana

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);  // El domingo es 6 días después del lunes

    // Ajustamos las fechas al formato ISO
    const timeMin = monday.toISOString();
    const timeMax = sunday.toISOString();

    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,  // Lunes de esta semana
      timeMax: timeMax,  // Domingo de esta semana
      singleEvents: true,
      orderBy: 'startTime',
    });


    res.json(events.data.items); // Enviar eventos al frontend
  } catch (err) {
    console.error('Error al obtener eventos:', err);
    res.status(500).send('Error al obtener eventos');
  }
});

// Add new event
app.post('/new-event', async (req, res) => {
  console.log('new-event');
  const event = req.body;

  // Validate the event data (check if the required fields are present)
  if (!event.summary || !event.start || !event.end) {
    return res.status(400).send('Missing required fields');
  }

  try {
    oauth2Client.setCredentials(global.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Create the new event
    const newEvent = {
      summary: event.summary,
      description: event.description || 'No description provided', // Default description
      location: event.location || '', // Default location
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

    // Insert the event into the calendar
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: newEvent,
    });

    console.log('Event created:', response.data);
    res.status(200).json(response.data); // Return the created event data
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).send('Error creating event');
  }
});


// Iniciar el servidor
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});