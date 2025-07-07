// utils/changelog.js
/**
 * Salva una nuova voce al campo changelog JSONB di una riga specifica in una tabella.
 * Il campo changelog nella tabella deve essere di tipo JSONB.
 *
 * @param {object} client - Il client PostgreSQL dalla connection pool.
 * @param {string} tableName - Il nome della tabella da aggiornare (es. 'users', 'products').
 * @param {string} recordId - L'ID UUID del record da aggiornare.
 * @param {string} fieldModified - Il nome del campo che è stato modificato (es. 'google_name', 'email', 'profile').
 * @param {*} previousValue - Il valore precedente del campo.
 * @param {*} currentValue - Il nuovo valore del campo.
 * @param {string} userEmail - L'email dell'utente che ha apportato la modifica.
 * @param {string} userIdWhoMadeChange - L'ID dell'utente che ha apportato la modifica.
 */
async function saveInChangelog( // Funzione rinominata
    client,
    tableName,
    recordId,
    fieldModified,
    previousValue,
    currentValue,
    userEmail,
    userIdWhoMadeChange // NUOVO: Parametro per l'ID dell'utente che ha fatto la modifica
) {
    try {
        // 1. Recupera il changelog esistente per il record
        const getChangelogQuery = `
            SELECT changelog
            FROM ${tableName}
            WHERE id = $1;
        `;
        const res = await client.query(getChangelogQuery, [recordId]);
        
        // Se il changelog non esiste o è null, inizializzalo come array vuoto
        let currentChangelog = res.rows[0]?.changelog || [];

        // Assicurati che currentChangelog sia un array, altrimenti inizializzalo
        if (!Array.isArray(currentChangelog)) {
            console.warn(`[CHANGELOG-UTIL] Il campo changelog per ${tableName} (ID: ${recordId}) non è un array JSONB. Inizializzazione.`);
            currentChangelog = [];
        }

        // 2. Crea la nuova voce per il changelog
        const newEntry = {
            date: new Date().toISOString(),
            user_who_made_change: userEmail,
            id_user_who_made_change: userIdWhoMadeChange, // NUOVO: ID dell'utente che ha fatto la modifica
            field_modified: fieldModified,
            previous_value: previousValue,
            current_value: currentValue
        };

        // 3. Aggiungi la nuova voce al changelog
        currentChangelog.push(newEntry);

        // 4. Aggiorna il record con il nuovo changelog
        const updateChangelogQuery = `
            UPDATE ${tableName}
            SET changelog = $2
            WHERE id = $1;
        `;
        // JSON.stringify converte l'array JavaScript in una stringa JSON
        // che PostgreSQL può convertire in JSONB
        await client.query(updateChangelogQuery, [recordId, JSON.stringify(currentChangelog)]);

        console.log(`[CHANGELOG-UTIL] Voce changelog aggiunta per ${tableName} (ID: ${recordId}), campo '${fieldModified}'`);

    } catch (error) {
        console.error(`[CHANGELOG-UTIL] Errore durante l'aggiunta al changelog per ${tableName} (ID: ${recordId}):`, error.message);
        // È importante non bloccare l'operazione principale se il logging fallisce,
        // ma loggare l'errore per indagini future.
    }
}

module.exports = {
    saveInChangelog // Funzione esportata con il nuovo nome
};