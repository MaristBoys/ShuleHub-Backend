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

// Monta authRoute una sola volta sotto un prefisso generico, es. /api/auth
// All'interno di authRoute, avrai poi /google-login e /logout
app.use('/api/auth', authRoute);


// Monta la rotta di autenticazione al percorso /api/google-login
///app.use('/api/google-login', authRoute);
// Monta la rotta di logout al percorso /api/logout
///app.use('/api/logout', authRoute); // Reindirizza le richieste di logout alla stessa authRoute


app.use('/api/drive', driveRoutes); // Monta le rotte di Google Drive
app.use('/api/sheets', sheetsRoutes); // Monta le rotte di Google Sheets

// Specifica la rotta di upload con multer
// 'file' deve corrispondere al 'name' dell'input file nel form HTML
app.post('/api/upload', upload.single('file'), driveRoutes); // Usa driveRoutes come handler per l'upload

app.get('/', (req, res) => {
    res.send('Backend online! Ciao');
});

// Gestione degli errori (opzionale, ma consigliato)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Qualcosa è andato storto nel server!');
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});