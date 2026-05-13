// server.js
// Servidor principal Express

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middlewares globais
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// Rotas da API
app.use('/api/auth',       require('./api/auth'));
app.use('/api/clientes',   require('./api/clientes'));
app.use('/api/pagamentos', require('./api/pagamentos'));
app.use('/api/pix',        require('./api/pix'));

// Webhook do Mercado Pago (sem autenticação JWT — vem do MP)
app.post('/webhook/mercadopago', require('./api/pix').webhookHandler);

// SPA fallback — redireciona tudo para index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚌 Juliana Transportes rodando na porta ${PORT}`);
});

module.exports = app;