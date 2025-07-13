// auth.js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken'); // Importa il modulo per la gestione dei JSON Web Tokens

const { checkUserInDatabase } = require('./utils/userAuthService'); // Importa la funzione per verificare l'utente nel database e per estrarre i permessi
const { logAccessActivity } = require('./utils/userAuthService'); // Importa la funzione per loggare le attività di accesso degli utenti

const authRoute = express.Router();
// Inizializza OAuth2Client con il GOOGLE_CLIENT_ID dall'ambiente
const oAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Chiave segreta per firmare i JWT (prelevata dalle variabili d'ambiente)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('ERRORE: La variabile d\'ambiente JWT_SECRET non è definita! Interruzione applicazione.');
    process.exit(1); // Termina l'applicazione se la chiave segreta non è presente
}

// Rotta per il login con Google
authRoute.post('/google-login', async (req, res) => {
    // Estrai il token ID di Google dall'header Authorization
    const authHeader = req.headers.authorization;
    let idToken = null;
    // Verifica se l'header Authorization è presente e contiene un token Bearer
    // Se il token è presente, estrai il token ID
    if (authHeader && authHeader.startsWith('Bearer ')) {
        idToken = authHeader.split(' ')[1];
    }

    // Log per debug: mostra il corpo della richiesta: data, ora e le informazioni sul dispositivo   
    //console.log("DEBUG: `req.body` at start of /google-login route:", req.body);
    // Estrai (destructuring) gli altri dati dal corpo della richiesta (come li invia il frontend)
    const { timeZone, dateLocal, timeLocal, deviceInfo } = req.body;
    const { deviceType, os, osVersion, browser, browserVersion } = deviceInfo || {};
    // console.log("DEBUG: `deviceInfo` after destructuring:", deviceInfo);

    // Imposta l'header Cross-Origin-Opener-Policy qui,
    // prima di qualsiasi 'return res.json()' o altre risposte,
    // per garantire che sia inviato con qualsiasi risposta da questa rotta.
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

    // Log delle informazioni sul dispositivo, se disponibili
    if (deviceInfo) {
        console.log(`[LOG da inizio rotta login] Info Dispositivo:`);
        console.log(`    Tipo: ${deviceType}`);
        console.log(`    OS: ${os} ${osVersion}`);
        console.log(`    Browser: ${browser} ${browserVersion}`);
    } else {
        console.log(`[LOG] Info Dispositivo: N/A`);
    }

    // inizializza variabili utilizzati per la risposta al frontend e per il logAccessActivity
    // Queste variabili saranno riempite dopo la verifica del token ID
    let userEmail = 'unknown'; 
    let googleName = 'unknown';
    let googlePicture = '';
    let googleId = '';
    let locale = '';

    // Verifica se il token ID è presente
    if (!idToken) {
        console.warn('[AUTH] Token mancante o malformato.');
        try {
            await logAccessActivity('N/A', userEmail, 'N/A', 'invalid_token_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
        } catch (err) {
            console.warn('[AUTH] Errore nel logging (token assente):', err.message);
        }
        return res.status(401).json({ success: false, message: 'Token ID not provided or invalid format.' });
    }
    
    // Se il token è valido, estrai le informazioni dell'utente
    try {
        const googleIdToken = await oAuthClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = googleIdToken.getPayload();

        userEmail = payload.email;
        googleName = payload.name;
        googlePicture = payload.picture;
        googleId = payload.sub;
        locale = payload.locale;

        // chiama checkUserInDatabase in userAuthService.js
        // per verificare se l'utente è presente nel database PostgreSQL 'users' (whitelist)
        // e per estrarre i suoi permessi
        // se user_is_active è false checkUserInDatabase restituirà null  
        const userDataFromDB = await checkUserInDatabase(userEmail, googleId, googleName, googlePicture, locale);

        if (!userDataFromDB) { 
            console.warn(`[AUTH] Accesso negato: Utente ${email} non trovato/attivo nel DB.`);
            await logAccessActivity(googleName || 'N/A', email, 'N/A', 'denied_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
            return res.status(403).json({ success: false, message: 'Accesso negato. Utente non trovato o non attivo.' });
        }

        
        // Se l'utente è autenticato e autorizzato (userDataFromDB è valido)
        
            
        const jwtPayload = {
            userId: userDataFromDB.userId,
            email: userDataFromDB.email,
            profile: userDataFromDB.profile,
            name: userDataFromDB.name, 
            googleId: userDataFromDB.googleId,
            googleName: userDataFromDB.googleName,
            permissions: userDataFromDB.permissions // tutti i Permessi dell'utente  
        };
        
        // Firma il JWT
        const signedToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '1h' }); // Il token scade in 1 ora

        // Imposta il cookie con il token JWT
        res.cookie('jwtToken', signedToken, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'none', // Imposta SameSite a None per consentire l'invio del cookie in contesti cross-site da Github Pages a Render
            maxAge: 3600000 
        });


        try {
            await logAccessActivity(googleName, userEmail, userDataFromDB.profile, 'login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
        } catch (err) {
            console.warn('[AUTH] Errore nel logAccessActivity:', err.message);
        }
           
        return res.json({
            success: true,
            message: "Login successful. JWT sent in HttpOnly cookie.",
            name: userDataFromDB.name,
            profile: userDataFromDB.profile,
            email: userDataFromDB.email,
            googleName,
            googlePicture,
            permissions: userDataFromDB.permissions
        });


    } catch (err) {
        console.error('[AUTH] Errore nella verifica del token o accesso al DB:', err.message);
        try {
            await logAccessActivity(googleName, userEmail, 'N/A', 'invalid_token_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
        } catch (logErr) {
            console.warn('[AUTH] Errore nel logging del token non valido:', logErr.message);
        }
        return res.status(401).json({ success: false, message: 'ID Token not provided or invalid.' });
    }
});

// Rotta per il logout (nessuna modifica necessaria qui)
authRoute.post('/logout', async (req, res) => {
    console.log("DEBUG: `req.body` at start of /logout route:", req.body); 
    
    const { email, name, profile, timeZone, dateLocal, timeLocal, deviceInfo } = req.body;
    const { deviceType, os, osVersion, browser, browserVersion } = deviceInfo || {};

    if (!email) {
        console.warn('[AUTH] Richiesta di logout ricevuta senza email utente fornita.');
        return res.json({ success: true, message: 'Logout successful (user email not provided for log in).' });
    }

    console.log(`[AUTH] Richiesta di logout per: ${email} (Nome: ${name || 'N/A'}, Profilo: ${profile || 'N/A'})`);

    
    try{
    await logAccessActivity(name || 'unknown', email, profile || 'N/A', 'logout', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
    }
    catch (error) {
        console.error('[AUTH] Errore durante il log dell\'attività di logout:', error.message);
    }

    res.clearCookie('jwtToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none', // Imposta SameSite a None per consentire l'invio del cookie in contesti cross-site da Github Pages a Render
    });

    return res.json({ success: true, message: 'Logout successful.' });
});

module.exports = { authRoute };