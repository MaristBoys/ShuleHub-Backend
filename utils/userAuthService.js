// utils/userAuthService.js
// Questo modulo verifica l'autenticazione degli utenti ed estrae i permessi, dal database PostgreSQL.
// Utilizza una pool di connessioni per interagire con il database
// utilizza una funzione per salvare le modifiche nel changelog della tabella users presa dal file changelog.js.
// logga le attività di accesso degli utenti in un foglio Google Sheets.
const pool = require('./configDB'); // Importa la pool di connessioni al database PostgreSQL
const { GoogleAuth } = require('google-auth-library'); // Importa GoogleAuth per autenticazione per Google Sheets
const { saveInChangelog } = require('./changelog'); // Importa la funzione per salvare le modifiche nel changelog

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
    let client; // Dichiarazione della variabile client all'interno della funzione
    try {
        client = await pool.connect(); // Ottieni una connessione dal pool qui

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
            console.log(`[USER-AUTH-SERVICE] Utente ${email} non trovato nel database.`);
            return null;
        }

        const userData = userResult.rows[0];

        if (!userData.user_is_active) { 
            console.log(`[USER-AUTH-SERVICE] Utente ${email} trovato ma non attivo.`);
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
            console.log(`[USER-AUTH-SERVICE] Aggiornamento google_id per ${email}: da ${userData.google_id} a ${googleId}`);
            
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
            console.log(`[USER-AUTH-SERVICE] Aggiornamento google_name per ${email}: da '${userData.google_name}' a '${googleName}'`);

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
            console.log(`[USER-AUTH-SERVICE] Campi utente aggiornati nel database per ${email}.`);

            // Ora, per ogni modifica registrata, chiama la funzione saveInChangelog
            for (const change of changesToLog) {
                await saveInChangelog( 
                    client,           // Passa il client ottenuto qui alla funzione di changelog
                    'users',          
                    userData.user_id, 
                    change.field,     
                    change.previous,  
                    change.current,   
                    email,            
                    userData.user_id  
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
            client.release(); // Rilascia la connessione al pool
        }
    }
}

/**Logga l'attività di accesso
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

module.exports = {
    checkUserInDatabase, logAccessActivity
};