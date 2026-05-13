const { Pool } = require('pg');

// O Pool gerencia múltiplas conexões automaticamente
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Obrigatório para o Neon/Vercel
  }
});

// Exportamos o pool para ser usado nas outras rotas
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool // caso precise de funções específicas do pool
};