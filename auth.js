// auth.js
const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { GoogleAuth } = require('google-auth-library');

const authRoute = express.Router();
// Inizializza OAuth2Client con il GOOGLE_CLIENT_ID dall'ambiente
const oAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifica se un utente è presente nel foglio Google Sheets 'Users' (whitelist).
 * @param {string} email - L'email dell'utente da controllare.
 * @returns {Promise<{profile: string, name: string}|null>} I dati del profilo e nome se l'utente è autorizzato, altrimenti null.
 */
async function checkUserInSheet(email) {
    try {
        // Autenticazione per l'accesso in sola lettura a Google Sheets
        const auth = new GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.SPREADSHEET_ID; // ID del tuo Google Sheet principale
        const range = 'Users!A2:C'; // Range delle colonne: Email, Profilo, Nome

        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = res.data.values;

        if (rows && rows.length) {
            for (const row of rows) {
                // row[0] = Email, row[1] = Profilo, row[2] = Nome
                if (row[0] === email) {
                    return { profile: row[1], name: row[2] };
                }
            }
        }
        return null; // Utente non trovato nella whitelist
    } catch (error) {
        console.error('Errore durante il controllo utente nel foglio:', error.message);
        // È importante non esporre dettagli interni dell'errore al client
        throw new Error('Impossibile verificare l\'utente nel foglio di autorizzazione.');
    }
}

/**
 * Logga l'attività di accesso (login, logout, denied_login, invalid_token_login) nel foglio 'Access_Logs'.
 * @param {string} name - Il nome dell'utente.
 * @param {string} email - L'email dell'utente.
 * @param {string} profile - Il profilo/ruolo dell'utente.
 * @param {string} type - Il tipo di attività (es. 'login', 'logout', 'denied_login', 'invalid_token_login').
 * @param {string} [timeZone='N/A'] - Il fuso orario locale dell'utente.
 * @param {string} [dateLocal='N/A'] - La data locale dell'utente al momento dell'evento.
 * @param {string} [timeLocal='N/A'] - L'ora locale dell'utente al momento dell'evento.
 * @param {Object} [deviceInfo] - (NUOVO PARAMETRO OPZIONALE) Oggetto contenente i dettagli del dispositivo (deviceType, os, browser, ecc.).
    * @returns {Promise<void>}
 */

