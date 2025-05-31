// This code defines an Express route for handling Google authentication.
// It verifies the ID token received from the client,
// checks if the user is authorized by looking them up in a Google Sheets document,

const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { GoogleAuth } = require('google-auth-library');


const authRoute = express.Router();
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

authRoute.post('/', async (req, res) => {
    const { idToken } = req.body;

    try {
        const ticket = await oAuthClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const userEmail = payload.email;

        const userData = await checkUserInSheet(userEmail);
        if (userData) {
            res.json({
                success: true,
                name: userData.name,
                profile: userData.profile,
                googleName: payload.name,
                googlePicture: payload.picture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale: payload.locale,
                googleId: payload.sub
            });
        } else {
            res.json({
                success: false,
                message: 'Utente non autorizzato',
                googleName: payload.name,
                googlePicture: payload.picture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale: payload.locale,
                googleId: payload.sub
            });
        }
    } catch (err) {
        console.error('Errore verifica idToken:', err);
        res.status(401).json({ success: false, message: 'Token non valido' });
    }
});

// Nuova rotta per il logout
authRoute.post('/logout', (req, res) => {
    // In un'applicazione reale, qui potresti invalidare sessioni, token, ecc.
    // Per ora, basta inviare una risposta di successo al frontend.
    console.log('Richiesta di logout ricevuta.');
    res.json({ success: true, message: 'Logout effettuato con successo.' });
});

module.exports = { authRoute };







/*

// This code defines an Express route for handling Google authentication.
// It verifies the ID token received from the client,
// checks if the user is authorized by looking them up in a Google Sheets document,

const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { GoogleAuth } = require('google-auth-library');


const authRoute = express.Router();
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

authRoute.post('/', async (req, res) => {
    const { idToken } = req.body;

    try {
        const ticket = await oAuthClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const userEmail = payload.email;

        const userData = await checkUserInSheet(userEmail);
        if (userData) {
            res.json({
                success: true,
                name: userData.name,
                profile: userData.profile,
                googleName: payload.name,
                googlePicture: payload.picture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale: payload.locale,
                googleId: payload.sub
            });
        } else {
            res.json({
                success: false,
                message: 'Utente non autorizzato',
                googleName: payload.name,
                googlePicture: payload.picture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale: payload.locale,
                googleId: payload.sub
            });
        }
    } catch (err) {
        console.error('Errore verifica idToken:', err);
        res.status(401).json({ success: false, message: 'Token non valido' });
    }
});

module.exports = { authRoute };

*/
