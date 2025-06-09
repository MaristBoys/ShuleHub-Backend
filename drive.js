// Questo modulo gestisce le operazioni di Google Drive, come la lista dei file, il download e l'upload.
const express = require('express');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const stream = require('stream'); // Necessario per l'upload di file
const multer = require('multer'); // Importa multer per gestire l'upload dei file

const driveRoutes = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Configura multer per gestire i file in memoria

async function getDriveClient() {
    const auth = new GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
        scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'] // drive.file per accesso specifico ai file creati/aperti dall'app, drive.readonly per leggere cartelle, drive.metadata.readonly per info su spazio
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
driveRoutes.post('/upload', upload.single('file'), async (req, res) => {
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
       
        // RECUPERA I METADATI DIRETTAMENTE DA req.body INVECE CHE DA 'description'
        // Assumiamo che il frontend invii i metadati come campi separati nel FormData
        // o come un singolo campo JSON dedicato ai metadati.
        // Per semplicità e coerenza con il FormData del frontend, recupereremo i singoli campi.
        const { year, author, subject, form, room, documentType, name } = req.body;

        // Valida che i campi obbligatori siano presenti -room non obbligatorio
        if (!year || !author || !subject || !form || !documentType) {
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

        // --- INIZIO: Implementazione della strategia di denominazione del file ---
        // al momento lasciamo il nome originale
        // --- FINE: Implementazione della strategia di denominazione del file ---
        
        // Definisci le custom properties
        const properties = {
            'year': year,
            'author': author,
            'subject': subject,
            'form': form,
            'documentType': documentType,
            'name': name
        };
        
        // Aggiungi la proprietà room: sempre presente, anche se vuota:
        properties.room = room || '';
        
        
        const fileMetadata = {
            name: originalFileName,
            parents: [yearFolderId], // Carica il file nella cartella dell'anno specifico
            properties: properties, // Imposta le proprietà personalizzate
            description: originalFileName // nome file originale
        };

        // Definisci il media object per l'upload
        const media = {
            mimeType: mimeType,
            body: bufferStream
        };

        // Carica il file su Google Drive
        // Utilizza il metodo files.create per caricare il file
        const uploadedFile = await drive.files.create({
            resource: fileMetadata,
            media: media,
            // Richiedi i campi che vuoi ricevere nella risposta
            fields: 'id, name, webContentLink, webViewLink, properties, description'
        });

       res.json({
            success: true,
            message: 'File uploaded successfully!',
            fileId: uploadedFile.data.id,
            fileName: uploadedFile.data.name,
            properties: uploadedFile.data.properties,
            description: uploadedFile.data.description, 
            webContentLink: uploadedFile.data.webContentLink,
            webViewLink: uploadedFile.data.webViewLink
        });


    } catch (err) {
        console.error('Errore durante l\'upload del file:', err);
        res.status(500).json({ success: false, message: 'Error uploading file: ' + err.message });
    }
});


// NUOVA Rotta POST per ottenere la lista di tutti i file in tutte le sottocartelle
// con possibilità di filtro per autore
driveRoutes.post('/list', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const archiveFolderId = process.env.ARCHIVE_FOLDER_ID; // Cartella principale

        if (!archiveFolderId) {
            return res.status(500).json({ success: false, message: 'ARCHIVE_FOLDER_ID non definito nelle variabili d\'ambiente.' });
        }

        const { profile, googleName, author } = req.body; // Receive profile, googleName, and author
        console.log(`Richiesta lista file. Profilo: ${profile}, Google Name: ${googleName || 'N/A'}, Autore filtro: ${author || 'N/A'}`);

        let allFiles = [];
        let allFolders = [archiveFolderId]; // Lista di cartelle da esplorare

        async function getFilesFromFolder(folderId) {
            let pageToken = null;

            do {
                const response = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, description, mimeType, createdTime, modifiedTime, webContentLink, webViewLink, properties, parents)',
                    spaces: 'drive',
                    pageToken: pageToken
                });

                response.data.files.forEach(file => {
                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        allFolders.push(file.id); // Add the folder to the list for the next scan
                    } else {
                        allFiles.push(file); // Add the file to the list
                    }
                });

                pageToken = response.nextPageToken;
            } while (pageToken);
        }

        // Scan the main folder and all subfolders
        for (const folderId of allFolders) {
            await getFilesFromFolder(folderId);
        }


        // Apply filtering based on profile
        let filteredFiles = [];
        if (profile === 'Teacher') {
            // Teacher: filter by custom property 'author' equal to googlename
            if (googleName) {
                filteredFiles = allFiles.filter(file =>
                    file.properties && file.properties.author &&
                    file.properties.author.toLowerCase() === googleName.toLowerCase()
                );
                console.log(`Filtro per Teacher: Trovati ${filteredFiles.length} file per autore '${googleName}'.`);
            } else {
                console.warn('Google Name non fornito per il profilo Teacher. Nessun file estratto.');
                filteredFiles = []; // No googleName provided for Teacher, so no files
            }
        } else if (['Admin', 'Headmaster', 'Deputy', 'Staff'].includes(profile)) {
            // Admin, Headmaster, Deputy, Staff: no filter, they see all files
            filteredFiles = allFiles;
            console.log(`Filtro per ${profile}: Nessun filtro applicato, mostrati tutti ${filteredFiles.length} file.`);
        } else {
            // Unauthorized profile: return no files
            console.warn(`Profilo non autorizzato (${profile}) ha tentato di listare i file. Nessun file estratto.`);
            // No need to send 403 here, as it's already handled by frontend for display purposes
            // We just return an empty list. The frontend will decide to show an error or empty table.
            filteredFiles = [];
        }

        res.json({ success: true, files: filteredFiles });
    } catch (err) {
        console.error('Errore nella lista dei file:', err);
        res.status(500).json({ success: false, message: 'Errore nel recuperare i file: ' + err.message });
    }
});


