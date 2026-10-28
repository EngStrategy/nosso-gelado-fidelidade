// =============================================================
// Ponto de entrada: inicia o servidor da API
//   npm start        (produção, via PM2)
//   npm run dev      (desenvolvimento, reinicia ao salvar)
// =============================================================
import { carregarArquivoEnv, carregarConfig, validarConfigServidor } from './config.js';
import { abrirBanco } from './db.js';
import { criarApp } from './app.js';
import { criarLogger } from './util.js';

carregarArquivoEnv();
const config = carregarConfig();
const log = criarLogger();

try {
  validarConfigServidor(config);
} catch (erro) {
  log.erro(erro.message);
  process.exit(1);
}

const db = abrirBanco(config.dbPath);
const totalAdmins = db.prepare('SELECT COUNT(*) AS n FROM admins WHERE ativo = 1').get().n;
if (totalAdmins === 0) {
  log.aviso('Nenhum administrador cadastrado. Rode: npm run criar-admin');
}

const app = criarApp({ db, config, log });
const servidor = app.listen(config.porta, config.host, () => {
  log.info(`API Nosso Gelado rodando em http://${config.host}:${config.porta}`, {
    banco: config.dbPath,
    cors: config.corsOrigens,
  });
});

// Desligamento organizado (PM2 envia SIGINT/SIGTERM ao reiniciar)
function encerrar(sinal) {
  log.info(`recebido ${sinal}, encerrando...`);
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
