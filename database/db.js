// database/db.js
// Conexao e inicializacao do banco de dados SQLite

const fs = require('fs');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

function resolveDbPath() {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }

  if (process.env.NODE_ENV === 'production') {
    return '/tmp/juliana.db';
  }

  const baseDir = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'JulianaTransportes')
    : path.join(os.tmpdir(), 'JulianaTransportes');

  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'juliana.db');
}

const DB_PATH = resolveDbPath();

let rawDb;
let dbWrapper;
let initPromise;

function getDb() {
  if (!dbWrapper) {
    rawDb = new sqlite3.Database(DB_PATH);
    dbWrapper = createWrapper(rawDb);
    initPromise = initTables();
  }

  return dbWrapper;
}

function createWrapper(db) {
  return {
    prepare(sql) {
      return {
        get: (...params) => withInit(() => queryGet(db, sql, params)),
        all: (...params) => withInit(() => queryAll(db, sql, params)),
        run: (...params) => withInit(() => queryRun(db, sql, params))
      };
    },
    exec: (sql) => withInit(() => queryExec(db, sql))
  };
}

function withInit(operation) {
  return initPromise.then(operation);
}

function queryGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function queryAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function queryRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else {
        resolve({
          lastInsertRowid: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}

function queryExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function initTables() {
  await queryExec(rawDb, 'PRAGMA foreign_keys = ON;');

  await queryExec(rawDb, `
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_responsavel TEXT NOT NULL,
      telefone TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      endereco TEXT,
      nome_aluno TEXT NOT NULL,
      escola TEXT,
      rota TEXT,
      valor_mensalidade REAL NOT NULL DEFAULT 0,
      vencimento INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','atrasada','paga')),
      observacoes TEXT,
      data_cadastro TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  await queryExec(rawDb, `
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
      nome_cliente TEXT,
      valor REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago','falha')),
      forma_pagamento TEXT DEFAULT 'pix',
      id_transacao TEXT,
      id_preferencia TEXT,
      qrcode_base64 TEXT,
      qrcode_copia_cola TEXT,
      data_criacao TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      data_pagamento TEXT,
      webhook_recebido INTEGER DEFAULT 0,
      webhook_data TEXT
    );
  `);

  await queryExec(rawDb, `
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL
    );
  `);

  const admin = await queryGet(
    rawDb,
    'SELECT * FROM admin WHERE usuario = ?',
    [process.env.ADMIN_USER || 'admin']
  );

  if (!admin) {
    const hash = bcrypt.hashSync(process.env.ADMIN_SENHA || 'admin123', 10);
    await queryRun(
      rawDb,
      'INSERT INTO admin (usuario, senha_hash) VALUES (?, ?)',
      [process.env.ADMIN_USER || 'admin', hash]
    );
    console.log('Admin padrao criado. Usuario: admin | Senha: admin123');
  }
}

module.exports = { getDb };