async function logAccessActivity(name, email, profile, type, timeZone = 'N/A', dateLocal = 'N/A', timeLocal = 'N/A',  deviceType, os, osVersion, browser, browserVersion) { // AGGIUNTO timezone, dateLocal, timeLocal con default
    console.log(`[AUTH-LOG] Tentativo di loggare attività: Tipo=${type}, Email=${email}, Nome=${name}, Profilo=${profile}, Timezone=${timeZone}, DateLocal=${dateLocal}, TimeLocal=${timeLocal}`); // AGGIUNTO NEL LOG

    // --- GESTIONE DEI NUOVI DATI deviceInfo ---
    if (deviceInfo) {
        console.log(`[LOG] Info Dispositivo:`);
        console.log(`    Tipo: ${deviceInfo.deviceType}`);
        console.log(`    OS: ${deviceInfo.os} ${deviceInfo.osVersion}`);
        console.log(`    Browser: ${deviceInfo.browser} ${deviceInfo.browserVersion}`);
    }
    else { console.log(`[LOG] Info Dispositivo: N/A`); }


    try {
        // Autenticazione per l'accesso in scrittura a Google Sheets
        const auth = new GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'] // Richiede scope di scrittura
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const sheetName = 'Access_Logs';

        // Data e ora GMT
        const now = new Date(); //è quella del server, non dell'utente che ha tz = undefined
        const dateGMT = now.toUTCString().split(' ')[0] + ', ' + now.getUTCDate() + ' ' + now.toLocaleString('en-US', { month: 'short' }) + ' ' + now.getUTCFullYear();
        const timeGMT = now.toISOString().slice(11, 19);

        //console.log('TZ:', process.env.TZ); //verifica se variabile ambiente TZ di Render = undefined allora prende GMT

        // Ordine delle colonne nel foglio Access_Logs: Nome, Email, Profilo, Data GMT, Ora GMT, Tipo Attività
        // Aggiungi timezone, dateLocal, timeLocal e deviceInfo che comprende più dettagli sul dispositivo
        const row = [name, email, profile, dateGMT, timeGMT, type, timeZone, dateLocal, timeLocal, deviceInfo.deviceType,  deviceType, os, osVersion, browser, browserVersion];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A:N`, // Assicurati che il range corrisponda alle tue colonne (A-F per 6 colonne)
            valueInputOption: 'USER_ENTERED', // Mantiene la formattazione di Google Sheets
            resource: {
                values: [row]
            }
        });
        console.log(`[AUTH] Attività di ${type} loggata per ${email} (Profilo: ${profile || 'N/A'})`);
        console.log(row); // Logga la riga inserita per debug   
    } catch (error) {
        console.error('[AUTH] Errore durante il log dell\'attività di accesso:', error.message);
        // Non lanciamo l'errore qui per non bloccare il flusso di login/logout se il logging fallisce
    }
}

// Rotta per il login con Google
authRoute.post('/google-login', async (req, res) => {
    // L'ID Token viene passato nell'header Authorization come Bearer token
    const authHeader = req.headers.authorization;
    let idToken = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        idToken = authHeader.split(' ')[1];
    }


    console.log("DEBUG: `req.body` at start of /google-login route:", req.body); // AGGIUNGI QUESTO

    // --- Estrai i dati aggiuntivi dal corpo della richiesta ---
    const { timeZone, dateLocal, timeLocal, deviceInfo } = req.body;
    const { deviceType, os, osVersion, browser, browserVersion } = deviceInfo || {};

    console.log("DEBUG: `deviceInfo` after destructuring:", deviceInfo); // AGGIUNGI ANCHE QUESTO

    // --- GESTIONE DEI NUOVI DATI deviceInfo ---
    if (deviceInfo) {
        console.log(`[LOG da inizio rotta login] Info Dispositivo:`);
        console.log(`    Tipo: ${deviceType}`);
        console.log(`    OS: ${os} ${osVersion}`);
        console.log(`    Browser: ${browser} ${browserVersion}`);
    }
    else { console.log(`[LOG] Info Dispositivo: N/A`); }


    if (deviceInfo) {
        console.log(`[LOG dopo destrutturazione con proprietà:`);
        console.log(deviceInfo.deviceType);
        console.log(deviceInfo.os);
        console.log(deviceInfo.browser);
    }
    else { console.log(`[LOG] Info Dispositivo2: N/A`); }



    if (!idToken) {
        console.warn('[AUTH] Tentativo di login senza ID Token o formato non valido.');
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
            audience: process.env.GOOGLE_CLIENT_ID // Verifica che il token sia per la tua app
        });
        const payload = ticket.getPayload();

        // Estrai le informazioni necessarie dalla payload verificata
        userEmail = payload.email;
        googleName = payload.name;
        googlePicture = payload.picture;
        googleId = payload.sub;
        locale = payload.locale;

        // Controlla l'email dell'utente nella whitelist
        const userData = await checkUserInSheet(userEmail);

        if (userData) {
            // Utente autenticato E AUTORIZZATO (presente nella whitelist)
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups"); // Necessario per il flusso GSI in alcuni browser
            res.json({
                success: true,
                name: userData.name, // Nome dal foglio Google Sheet
                profile: userData.profile, // Profilo dal foglio Google Sheet
                googleName: googleName, // Nome fornito da Google
                googlePicture: googlePicture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale: locale,
                googleId: googleId
            });

            // --- Passa i dati a logAccessActivity ---
            await logAccessActivity(googleName, userEmail, userData.profile, 'login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);

        } else {
            // Utente autenticato MA NON AUTORIZZATO (non presente nella whitelist)
            console.warn(`[AUTH] Accesso negato per ${userEmail}. Utente non nella whitelist.`);
            res.status(403).json({ // 403 Forbidden indica che l'utente è autenticato ma non autorizzato
                success: false,
                message: `Access denied. The account ${payload.email} is not on the authorized users list.`,
                googleName: googleName,
                googlePicture: googlePicture,
                email: userEmail,
                emailVerified: payload.email_verified,
                locale: locale,
                googleId: googleId
            });
            // --- Passa i dati aggiuntivi a logAccessActivity per il denied_login ---
            await logAccessActivity(googleName, userEmail, 'N/A', 'denied_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
        }
    } catch (err) {
        // Gestione di errori nella verifica del token (es. token scaduto, non valido)
        console.error('[AUTH] Errore durante la verifica dell\'ID Token:', err.message);
        res.status(401).json({ success: false, message: 'ID Token not provided or invalid.' });
        // --- NUOVO: Passa i dati aggiuntivi a logAccessActivity per l'invalid_token_login ---
        await logAccessActivity(googleName, userEmail, 'N/A', 'invalid_token_login', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);
    }
});

// Rotta per il logout
authRoute.post('/logout', async (req, res) => {
    // Per il logout, non è necessario l'idToken. I dati dell'utente per il log
    // vengono passati dal frontend nel corpo della richiesta.
    // --- NUOVO: Estrai timezone, dateLocal, timeLocal ---
    const { email, name, profile, timeZone, dateLocal, timeLocal, deviceInfo } = req.body;
    const { deviceType, os, osVersion, browser, browserVersion } = deviceInfo || {};

    if (!email) {
        console.warn('[AUTH] Richiesta di logout ricevuta senza email utente fornita.');
        // Rispondi comunque con successo per non bloccare il frontend, ma logga il problema
        return res.json({ success: true, message: 'Logout successful (user email not provided for log in).' });
    }

    console.log(`[AUTH] Richiesta di logout per: ${email} (Nome: ${name || 'N/A'}, Profilo: ${profile || 'N/A'})`);

    // Log dell'attività di logout
    await logAccessActivity(name || 'sconosciuto', email, profile || 'N/A', 'logout', timeZone, dateLocal, timeLocal, deviceType, os, osVersion, browser, browserVersion);

    // In un'applicazione più complessa, qui si potrebbe invalidare sessioni lato server o token specifici.
    // Nel tuo setup attuale, il logout è principalmente una pulizia lato client e un'attività di log.
    res.json({ success: true, message: 'Logout successfull.' });
});

module.exports = { authRoute };