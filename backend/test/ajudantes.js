// Funções auxiliares usadas pelos testes automatizados
import bcrypt from 'bcryptjs';
import { abrirBanco } from '../src/db.js';

export const logMudo = { info() {}, aviso() {}, erro() {} };

/** Banco novo e vazio, só na memória (some ao terminar o teste). */
export function novoBanco() {
  return abrirBanco(':memory:');
}

export function criarAdminTeste(db, usuario = 'admin', senha = 'senha-de-teste-123') {
  const r = db
    .prepare('INSERT INTO admins (usuario, senha_hash, ativo, criado_em) VALUES (?, ?, 1, ?)')
    .run(usuario, bcrypt.hashSync(senha, 4), new Date().toISOString());
  return Number(r.lastInsertRowid);
}

/** Relógio controlado pelo teste (para simular a passagem do tempo). */
export function relogioFalso(inicio = '2026-01-01T12:00:00.000Z') {
  let t = Date.parse(inicio);
  return {
    agora: () => new Date(t),
    avancar(ms) { t += ms; },
  };
}