// Rotta per il download del file
driveRoutes.get('/download/:id', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const fileId = req.params.id;

        // Recupera i metadati del file per ottenere il nome originale e il mimeType
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'name, mimeType'
        });

        const fileName = fileMetadata.data.name;
        const mimeType = fileMetadata.data.mimeType;

        // Richiedi il file come stream
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media' // Questo indica che vogliamo il contenuto del file
        }, { responseType: 'stream' });

        // Imposta gli header per il download
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Esegui il piping dello stream di risposta di Drive direttamente alla risposta HTTP
        response.data
            .on('end', () => console.log('Download complete'))
            .on('error', err => {
                console.error('Error during download:', err);
                res.status(500).send('Error downloading file');
            })
            .pipe(res);

    } catch (err) {
        console.error('Errore durante il download del file:', err);
        res.status(500).json({ success: false, message: 'Error downloading file: ' + err.message });
    }
});


// Rotta per il delete del file
driveRoutes.delete('/delete/:id', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const fileId = req.params.id;

        await drive.files.delete({ fileId: fileId });

        res.json({ success: true, message: 'File deleted successfully!' });
    } catch (err) {
        console.error('Errore durante il delete del file:', err);
        res.status(500).json({ success: false, message: 'Error deleting file: ' + err.message });
    }
});

// NUOVA ROTTA: Ottieni informazioni sullo spazio di archiviazione di Google Drive
// Funzione helper per convertire byte in un formato leggibile (KB, MB, GB)
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// NUOVA ROTTA: Ottieni informazioni sullo spazio di archiviazione di Google Drive
driveRoutes.get('/storage-info', async (req, res) => {
    try {
        const drive = await getDriveClient();
        const response = await drive.about.get({
            fields: 'storageQuota' // Richiede solo il campo storageQuota
        });

        const storageQuota = response.data.storageQuota;

        if (storageQuota) {
            const totalBytes = parseInt(storageQuota.limit, 10);
            const usedBytes = parseInt(storageQuota.usage, 10);
            const trashBytes = parseInt(storageQuota.usageInDriveTrash, 10);
            const availableBytes = totalBytes - usedBytes;

            res.json({
                success: true,
                // Valori in byte
                total_bytes: totalBytes,
                used_bytes: usedBytes,
                available_bytes: availableBytes,
                trash_bytes: trashBytes,
                // Valori formattati per la visualizzazione
                total: formatBytes(totalBytes),
                used: formatBytes(usedBytes),
                available: formatBytes(availableBytes),
                trash: formatBytes(trashBytes),
                // Puoi anche restituire i valori originali per debug
                raw: storageQuota
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Storage quota information not found.'
            });
        }
    } catch (err) {
        console.error('Errore nel recupero delle informazioni di storage:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching storage information: ' + err.message
        });
    }
});


module.exports = {
    driveRoutes
};