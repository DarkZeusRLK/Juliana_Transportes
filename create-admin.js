require('dotenv').config({ path: './.env.local' });

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function createAdmin() {
  try {
    const senha = 'julianacarla123';

    const hash = bcrypt.hashSync(senha, 10);

    console.log('HASH GERADO:', hash);

    await pool.query(`
      INSERT INTO admin (usuario, senha_hash)
      VALUES ($1, $2)
      ON CONFLICT (usuario)
      DO UPDATE SET senha_hash = EXCLUDED.senha_hash
    `, ['juliana', hash]);

    console.log('Administrador criado com sucesso!');
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

createAdmin();