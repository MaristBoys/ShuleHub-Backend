
// index.js utilizzato per:
// avviare il server Express
// gestire le rotte per l'autenticazione e Google Drive
const express = require('express');
const cors = require('cors');

const { authRoute } = require('./auth');
const { driveRoutes } = require('./drive');

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Porta assegnata: ${PORT}`);

app.use(cors());
app.use(express.json());

// Monta la rotta di autenticazione al percorso /api/google-login
app.use('/api/google-login', authRoute);
// Monta la rotta di logout al percorso /api/logout
app.use('/api/logout', authRoute); // Reindirizza le richieste di logout alla stessa authRoute
app.use('/drive', driveRoutes);

app.get('/', (req, res) => {
    res.send('Backend online!');
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});


/*
// index.js utilizzato per:
// avviare il server Express
// gestire le rotte per l'autenticazione e Google Drive
const express = require('express');
const cors = require('cors');

const { authRoute } = require('./auth');
const { driveRoutes } = require('./drive');

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Porta assegnata: ${PORT}`);

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
*/
