// =============================================================
// Testes da API HTTP: autorização, CORS, validação, rate limit
// (sobe o servidor numa porta aleatória com banco em memória)
// =============================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { criarApp } from '../src/app.js';
import { novoBanco, criarAdminTeste, logMudo } from './ajudantes.js';

const ORIGEM = 'https://engstrategy.github.io';
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';

function configTeste(extra = {}) {
  return {
    jwtSegredo: SEGREDO,
    jwtExpiraEm: '12h',
    corsOrigens: [ORIGEM],
    trustProxy: 'loopback',
    intervaloSeloMs: 0,
    ...extra,
  };
}

async function subirServidor(config = configTeste()) {
  const db = novoBanco();
  const adminId = criarAdminTeste(db, 'admin', 'senha-de-teste-123');
  const app = criarApp({ db, config, log: logMudo });
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function chamar(metodo, caminho, { corpo, token, cabecalhos = {} } = {}) {
    const resp = await fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...cabecalhos,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await resp.text();
    return { status: resp.status, headers: resp.headers, corpo: texto ? JSON.parse(texto) : null };
  }

  const fechar = () => { servidor.closeAllConnections(); servidor.close(); db.close(); };
  return { db, adminId, chamar, fechar };
}

describe('API', () => {
  let s, token;

  before(async () => {
    s = await subirServidor();
    const r = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'admin', senha: 'senha-de-teste-123' } });
    assert.equal(r.status, 200);
    token = r.corpo.token;
  });
  after(() => s.fechar());

  it('health check responde', async () => {
    const r = await s.chamar('GET', '/api/saude');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.ok, true);
  });

  it('login com senha errada é recusado com mensagem genérica', async () => {
    const r1 = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'admin', senha: 'errada' } });
    const r2 = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'naoexiste', senha: 'errada' } });
    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
    assert.equal(r1.corpo.erro, r2.corpo.erro); // não revela se o usuário existe
  });

  it('todas as rotas de admin exigem login', async () => {
    const rotas = [
      ['GET', '/api/admin/clientes'],
      ['POST', '/api/admin/clientes'],
      ['GET', '/api/admin/clientes/1'],
      ['PATCH', '/api/admin/clientes/1'],
      ['POST', '/api/admin/clientes/1/regenerar-link'],
      ['POST', '/api/admin/clientes/1/selos'],
      ['POST', '/api/admin/clientes/1/resgatar'],
      ['POST', '/api/admin/selos/1/anular'],
    ];
    for (const [metodo, caminho] of rotas) {
      const r = await s.chamar(metodo, caminho, metodo === 'GET' ? {} : { corpo: {} });
      assert.equal(r.status, 401, `${metodo} ${caminho} deveria exigir login`);
    }
  });

  it('recusa token falsificado, com algoritmo "none" ou expirado', async () => {
    const falso = jwt.sign({ sub: '1' }, 'outro-segredo-qualquer-com-32-caracteres');
    const semAssinatura = jwt.sign({ sub: '1' }, null, { algorithm: 'none' });
    const expirado = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, SEGREDO);
    for (const t of [falso, semAssinatura, expirado, 'lixo']) {
      const r = await s.chamar('GET', '/api/admin/clientes', { token: t });
      assert.equal(r.status, 401);
    }
  });

  it('admin desativado perde o acesso na hora', async () => {
    const outroId = criarAdminTeste(s.db, 'temporario', 'senha-temporaria-1');
    const login = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'temporario', senha: 'senha-temporaria-1' } });
    s.db.prepare('UPDATE admins SET ativo = 0 WHERE id = ?').run(outroId);
    const r = await s.chamar('GET', '/api/admin/clientes', { token: login.corpo.token });
    assert.equal(r.status, 401);
  });

  it('valida as entradas', async () => {
    let r = await s.chamar('POST', '/api/admin/clientes', { token, corpo: { nome: '   ' } });
    assert.equal(r.status, 400);
    r = await s.chamar('POST', '/api/admin/clientes', { token, corpo: { nome: 'Ana', admin: true } });
    assert.equal(r.status, 400, 'campo desconhecido é recusado');
    r = await s.chamar('POST', '/api/admin/clientes', { token, corpo: { nome: 'Ana', telefone: '123' } });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.codigo, 'TELEFONE_INVALIDO');
    r = await s.chamar('GET', '/api/admin/clientes/abc', { token });
    assert.equal(r.status, 400);
    r = await s.chamar('POST', '/api/admin/selos/1/anular', { token, corpo: {} });
    assert.equal(r.status, 400, 'motivo obrigatório');
  });

  it('fluxo completo: cadastrar, 10 selos, 11º recusado, anular, resgatar', async () => {
    let r = await s.chamar('POST', '/api/admin/clientes', { token, corpo: { nome: 'Maria Souza', telefone: '(89) 99450-7551' } });
    assert.equal(r.status, 201);
    const { id, token: tokenCliente } = r.corpo.cliente;

    for (let i = 0; i < 10; i++) {
      r = await s.chamar('POST', `/api/admin/clientes/${id}/selos`, { token });
      assert.equal(r.status, 201);
    }
    assert.equal(r.corpo.cartao.status, 'completo');

    r = await s.chamar('POST', `/api/admin/clientes/${id}/selos`, { token });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.codigo, 'CARTAO_COMPLETO');

    const seloId = r.corpo.historico?.[0]?.id ?? (await s.chamar('GET', `/api/admin/clientes/${id}`, { token })).corpo.historico[0].id;
    r = await s.chamar('POST', `/api/admin/selos/${seloId}/anular`, { token, corpo: { motivo: 'Lançado por engano' } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.cartao.selos, 9);
    assert.equal(r.corpo.historico[0].anuladoPor, 'admin');

    await s.chamar('POST', `/api/admin/clientes/${id}/selos`, { token });
    r = await s.chamar('POST', `/api/admin/clientes/${id}/resgatar`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.cartao.ciclo, 2);

    const pub = await s.chamar('GET', `/api/publico/cartao/${tokenCliente}`);
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.corpo).sort(), ['faltam', 'primeiroNome', 'resgates', 'selos', 'status', 'total']);
    assert.equal(pub.corpo.resgates, 1);
  });

  it('rota pública: token inválido e cliente desativado recebem a MESMA resposta', async () => {
    const criado = await s.chamar('POST', '/api/admin/clientes', { token, corpo: { nome: 'Desativado' } });
    await s.chamar('PATCH', `/api/admin/clientes/${criado.corpo.cliente.id}`, { token, corpo: { ativo: false } });
    const a = await s.chamar('GET', `/api/publico/cartao/${criado.corpo.cliente.token}`);
    const b = await s.chamar('GET', `/api/publico/cartao/${'x'.repeat(24)}`);
    const c = await s.chamar('GET', '/api/publico/cartao/1');
    for (const r of [a, b, c]) assert.equal(r.status, 404);
    assert.equal(a.corpo.erro, b.corpo.erro);
    assert.equal(b.corpo.erro, c.corpo.erro);
  });

  it('a rota pública não aceita escrita', async () => {
    const r = await s.chamar('POST', `/api/publico/cartao/${'x'.repeat(24)}`, { corpo: {} });
    assert.equal(r.status, 404);
  });

  it('CORS: só libera a origem configurada', async () => {
    const ok = await s.chamar('GET', '/api/saude', { cabecalhos: { Origin: ORIGEM } });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGEM);
    const ruim = await s.chamar('GET', '/api/saude', { cabecalhos: { Origin: 'https://site-malicioso.com' } });
    assert.equal(ruim.headers.get('access-control-allow-origin'), null);
  });

  it('respostas não ficam em cache e têm cabeçalhos de segurança', async () => {
    const r = await s.chamar('GET', '/api/saude');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });
});

