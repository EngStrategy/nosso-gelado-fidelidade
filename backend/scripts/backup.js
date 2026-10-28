// =============================================================
// Backup do banco de dados
//   npm run backup
//
// Faz uma cópia SEGURA do banco (mesmo com o sistema rodando),
// confere se a cópia está íntegra e apaga as mais antigas,
// mantendo as últimas BACKUP_MANTER (padrão 14).
// O cron do Ubuntu roda este script todo dia (ver README).
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { carregarArquivoEnv, carregarConfig } from '../src/config.js';

carregarArquivoEnv();
const config = carregarConfig();

/** Data/hora local no formato 2026-10-28_153000 (ordena certinho). */
export function carimbo(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

if (!fs.existsSync(config.dbPath)) {
  console.error(`✖ Banco não encontrado em ${config.dbPath}`);
  process.exit(1);
}

fs.mkdirSync(config.backupDir, { recursive: true });
const destino = path.join(config.backupDir, `fidelidade-${carimbo()}.db`);

const origem = new Database(config.dbPath, { fileMustExist: true });
await origem.backup(destino);
origem.close();

// Confere a cópia e deixa ela como arquivo único (sem -wal/-shm)
const copia = new Database(destino);
copia.pragma('journal_mode = DELETE');
const integridade = copia.pragma('integrity_check', { simple: true });
copia.close();
if (integridade !== 'ok') {
  console.error(`✖ Backup criado, mas falhou na verificação: ${integridade}`);
  process.exit(1);
}
console.log(`[${new Date().toISOString()}] ✔ Backup criado: ${destino}`);

// Remove os backups mais antigos
const arquivos = fs.readdirSync(config.backupDir)
  .filter((f) => /^fidelidade-\d{4}-\d{2}-\d{2}_\d{6}\.db$/.test(f))
  .sort();
const excedentes = arquivos.slice(0, Math.max(0, arquivos.length - config.backupManter));
for (const f of excedentes) {
  fs.unlinkSync(path.join(config.backupDir, f));
  console.log(`  removido backup antigo: ${f}`);
}
