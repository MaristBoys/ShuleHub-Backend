// auth.js
const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { GoogleAuth } = require('google-auth-library');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken'); // Importa jsonwebtoken

const { saveInChangelog } = require('./utils/changelog'); // Importa la funzione per salvare le modifiche nel campo changelog


const authRoute = express.Router();
// Inizializza OAuth2Client con il GOOGLE_CLIENT_ID dall'ambiente
const oAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Configura il Pool di connessioni per PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Assicurati che DATABASE_URL sia configurato
    ssl: {
        rejectUnauthorized: false // Accetta certificati auto-firmati per connessioni SSL a Supabase
    }
});

// Chiave segreta per firmare i JWT (prelevata dalle variabili d'ambiente)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('ERRORE: La variabile d\'ambiente JWT_SECRET non è definita! Interruzione applicazione.');
    process.exit(1); // Termina l'applicazione se la chiave segreta non è presente
}


/**
 * Verifica se un utente è presente nel database PostgreSQL 'users' (whitelist)
 * ed estrae i suoi permessi.
 * @param {string} email - L'email dell'utente da controllare.
 * @param {string} googleId - L'ID univoco di Google (sub) per l'utente.
 * @param {string} googleName - Il nome completo dell'utente da Google. (Non usato per aggiornare il DB)
 * @param {string} googlePicture - L'URL dell'immagine del profilo da Google. (Non usato per aggiornare il DB)
 * @param {string} locale - La lingua preferita dell'utente da Google. (Non usato per aggiornare il DB)
 * @returns {Promise<{
 * userId: string,
 * profile: string,
 * name: string,
 * googleId: string,
 * googlePicture: string,
 * email: string,
 * locale: string,
 * permissions: string[]
 * }|null>} I dati dell'utente e i suoi permessi se autorizzato, altrimenti null.
 */
