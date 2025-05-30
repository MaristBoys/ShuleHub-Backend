
// index.js utilizzato per:
// avviare il server Express
// gestire le rotte per l'autenticazione e Google Drive
const express = require('express');
const cors = require('cors');

const { authRoute } = require('./auth');
const { driveRoutes } = require('./drive');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoute);
app.use('/drive', driveRoutes);

app.get('/', (req, res) => {
    res.send('Backend online!');
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});


/*
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { GoogleAuth } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const oAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function checkUserInSheet(email) {
    const auth = new GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = 'Users!A2:C';

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values;

    if (rows.length) {
        for (const row of rows) {
            if (row[0] === email) {
                return { profile: row[1], name: row[2] };
            }
        }
    }
    return null;
}

app.post('/auth', async (req, res) => {
    const { idToken } = req.body;

    try {
        const ticket = await oAuthClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const userEmail = payload.email;
        const googleName = payload.name;
        const googlePicture = payload.picture;
        const emailVerified = payload.email_verified;
        const locale = payload.locale;
        const googleId = payload.sub;

        console.log('Email autenticata:', userEmail);

        const userData = await checkUserInSheet(userEmail);
        if (userData) {
            res.json({
                success: true,
                name: userData.name,
                profile: userData.profile,
                googleName: googleName,
                googlePicture: googlePicture,
                email: userEmail,
                emailVerified: emailVerified,
                locale: locale,
                googleId: googleId
            });
        } else {
            res.json({
                success: false,
                message: 'Utente non autorizzato',
                googleName: googleName,
                googlePicture: googlePicture,
                email: userEmail,
                emailVerified: emailVerified,
                locale: locale,
                googleId: googleId
            });
        }
    } catch (err) {
        console.error('Errore verifica idToken:', err);
        res.status(401).json({ success: false, message: 'Token non valido' });
    }
});

app.get('/', (req, res) => {
    res.send('Backend online!');
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});


*/





/*const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get('/auth-url', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'profile',
    'email'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });

  res.json({ url });
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    res.json({ success: true, tokens });
  } catch (err) {
    console.error('Errore OAuth callback:', err);
    res.status(500).json({ success: false, message: 'Errore OAuth callback' });
  }
});

app.get('/drive/files', async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.list({ pageSize: 10 });

    res.json(response.data);
  } catch (err) {
    console.error('Errore Drive:', err);
    res.status(500).json({ success: false, message: 'Errore Drive API' });
  }
});

app.get('/sheets/data', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = 'Foglio1!A1:E10';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    res.json(response.data);
  } catch (err) {
    console.error('Errore Sheets:', err);
    res.status(500).json({ success: false, message: 'Errore Sheets API' });
  }
});

app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
*/