// =============================================================
// Aplicação Express: rotas da API
// -------------------------------------------------------------
//  Público (sem login, só leitura):
//    GET  /api/saude
//    GET  /api/publico/cartao/:token
//  Admin (exige login):
//    POST /api/admin/login
//    GET  /api/admin/eu
//    GET  /api/admin/clientes?busca=&incluirInativos=1
//    POST /api/admin/clientes
//    GET  /api/admin/clientes/:id
//    PATCH /api/admin/clientes/:id
//    POST /api/admin/clientes/:id/regenerar-link
//    POST /api/admin/clientes/:id/selos
//    POST /api/admin/clientes/:id/resgatar
//    POST /api/admin/selos/:id/anular
// =============================================================
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';

import { criarAuth } from './auth.js';
import { criarServico } from './servico.js';
import { ErroApp, mascararToken } from './util.js';
import {
  esquemaLogin, esquemaNovoCliente, esquemaEditarCliente, esquemaLancarSelo,
  esquemaAnularSelo, esquemaBusca, esquemaId,
} from './validacao.js';

const MENSAGEM_CARTAO_NAO_ENCONTRADO =
  'Não encontramos este cartão. Confira o link ou fale com o Nosso Gelado.';

/** Limitador de requisições que responde no mesmo formato de erro da API. */
function limitador({ janelaMs, limite, mensagem, ...resto }) {
  return rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ erro: mensagem, codigo: 'MUITAS_TENTATIVAS' }),
    ...resto,
  });
}

/**
 * Cria a aplicação. Recebe o banco e a configuração por parâmetro
 * (assim os testes podem usar um banco em memória).
 */
export function criarApp({ db, config, log }) {
  const servico = criarServico(db, { intervaloSeloMs: config.intervaloSeloMs, log, agora: config.agora });
  const auth = criarAuth(db, config);
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigens,                // só o site do GitHub Pages
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');      // dados sempre atualizados, nada em cache
    next();
  });

  // Limite geral (proteção básica contra abuso)
  app.use('/api', limitador({ janelaMs: 60_000, limite: 300, mensagem: 'Muitas requisições. Aguarde um minuto.' }));

  // ---------------- Rotas públicas ----------------

  app.get('/api/saude', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, hora: new Date().toISOString() });
  });

  const limitePublico = limitador({
    janelaMs: 60_000, limite: 60, mensagem: 'Muitas consultas. Aguarde um minuto e tente de novo.',
  });
  app.get('/api/publico/cartao/:token', limitePublico, (req, res) => {
    const cartao = servico.cartaoPublico(req.params.token);
    if (!cartao) {
      log.aviso('consulta pública com token inválido', { ip: req.ip, token: mascararToken(req.params.token) });
      return res.status(404).json({ erro: MENSAGEM_CARTAO_NAO_ENCONTRADO, codigo: 'NAO_ENCONTRADO' });
    }
    res.json(cartao);
  });

  // ---------------- Login do admin ----------------

  const limiteLogin = limitador({
    janelaMs: 15 * 60_000,
    limite: 5,
    skipSuccessfulRequests: true,              // só as tentativas erradas contam
    mensagem: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
  });
  app.post('/api/admin/login', limiteLogin, async (req, res) => {
    const { usuario, senha } = esquemaLogin.parse(req.body ?? {});
    try {
      const { admin, token, expiraEm } = await auth.login(usuario, senha);
      servico.registrar(admin.id, 'login', null);
      res.json({ token, usuario: admin.usuario, expiraEm });
    } catch (erro) {
      log.aviso('login recusado', { ip: req.ip });
      throw erro;
    }
  });

  // ---------------- Rotas do admin (todas exigem login) ----------------

  const admin = express.Router();
  admin.use(auth.exigirAdmin);

  admin.get('/eu', (req, res) => res.json({ usuario: req.admin.usuario }));

  admin.get('/clientes', (req, res) => {
    const { busca, incluirInativos } = esquemaBusca.parse(req.query);
    res.json({ clientes: servico.listarClientes({ busca, incluirInativos: incluirInativos === '1' }) });
  });

  admin.post('/clientes', (req, res) => {
    const dados = esquemaNovoCliente.parse(req.body ?? {});
    res.status(201).json(servico.criarCliente(dados, req.admin.id));
  });

  admin.get('/clientes/:id', (req, res) => {
    res.json(servico.obterCliente(esquemaId.parse(req.params.id)));
  });

  admin.patch('/clientes/:id', (req, res) => {
    const id = esquemaId.parse(req.params.id);
    const dados = esquemaEditarCliente.parse(req.body ?? {});
    res.json(servico.atualizarCliente(id, dados, req.admin.id));
  });

  admin.post('/clientes/:id/regenerar-link', (req, res) => {
    res.json(servico.regenerarLink(esquemaId.parse(req.params.id), req.admin.id));
  });

  admin.post('/clientes/:id/selos', (req, res) => {
    const id = esquemaId.parse(req.params.id);
    const dados = esquemaLancarSelo.parse(req.body ?? {});
    res.status(201).json(servico.lancarSelo(id, req.admin.id, dados));
  });

  admin.post('/clientes/:id/resgatar', (req, res) => {
    res.json(servico.resgatarPremio(esquemaId.parse(req.params.id), req.admin.id));
  });

  admin.post('/selos/:id/anular', (req, res) => {
    const id = esquemaId.parse(req.params.id);
    const { motivo } = esquemaAnularSelo.parse(req.body ?? {});
    res.json(servico.anularSelo(id, req.admin.id, motivo));
  });

  app.use('/api/admin', admin);

  // ---------------- 404 e tratamento de erros ----------------

  app.use((_req, res) => {
    res.status(404).json({ erro: 'Endereço não encontrado.', codigo: 'ROTA_INEXISTENTE' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof ZodError) {
      const campos = err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
      return res.status(400).json({ erro: campos[0]?.mensagem || 'Dados inválidos.', codigo: 'DADOS_INVALIDOS', campos });
    }
    if (err instanceof ErroApp) {
      return res.status(err.status).json({ erro: err.message, codigo: err.codigo, ...err.extra });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ erro: 'Dados inválidos.', codigo: 'JSON_INVALIDO' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ erro: 'Dados grandes demais.', codigo: 'MUITO_GRANDE' });
    }
    if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      // Uma trava do banco impediu a operação (ex.: 11º selo)
      log.aviso('operação barrada por trava do banco', { motivo: err.message, rota: req.originalUrl });
      return res.status(409).json({ erro: 'Operação não permitida pelas regras do cartão.', codigo: 'CONFLITO' });
    }
    log.erro('erro inesperado', { rota: req.originalUrl, mensagem: err.message, pilha: err.stack });
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.', codigo: 'ERRO_INTERNO' });
  });

  return app;
}
