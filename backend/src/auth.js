// =============================================================
// Autenticação do administrador (senha com bcrypt + token JWT)
// =============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ErroApp } from './util.js';

export const BCRYPT_CUSTO = 12;

// Hash fictício: usado quando o usuário não existe, para que a resposta
// demore o mesmo tempo (não revela quais usuários existem).
const HASH_FICTICIO = bcrypt.hashSync('senha-ficticia-apenas-para-tempo-constante', 10);

export function criarAuth(db, config) {
  const buscarPorUsuario = db.prepare('SELECT id, usuario, senha_hash, ativo FROM admins WHERE usuario = ?');
  const buscarPorId = db.prepare('SELECT id, usuario, ativo FROM admins WHERE id = ?');

  /** Confere usuário e senha e devolve um token JWT. */
  async function login(usuario, senha) {
    const admin = buscarPorUsuario.get(usuario);
    const senhaOk = await bcrypt.compare(senha, admin?.senha_hash ?? HASH_FICTICIO);
    if (!admin || !senhaOk || !admin.ativo) {
      throw new ErroApp(401, 'LOGIN_INVALIDO', 'Usuário ou senha incorretos.');
    }
    const token = jwt.sign(
      { sub: String(admin.id), usuario: admin.usuario },
      config.jwtSegredo,
      { algorithm: 'HS256', expiresIn: config.jwtExpiraEm },
    );
    const { exp } = jwt.decode(token);
    return { admin, token, expiraEm: new Date(exp * 1000).toISOString() };
  }

  /** Middleware: só deixa passar quem enviar um token válido de admin ativo. */
  function exigirAdmin(req, _res, next) {
    const cabecalho = req.get('authorization') || '';
    const m = /^Bearer\s+(\S+)$/i.exec(cabecalho);
    if (!m) return next(new ErroApp(401, 'NAO_AUTENTICADO', 'Faça login para continuar.'));
    try {
      const dados = jwt.verify(m[1], config.jwtSegredo, { algorithms: ['HS256'] });
      const admin = buscarPorId.get(Number(dados.sub));
      if (!admin || !admin.ativo) throw new Error('admin inexistente ou desativado');
      req.admin = { id: admin.id, usuario: admin.usuario };
      return next();
    } catch {
      return next(new ErroApp(401, 'SESSAO_EXPIRADA', 'Sua sessão expirou. Faça login novamente.'));
    }
  }

  return { login, exigirAdmin };
}
