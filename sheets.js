// sheets.js
const express = require('express');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

const sheetsRoutes = express.Router();

async function getSheetsClient() {
    const auth = new GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    return google.sheets({ version: 'v4', auth });
}

// Funzione helper per recuperare i valori da un foglio specifico
async function getSheetValues(sheetName) {
    try {
        const sheets = await getSheetsClient();
        const spreadsheetId = process.env.SPREADSHEET_ID; // Lo stesso ID del foglio della whitelist
        const range = `${sheetName}!A2:A`; // Assumiamo che i dati siano nella colonna A, a partire dalla riga 2

        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = res.data.values;

        if (rows && rows.length > 0) {
            return rows.flat(); // Appiattisce l'array di array in un singolo array di stringhe
        }
        return [];
    } catch (err) {
        console.error(`Error fetching data from sheet ${sheetName}:`, err);
        throw new Error(`Failed to fetch data from sheet ${sheetName}`);
    }
}

// Rotta per recuperare i soggetti
sheetsRoutes.get('/subjects', async (req, res) => {
    try {
        const subjects = await getSheetValues('Subjects'); // Nome del foglio
        res.json(subjects);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Rotta per recuperare i form
sheetsRoutes.get('/forms', async (req, res) => {
    try {
        const forms = await getSheetValues('Forms'); // Nome del foglio
        res.json(forms);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Rotta per recuperare le room
sheetsRoutes.get('/rooms', async (req, res) => {
    try {
        const rooms = await getSheetValues('Rooms'); // Nome del foglio
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Rotta per recuperare i tipi di documento
sheetsRoutes.get('/types', async (req, res) => {
    try {
        const types = await getSheetValues('Types'); // Nome del foglio
        res.json(types);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = { sheetsRoutes };
