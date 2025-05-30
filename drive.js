// Questo modulo gestisce le operazioni di Google Drive, come la lista dei file, il download e l'upload.
// Le funzioni per il download e l'upload sono ancora da implementare.
const express = require('express');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

const driveRoutes = express.Router();

async function getDriveClient() {
    const auth = new GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    return google.drive({ version: 'v3', auth });
}

driveRoutes.get('/list', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const folderId = process.env.ARCHIVE_FOLDER_ID;

        const response = await drive.files.list({
            q: `'${folderId}' in parents`,
            fields: 'files(id, name, description, mimeType, createdTime, modifiedTime)'
        });

        res.json({ success: true, files: response.data.files });
    } catch (err) {
        console.error('Errore lista file:', err);
        res.status(500).json({ success: false, message: 'Errore nel leggere i file' });
    }
});

// TODO: aggiungere /download/:id e /upload route
driveRoutes.get('/download/:id', async (req, res) => {
    // implementazione download
    res.json({ success: false, message: 'Download non ancora implementato' });
});

driveRoutes.post('/upload', async (req, res) => {
    // implementazione upload con metadati
    res.json({ success: false, message: 'Upload non ancora implementato' });
});

module.exports = { driveRoutes };
