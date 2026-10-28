// =============================================================
// Banco de dados SQLite: abertura e criação das tabelas
// -------------------------------------------------------------
// O banco é um único arquivo (padrão: backend/dados/fidelidade.db).
// Além das validações no código, o próprio banco tem "travas"
// (triggers) que garantem as regras mais importantes:
//   - nunca mais de 10 selos válidos por cartão;
//   - selo só entra em cartão "aberto";
//   - selo nunca é apagado (só anulado) e anulação não se desfaz;
//   - cada cliente tem no máximo 1 cartão aberto/completo.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT    NOT NULL,
  ativo       INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  nome_busca    TEXT    NOT NULL,          -- nome sem acentos/minúsculo, para a busca
  telefone      TEXT,                      -- só dígitos, com 55 na frente (opcional)
  observacao    TEXT,
  token         TEXT    NOT NULL UNIQUE,   -- segredo do link pessoal
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em     TEXT    NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_clientes_nome_busca ON clientes (nome_busca);

CREATE TABLE IF NOT EXISTS cartoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id     INTEGER NOT NULL REFERENCES clientes (id),
  numero_ciclo   INTEGER NOT NULL CHECK (numero_ciclo >= 1),
  status         TEXT    NOT NULL CHECK (status IN ('aberto', 'completo', 'resgatado')),
  criado_em      TEXT    NOT NULL,
  completado_em  TEXT,
  resgatado_em   TEXT,
  resgatado_por  INTEGER REFERENCES admins (id),
  UNIQUE (cliente_id, numero_ciclo),
  CHECK ((status = 'resgatado') = (resgatado_em IS NOT NULL AND resgatado_por IS NOT NULL))
);
-- No máximo 1 cartão aberto/completo por cliente
CREATE UNIQUE INDEX IF NOT EXISTS ux_cartoes_um_ativo
  ON cartoes (cliente_id) WHERE status IN ('aberto', 'completo');

CREATE TABLE IF NOT EXISTS selos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id          INTEGER NOT NULL REFERENCES cartoes (id),
  criado_em          TEXT    NOT NULL,
  criado_por         INTEGER NOT NULL REFERENCES admins (id),
  referencia_pedido  TEXT,
  anulado_em         TEXT,
  motivo_anulacao    TEXT,
  anulado_por        INTEGER REFERENCES admins (id),
  CHECK ((anulado_em IS NULL) = (anulado_por IS NULL)),
  CHECK (anulado_em IS NULL OR length(trim(coalesce(motivo_anulacao, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS ix_selos_cartao ON selos (cartao_id);

-- Registro de ações dos administradores (auditoria)
CREATE TABLE IF NOT EXISTS log_acoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em   TEXT    NOT NULL,
  admin_id    INTEGER REFERENCES admins (id),
  acao        TEXT    NOT NULL,
  cliente_id  INTEGER REFERENCES clientes (id),
  detalhes    TEXT
);
CREATE INDEX IF NOT EXISTS ix_log_acoes_cliente ON log_acoes (cliente_id);

-- ---------- Travas de segurança no próprio banco ----------
CREATE TRIGGER IF NOT EXISTS trg_selos_limite
BEFORE INSERT ON selos
WHEN (SELECT COUNT(*) FROM selos WHERE cartao_id = NEW.cartao_id AND anulado_em IS NULL) >= 10
BEGIN
  SELECT RAISE(ABORT, 'LIMITE_SELOS');
END;

CREATE TRIGGER IF NOT EXISTS trg_selos_cartao_aberto
BEFORE INSERT ON selos
WHEN (SELECT status FROM cartoes WHERE id = NEW.cartao_id) IS NOT 'aberto'
BEGIN
  SELECT RAISE(ABORT, 'CARTAO_NAO_ABERTO');
END;

CREATE TRIGGER IF NOT EXISTS trg_selos_sem_delete
BEFORE DELETE ON selos
BEGIN
  SELECT RAISE(ABORT, 'SELO_NAO_PODE_SER_APAGADO');
END;

CREATE TRIGGER IF NOT EXISTS trg_selos_anulacao_definitiva
BEFORE UPDATE ON selos
WHEN OLD.anulado_em IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SELO_JA_ANULADO');
END;
`;

/**
 * Abre (ou cria) o banco de dados.
 * @param {string} arquivo caminho do arquivo .db ou ':memory:' (testes)
 */
export function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  }
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');   // melhor desempenho e segurança contra queda
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(ESQUEMA);
  if (db.pragma('user_version', { simple: true }) === 0) {
    db.pragma('user_version = 1'); // versão do esquema (para futuras migrações)
  }
  return db;
}
