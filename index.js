// index.js utilizzato per:
// avviare il server Express
// gestire le rotte per l'autenticazione e Google Drive
const express = require('express');
const app = express();
const cors = require('cors');
const multer = require('multer'); // Importa multer

// Configurazione CORS per gestire le richieste dal tuo frontend
app.use(cors({
    origin: 'https://maristboys.github.io', // ** <--- IMPOSTA L'ORIGINE ESATTA DEL TUO FRONTEND **
    credentials: true, // ** <--- NECESSARIO PER INVIARE I COOKIE (come jwtToken) **
    optionsSuccessStatus: 200 // Consigliato per compatibilità con alcuni client
}));



app.use(express.json()); // Per parsing di application/json
app.use(express.urlencoded({ extended: true })); // Per parsing di application/x-www-form-urlencoded

const { authRoute } = require('./auth');
const { driveRoutes } = require('./drive');
const { sheetsRoutes } = require('./sheets'); // NUOVO: Importa le rotte per Google Sheets

const PORT = process.env.PORT || 3000;
console.log(`Porta assegnata: ${PORT}`);

// Rotta principale per verificare che il server sia online
app.get('/', (req, res) => {
    res.send('Backend online! Ciao');
});

// Monta authRoute una sola volta sotto un prefisso generico, es. /api/auth
// All'interno di authRoute, avrai poi /google-login e /logout
app.use('/api/auth', authRoute);

// Monta le rotte di Google Drive e Google Sheets
app.use('/api/drive', driveRoutes); // Monta le rotte di Google Drive
app.use('/api/sheets', sheetsRoutes); // Monta le rotte di Google Sheets

// Gestione degli errori (opzionale, ma consigliato)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Qualcosa è andato storto nel server!');
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});