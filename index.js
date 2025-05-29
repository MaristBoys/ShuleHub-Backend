const express = require('express');
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