// index.js utilizzato per:
// avviare il server Express
// gestire le rotte per l'autenticazione e Google Drive
const express = require('express');
const cors = require('cors');
const multer = require('multer'); // Importa multer

const { authRoute } = require('./auth');
const { driveRoutes } = require('./drive');
const { sheetsRoutes } = require('./sheets'); // NUOVO: Importa le rotte per Google Sheets

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Porta assegnata: ${PORT}`);

app.use(cors());
app.use(express.json()); // Per parsing di application/json
app.use(express.urlencoded({ extended: true })); // Per parsing di application/x-www-form-urlencoded

// Configura multer per gestire i file in memoria
const upload = multer({ storage: multer.memoryStorage() });

// Monta la rotta di autenticazione al percorso /api/google-login
app.use('/api/google-login', authRoute);
// Monta la rotta di logout al percorso /api/logout
app.use('/api/logout', authRoute); // Reindirizza le richieste di logout alla stessa authRoute

// Monta le rotte di Google Drive
app.use('/api/drive', driveRoutes); // Cambiato il prefisso per chiarezza
// Monta le rotte di Google Sheets
app.use('/api/sheets', sheetsRoutes); // NUOVO: Monta le rotte per Google Sheets

// Specifica la rotta di upload con multer
// 'file' deve corrispondere al 'name' dell'input file nel form HTML
app.post('/api/upload', upload.single('file'), driveRoutes); // Usa driveRoutes come handler per l'upload

app.get('/', (req, res) => {
    res.send('Backend online!');
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});