// =============================================================
// Configuração do servidor (lida do arquivo .env)
// -------------------------------------------------------------
// Todos os segredos e ajustes ficam no arquivo backend/.env,
// que NUNCA vai para o GitHub. Use o .env.example como modelo.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';

// Pasta raiz do backend (onde fica o package.json)
export const RAIZ_BACKEND = path.resolve(import.meta.dirname, '..');

/** Carrega o arquivo .env (se existir) para dentro de process.env. */
export function carregarArquivoEnv() {
  const arquivo = path.join(RAIZ_BACKEND, '.env');
  if (fs.existsSync(arquivo)) process.loadEnvFile(arquivo);
}

// Caminhos relativos no .env são resolvidos a partir da pasta backend/
function caminho(valor, padrao) {
  return path.resolve(RAIZ_BACKEND, valor || padrao);
}

// TRUST_PROXY: diz ao Express em quem confiar para descobrir o IP real
// do visitante. "loopback" = confia só no próprio notebook (127.0.0.1),
// que é de onde o Tailscale Funnel repassa as requisições.
function lerTrustProxy(valor) {
  if (valor === undefined || valor === '') return 'loopback';
  if (valor === 'false') return false;
  if (valor === 'true') return true;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

/** Monta o objeto de configuração a partir das variáveis de ambiente. */
export function carregarConfig(env = process.env) {
  return {
    porta: Number(env.PORT || 3000),
    host: env.HOST || '127.0.0.1',
    jwtSegredo: env.JWT_SECRET || '',
    jwtExpiraEm: env.JWT_EXPIRA_EM || '12h',
    corsOrigens: (env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    dbPath: caminho(env.DB_PATH, './dados/fidelidade.db'),
    backupDir: caminho(env.BACKUP_DIR, './backups'),
    backupManter: Number(env.BACKUP_MANTER || 14),
    trustProxy: lerTrustProxy(env.TRUST_PROXY),
    intervaloSeloMs: Number(env.INTERVALO_SELO_SEGUNDOS ?? 10) * 1000,
    frontUrl: (env.FRONT_URL || '').replace(/\/+$/, ''),
  };
}

/** Impede o servidor de subir com configuração insegura. */
export function validarConfigServidor(cfg) {
  const problemas = [];
  if (!cfg.jwtSegredo || cfg.jwtSegredo.length < 32 || /troque/i.test(cfg.jwtSegredo)) {
    problemas.push('JWT_SECRET ausente, curto (mínimo 32 caracteres) ou ainda com o valor de exemplo.');
  }
  if (cfg.corsOrigens.length === 0) {
    problemas.push('CORS_ORIGIN vazio: o site não conseguirá falar com a API.');
  }
  if (problemas.length) {
    throw new Error('Configuração inválida no arquivo .env:\n - ' + problemas.join('\n - '));
  }
}