describe('API: proteção do login', () => {
  it('bloqueia após 5 tentativas erradas', async () => {
    const s = await subirServidor();
    try {
      for (let i = 0; i < 5; i++) {
        const r = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'admin', senha: 'errada' } });
        assert.equal(r.status, 401);
      }
      const r = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'admin', senha: 'senha-de-teste-123' } });
      assert.equal(r.status, 429, 'mesmo com a senha certa, fica bloqueado por 15 min');
    } finally {
      s.fechar();
    }
  });

  it('bloqueio de clique duplo também vale pela API (429 com segundos restantes)', async () => {
    const s = await subirServidor(configTeste({ intervaloSeloMs: 10_000 }));
    try {
      const { corpo: { token } } = await s.chamar('POST', '/api/admin/login', { corpo: { usuario: 'admin', senha: 'senha-de-teste-123' } });
      const { corpo } = await s.chamar('POST', '/api/admin/clientes', { token, corpo: { nome: 'Ana' } });
      const r1 = await s.chamar('POST', `/api/admin/clientes/${corpo.cliente.id}/selos`, { token });
      const r2 = await s.chamar('POST', `/api/admin/clientes/${corpo.cliente.id}/selos`, { token });
      assert.equal(r1.status, 201);
      assert.equal(r2.status, 429);
      assert.equal(r2.corpo.codigo, 'SELO_RECENTE');
      assert.ok(r2.corpo.segundosRestantes > 0);
    } finally {
      s.fechar();
    }
  });
});
