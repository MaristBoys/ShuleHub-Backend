// Questo modulo gestisce le operazioni di Google Drive, come la lista dei file, il download e l'upload.
const express = require('express');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const stream = require('stream'); // Necessario per l'upload di file

const driveRoutes = express.Router();

async function getDriveClient() {
    const auth = new GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
        scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'] // drive.file per accesso specifico ai file creati/aperti dall'app, drive.readonly per leggere cartelle
    });
    return google.drive({ version: 'v3', auth });
}

// Funzione helper per trovare l'ID di una sottocartella per nome
async function findFolderIdByName(parentFolderId, folderName) {
    const drive = await getDriveClient();
    try {
        const response = await drive.files.list({
            q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}'`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        const files = response.data.files;
        if (files.length > 0) {
            return files[0].id; // Restituisce l'ID della prima cartella trovata con quel nome
        }
        return null; // Cartella non trovata
    } catch (err) {
        console.error(`Errore nel trovare la cartella '${folderName}' in '${parentFolderId}':`, err);
        throw new Error(`Impossibile trovare la cartella: ${folderName}`);
    }
}


driveRoutes.get('/list', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const folderId = process.env.ARCHIVE_FOLDER_ID; // Assicurati che questo ID sia definito nelle tue variabili d'ambiente

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

// Rotta per recuperare i nomi delle cartelle (per "Year")
driveRoutes.get('/years', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const archiveFolderId = process.env.ARCHIVE_FOLDER_ID; // Usa ARCHIVE_FOLDER_ID

        if (!archiveFolderId) {
            return res.status(500).json({ success: false, message: 'ARCHIVE_FOLDER_ID non definito nelle variabili d\'ambiente.' });
        }

        const response = await drive.files.list({
            q: `'${archiveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(name)',
            orderBy: 'name', // Ordina i nomi delle cartelle alfabeticamente
            spaces: 'drive'
        });

        const years = response.data.files.map(file => file.name);
        res.json(years);
    } catch (err) {
        console.error('Errore nel recupero degli anni (cartelle Drive):', err);
        res.status(500).json({ success: false, message: 'Errore nel recupero degli anni da Google Drive.' });
    }
});


// Rotta per l'upload del file
driveRoutes.post('/', async (req, res) => { // La rotta è solo '/' perché è già montata su '/api/upload' in index.js
    try {
        const drive = await getDriveClient();
        const archiveFolderId = process.env.ARCHIVE_FOLDER_ID; // Cartella principale che contiene le cartelle degli anni

        if (!archiveFolderId) {
            return res.status(500).json({ success: false, message: 'ARCHIVE_FOLDER_ID non definito nelle variabili d\'ambiente.' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nessun file caricato.' });
        }

        const fileBuffer = req.file.buffer;
        const originalFileName = req.file.originalname;
        const mimeType = req.file.mimetype;
        const descriptionString = req.body.description || '{}'; // Recupera la descrizione come stringa JSON

        let metadata = {};
        try {
            metadata = JSON.parse(descriptionString);
        } catch (e) {
            console.error('Errore nel parsing della descrizione JSON:', e);
            return res.status(400).json({ success: false, message: 'Formato descrizione non valido.' });
        }

        const year = metadata.year; // Estrai l'anno dalla descrizione

        if (!year) {
            return res.status(400).json({ success: false, message: 'Anno non specificato nella descrizione del file.' });
        }

        // Trova l'ID della cartella dell'anno specifico
        const yearFolderId = await findFolderIdByName(archiveFolderId, year);

        if (!yearFolderId) {
            return res.status(404).json({ success: false, message: `Cartella dell'anno '${year}' non trovata in Google Drive.` });
        }

        // Crea un readable stream dal buffer del file
        const bufferStream = new stream.PassThrough();
        bufferStream.end(fileBuffer);

        const fileMetadata = {
            name: originalFileName,
            parents: [yearFolderId], // Carica il file nella cartella dell'anno specifico
            description: descriptionString // Imposta la descrizione con la stringa JSON originale
        };

        const media = {
            mimeType: mimeType,
            body: bufferStream
        };

        const uploadedFile = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, webContentLink, webViewLink, description'
        });

        res.json({
            success: true,
            message: 'File caricato con successo!',
            fileId: uploadedFile.data.id,
            fileName: uploadedFile.data.name,
            description: uploadedFile.data.description,
            webContentLink: uploadedFile.data.webContentLink,
            webViewLink: uploadedFile.data.webViewLink
        });

    } catch (err) {
        console.error('Errore durante l\'upload del file:', err);
        res.status(500).json({ success: false, message: 'Errore durante l\'upload del file: ' + err.message });
    }
});

// TODO: aggiungere /download/:id route (già presente ma da implementare)
driveRoutes.get('/download/:id', async (req, res) => {
    // implementazione download
    res.json({ success: false, message: 'Download non ancora implementato' });
});

module.exports = { driveRoutes };