async function checkUserInDatabase(email, googleId, googleName, googlePicture, locale) {
    let client;
    try {
        client = await pool.connect();

        // 1. Cerca l'utente per email nel DB e il suo profilo, INCLUDI google_name e changelog
        const userQuery = `
            SELECT
                u.id AS user_id,
                u.username,             
                u.google_id,            
                u.google_name,          
                u.id_profile,           
                rp.profile_name AS profile, 
                u.user_is_active,
                u.email,
                u.changelog             
            FROM
                users u                 
            JOIN
                ref_profile rp ON u.id_profile = rp.id 
            WHERE
                u.email = $1;
        `;
        const userResult = await client.query(userQuery, [email]);

        if (userResult.rows.length === 0) {
            console.log(`[AUTH-DB] Utente ${email} non trovato nel database.`);
            return null;
        }

        const userData = userResult.rows[0];

        if (!userData.user_is_active) { 
            console.log(`[AUTH-DB] Utente ${email} trovato ma non attivo.`);
            return null; 
        }

        let changesMade = false;
        const updateFields = [];
        const updateValues = [];
        
        const changesToLog = []; // Array per tenere traccia delle modifiche da loggare

        // --- Gestione Aggiornamento google_id e google_name ---
        if (userData.google_id !== googleId) {
            updateFields.push('google_id = $');
            updateValues.push(googleId);
            changesMade = true;
            console.log(`[AUTH-DB] Aggiornamento google_id per ${email}: da ${userData.google_id} a ${googleId}`);
            
            changesToLog.push({
                field: 'google_id',
                previous: userData.google_id,
                current: googleId
            });
        }

        if (userData.google_name !== googleName) {
            updateFields.push('google_name = $');
            updateValues.push(googleName);
            changesMade = true;
            console.log(`[AUTH-DB] Aggiornamento google_name per ${email}: da '${userData.google_name}' a '${googleName}'`);

            changesToLog.push({
                field: 'google_name',
                previous: userData.google_name,
                current: googleName
            });
        }

        if (changesMade) {
            // Se ci sono campi da aggiornare, costruisci la query UPDATE
            const updateQuery = `
                UPDATE users
                SET ${updateFields.map((field, index) => field + (index + 2)).join(', ')} 
                WHERE id = $1
            `;
            await client.query(updateQuery, [userData.user_id, ...updateValues]);
            console.log(`[AUTH-DB] Campi utente aggiornati nel database per ${email}.`);

            // Ora, per ogni modifica registrata, chiama la funzione saveInChangelog
            for (const change of changesToLog) {
                await saveInChangelog( // AGGIORNATO: Chiama la funzione con il nuovo nome
                    client,           
                    'users',          
                    userData.user_id, // L'ID del record utente che viene modificato
                    change.field,     
                    change.previous,  
                    change.current,   
                    email,            // Email dell'utente che ha fatto la modifica (lo stesso utente che si sta loggando)
                    userData.user_id  // AGGIUNTO: ID dell'utente che ha fatto la modifica
                );
            }
        }
        // --- Fine Gestione Aggiornamento google_id e google_name e Changelog ---

        // 2. Estrazione dei permessi dell'utente
        const permissionsQuery = `
            SELECT
                p.permission_code
            FROM
                permissions p
            JOIN
                rel_profile_permission rpp ON p.id = rpp.id_permission
            WHERE
                rpp.id_profile = $1
                AND rpp.profile_permission_is_active = TRUE
                AND p.permission_is_active = TRUE;
        `;
        const permissionsResult = await client.query(permissionsQuery, [userData.id_profile]);
        const permissions = permissionsResult.rows.map(row => row.permission_code);


        // Restituisce i dati completi dell'utente, inclusi i permessi
        const finalGoogleId = changesMade && changesToLog.some(c => c.field === 'google_id') ? googleId : userData.google_id;
        const finalGoogleName = changesMade && changesToLog.some(c => c.field === 'google_name') ? googleName : userData.google_name;

        return {
            userId: userData.user_id,
            profile: userData.profile,
            name: userData.username, 
            googleId: finalGoogleId, 
            googleName: finalGoogleName, 
            googlePicture: googlePicture, 
            email: email, 
            emailVerified: true, 
            locale: locale, 
            permissions: permissions
        };

    } catch (error) {
        console.error('Errore durante il controllo utente e l\'estrazione dei permessi nel database:', error.message);
        throw new Error('Impossibile verificare l\'utente e i permessi nel database di autorizzazione.');
    } finally {
        if (client) {
            client.release(); 
        }
    }
}

/**
 * Logga l'attività di accesso (login, logout, denied_login, invalid_token_login) nel foglio 'Access_Logs'.
 * Questa funzione può rimanere su Google Sheets come log secondario/storico.
 * @param {string} name - Il nome dell'utente.
 * @param {string} email - L'email dell'utente.
 * @param {string} profile - Il profilo/ruolo dell'utente.
 * @param {string} type - Il tipo di attività (es. 'login', 'logout', 'denied_login', 'invalid_token_login').
 * @param {string} [timeZone='N/A'] - Il fuso orario locale dell'utente.
 * @param {string} [dateLocal='N/A'] - La data locale dell'utente al momento dell'evento.
 * @param {string} [timeLocal='N/A'] - L'ora locale dell'utente al momento dell'evento.
 * @param {string} [deviceType] - Tipo di dispositivo.
 * @param {string} [os] - Sistema operativo.
 * @param {string} [osVersion] - Versione del sistema operativo.
 * @param {string} [browser] - Browser.
 * @param {string} [browserVersion] - Versione del browser.
 * @returns {Promise<void>}
 */
