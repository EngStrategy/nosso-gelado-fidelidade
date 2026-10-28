// =============================================================
// Utilitários pequenos: erros, tokens e logger
// =============================================================
import crypto from 'node:crypto';

/** Erro "esperado" que vira uma resposta HTTP amigável. */
export class ErroApp extends Error {
  constructor(status, codigo, mensagem, extra = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

// Token do link do cliente: 18 bytes aleatórios = 144 bits de entropia,
// codificados em 24 caracteres seguros para URL (A-Z a-z 0-9 - _).
export const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

export function gerarTokenCliente() {
  return crypto.randomBytes(18).toString('base64url');
}

/** Mostra só o começo do token (para logs). */
export function mascararToken(token) {
  return typeof token === 'string' ? token.slice(0, 4) + '…' : '';
}

/**
 * Logger simples: uma linha por evento, com data/hora.
 * O PM2 grava a saída em arquivos (logs de saída e de erro).
 */
export function criarLogger({ silencioso = false } = {}) {
  const escrever = (fn, nivel, mensagem, dados) => {
    if (silencioso) return;
    const extra = dados && Object.keys(dados).length ? ' ' + JSON.stringify(dados) : '';
    fn(`[${new Date().toISOString()}] ${nivel} ${mensagem}${extra}`);
  };
  return {
    info: (m, d) => escrever(console.log, 'INFO ', m, d),
    aviso: (m, d) => escrever(console.warn, 'AVISO', m, d),
    erro: (m, d) => escrever(console.error, 'ERRO ', m, d),
  };
}
