// =============================================================
// Restaurar um backup
//   npm run restaurar                       -> lista os backups disponíveis
//   npm run restaurar -- fidelidade-2026-10-28_030000.db
//
// ATENÇÃO: pare o sistema antes (pm2 stop nosso-gelado).
// O banco atual NÃO é perdido: é guardado em dados/antes-de-restaurar-*.db
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { carregarArquivoEnv, carregarConfig } from '../src/config.js';

carregarArquivoEnv();
const config = carregarConfig();

const p = (n) => String(n).padStart(2, '0');
const d = new Date();
const agora = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;

const nome = process.argv[2];
const disponiveis = fs.existsSync(config.backupDir)
  ? fs.readdirSync(config.backupDir).filter((f) => f.endsWith('.db')).sort().reverse()
  : [];

if (!nome) {
  console.log('Backups disponíveis (mais recente primeiro):');
  disponiveis.forEach((f) => console.log('  ' + f));
  if (!disponiveis.length) console.log('  (nenhum)');
  console.log('\nUso: npm run restaurar -- NOME-DO-ARQUIVO.db');
  process.exit(0);
}

// 1) O sistema precisa estar parado
try {
  const r = await fetch(`http://127.0.0.1:${config.porta}/api/saude`, { signal: AbortSignal.timeout(2000) });
  if (r.ok) {
    console.error('✖ O sistema ainda está rodando. Pare antes com:  pm2 stop nosso-gelado');
    process.exit(1);
  }
} catch {
  // não respondeu = está parado, pode seguir
}

// 2) O backup precisa existir e estar íntegro
const arquivoBackup = path.join(config.backupDir, path.basename(nome));
if (!fs.existsSync(arquivoBackup)) {
  console.error(`✖ Arquivo não encontrado: ${arquivoBackup}`);
  process.exit(1);
}
const teste = new Database(arquivoBackup, { readonly: true, fileMustExist: true });
const integridade = teste.pragma('integrity_check', { simple: true });
teste.close();
if (integridade !== 'ok') {
  console.error(`✖ O backup está corrompido (${integridade}). Escolha outro.`);
  process.exit(1);
}

// 3) Guarda uma cópia do banco atual, por precaução
if (fs.existsSync(config.dbPath)) {
  const seguranca = path.join(path.dirname(config.dbPath), `antes-de-restaurar-${agora}.db`);
  const atual = new Database(config.dbPath);
  await atual.backup(seguranca);
  atual.close();
  console.log(`  cópia de segurança do banco atual: ${seguranca}`);
  for (const sufixo of ['', '-wal', '-shm']) {
    fs.rmSync(config.dbPath + sufixo, { force: true });
  }
}

// 4) Coloca o backup no lugar
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.copyFileSync(arquivoBackup, config.dbPath);
console.log(`✔ Backup ${path.basename(nome)} restaurado.`);
console.log('  Agora inicie o sistema de novo:  pm2 start nosso-gelado');