async function logAccessActivity(name, email, profile, type, timeZone = 'N/A', dateLocal = 'N/A', timeLocal = 'N/A', deviceType, os, osVersion, browser, browserVersion) {
    console.log(`[AUTH-LOG] Tentativo di loggare attività: Tipo=${type}, Email=${email}, Nome=${name}, Profilo=${profile}, Timezone=${timeZone}, DateLocal=${dateLocal}, TimeLocal=${timeLocal}`);

    try {
        const auth = new GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const sheetName = 'Access_Logs';

        const now = new Date();
        const dateGMT = now.toUTCString().split(' ')[0] + ', ' + now.getUTCDate() + ' ' + now.toLocaleString('en-US', { month: 'short' }) + ' ' + now.getUTCFullYear();
        const timeGMT = now.toISOString().slice(11, 19);

        const row = [name, email, profile, dateGMT, timeGMT, type, timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A:N`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [row]
            }
        });
        console.log(`[AUTH] Attività di ${type} loggata per ${email} (Profilo: ${profile || 'N/A'})`);
        console.log(row);
    } catch (error) {
        console.error('[AUTH] Errore durante il log dell\'attività di accesso (Sheets):', error.message);
    }
}

// Rotta per il login con Google
authRoute.post('/google-login', async (req, res) => {
    const authHeader = req.headers.authorization;
    let idToken = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        idToken = authHeader.split(' ')[1];
    }

    console.log("DEBUG: `req.body` at start of /google-login route:", req.body);
    const { timeZone, dateLocal, timeLocal, deviceInfo } = req.body;
    const { deviceType, os, osVersion, browser, browserVersion } = deviceInfo || {};
    console.log("DEBUG: `deviceInfo` after destructuring:", deviceInfo);

    if (deviceInfo) {
        console.log(`[LOG da inizio rotta login] Info Dispositivo:`);
        console.log(`    Tipo: ${deviceType}`);
        console.log(`    OS: ${os} ${osVersion}`);
        console.log(`    Browser: ${browser} ${browserVersion}`);
    } else {
        console.log(`[LOG] Info Dispositivo: N/A`);
    }

    if (!idToken) {
        console.warn('[AUTH] Token mancante o malformato.');
        try {
            await logAccessActivity('N/A', 'unknown', 'N/A', 'invalid_token_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
        } catch (err) {
            console.warn('[AUTH] Errore nel logging (token assente):', err.message);
        }
        return res.status(401).json({ success: false, message: 'Token ID not provided or invalid format.' });
    }

    let userEmail = 'unknown';
    let googleName = 'unknown';
    let googlePicture = '';
    let googleId = '';
    let locale = '';

    try {
        const ticket = await oAuthClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();

        userEmail = payload.email;
        googleName = payload.name;
        googlePicture = payload.picture;
        googleId = payload.sub;
        locale = payload.locale;

        const userDataFromDB = await checkUserInDatabase(userEmail, googleId, googleName, googlePicture, locale);

        if (userDataFromDB) {
            // Se l'utente è autenticato e autorizzato, crea il JWT
            const tokenPayload = {
                userId: userDataFromDB.userId,
                email: userDataFromDB.email,
                name: userDataFromDB.name,
                profile: userDataFromDB.profile,
                permissions: userDataFromDB.permissions // Includi i permessi nel payload del token
            };

            // Firma il JWT
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' }); // Il token scade in 1 ora

            try {
                await logAccessActivity(googleName, userEmail, userDataFromDB.profile, 'login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
            } catch (err) {
                console.warn('[AUTH] Errore nel logging del login autorizzato:', err.message);
            }

            res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
            return res.json({
                success: true,
                token: token, // Restituisci il token JWT al frontend
                name: userDataFromDB.name, 
                profile: userDataFromDB.profile, 
                googleName, 
                googlePicture, 
                email: userEmail, 
                emailVerified: payload.email_verified,
                locale, 
                googleId,
                permissions: userDataFromDB.permissions // Utile per debug o accesso diretto lato frontend prima di decodifica token
            });

        } else {
            console.warn(`[AUTH] Accesso negato per ${userEmail}. Utente non nel database o non attivo.`);
            try {
                await logAccessActivity(googleName, userEmail, 'N/A', 'denied_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
            } catch (err) {
                console.warn('[AUTH] Errore nel logging del denied_login:', err.message);
            }

            return res.status(403).json({
                success: false,
                message: `Access denied. The account ${userEmail} is not on the authorized users list or is not active.`,
                googleName,
                googlePicture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale,
                googleId
            });
        }
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
    res.json({ success: true, message: 'Logout successful.' });
});

module.exports = { authRoute };