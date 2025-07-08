const { Pool } = require('pg'); // Importa la pool di connessioni al database PostgreSQL

// Configura il Pool di connessioni per PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Assicurati che DATABASE_URL sia configurato
    ssl: {
        rejectUnauthorized: false // Accetta certificati auto-firmati per connessioni SSL a Supabase
    }
});

module.exports = pool; 