// =============================================================
// Testes das REGRAS DE NEGÓCIO (rode com: npm test)
// =============================================================
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarServico, normalizarTelefone } from '../src/servico.js';
import { TOKEN_REGEX } from '../src/util.js';
import { novoBanco, criarAdminTeste, relogioFalso } from './ajudantes.js';

let db, servico, relogio, adminId;

beforeEach(() => {
  db = novoBanco();
  adminId = criarAdminTeste(db);
  relogio = relogioFalso();
  servico = criarServico(db, { agora: relogio.agora, intervaloSeloMs: 10_000 });
});

/** Lança N selos, avançando 11 s entre eles (fora do bloqueio de clique duplo). */
function lancar(clienteId, n) {
  let r;
  for (let i = 0; i < n; i++) {
    relogio.avancar(11_000);
    r = servico.lancarSelo(clienteId, adminId);
  }
  return r;
}

function novoCliente(nome = 'Maria Souza', telefone = null) {
  return servico.criarCliente({ nome, telefone }, adminId).cliente.id;
}

const codigoDoErro = (codigo) => (e) => e.codigo === codigo;

describe('cadastro de cliente', () => {
  it('gera token secreto de 24 caracteres e abre o cartão 1 zerado', () => {
    const r = servico.criarCliente({ nome: '  Maria Souza ' }, adminId);
    assert.match(r.cliente.token, TOKEN_REGEX);
    assert.equal(r.cliente.nome, 'Maria Souza');
    assert.deepEqual(
      { ciclo: r.cartao.ciclo, status: r.cartao.status, selos: r.cartao.selos },
      { ciclo: 1, status: 'aberto', selos: 0 },
    );
  });

  it('tokens de clientes diferentes são diferentes', () => {
    const tokens = new Set();
    for (let i = 0; i < 50; i++) tokens.add(servico.criarCliente({ nome: `C${i}` }, adminId).cliente.token);
    assert.equal(tokens.size, 50);
  });

  it('normaliza o telefone para o formato do WhatsApp e recusa inválidos', () => {
    assert.equal(normalizarTelefone('(89) 99450-7551'), '5589994507551');
    assert.equal(normalizarTelefone('55 89 99450-7551'), '5589994507551');
    assert.equal(normalizarTelefone(''), null);
    assert.throws(() => normalizarTelefone('12345'), codigoDoErro('TELEFONE_INVALIDO'));
  });

  it('busca por nome ignora acentos e maiúsculas; busca por telefone usa os dígitos', () => {
    novoCliente('José Antônio', '(89) 99450-7551');
    novoCliente('Maria');
    assert.equal(servico.listarClientes({ busca: 'jose antonio' }).length, 1);
    assert.equal(servico.listarClientes({ busca: '99450' }).length, 1);
    assert.equal(servico.listarClientes({ busca: '%' }).length, 0); // curinga não "vaza" tudo
    assert.equal(servico.listarClientes({}).length, 2);
  });
});

describe('limite de 10 selos', () => {
  it('o 10º selo completa o cartão', () => {
    const id = novoCliente();
    let r = lancar(id, 9);
    assert.equal(r.cartao.status, 'aberto');
    assert.equal(r.cartao.faltam, 1);
    r = lancar(id, 1);
    assert.equal(r.cartao.selos, 10);
    assert.equal(r.cartao.status, 'completo');
  });

  it('o 11º selo é recusado e a contagem continua 10', () => {
    const id = novoCliente();
    lancar(id, 10);
    relogio.avancar(11_000);
    assert.throws(() => servico.lancarSelo(id, adminId), codigoDoErro('CARTAO_COMPLETO'));
    assert.equal(servico.obterCliente(id).cartao.selos, 10);
  });

  it('o próprio banco impede o 11º selo mesmo se alguém burlar o código', () => {
    const id = novoCliente();
    const { cartao } = lancar(id, 10);
    const inserir = db.prepare('INSERT INTO selos (cartao_id, criado_em, criado_por) VALUES (?, ?, ?)');
    // cartão completo: trava "só em cartão aberto"
    assert.throws(() => inserir.run(cartao.id, new Date().toISOString(), adminId), /CARTAO_NAO_ABERTO/);
    // forçando o status para "aberto": trava "máximo 10"
    db.prepare(`UPDATE cartoes SET status = 'aberto' WHERE id = ?`).run(cartao.id);
    assert.throws(() => inserir.run(cartao.id, new Date().toISOString(), adminId), /LIMITE_SELOS/);
  });
});

describe('proteção contra clique duplo', () => {
  it('bloqueia um segundo selo em menos de 10 s para o mesmo cliente', () => {
    const id = novoCliente();
    servico.lancarSelo(id, adminId);
    relogio.avancar(3_000);
    assert.throws(
      () => servico.lancarSelo(id, adminId),
      (e) => e.codigo === 'SELO_RECENTE' && e.status === 429 && e.extra.segundosRestantes === 7,
    );
    assert.equal(servico.obterCliente(id).cartao.selos, 1);
    relogio.avancar(7_000);
    assert.equal(servico.lancarSelo(id, adminId).cartao.selos, 2);
  });

  it('não bloqueia clientes diferentes', () => {
    const a = novoCliente('A');
    const b = novoCliente('B');
    servico.lancarSelo(a, adminId);
    assert.equal(servico.lancarSelo(b, adminId).cartao.selos, 1);
  });
});

describe('anulação de selo', () => {
  it('exige motivo', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 1);
    assert.throws(() => servico.anularSelo(historico[0].id, adminId, '  '), codigoDoErro('MOTIVO_OBRIGATORIO'));
  });

  it('marca como anulado (sem apagar), registra quem/quando/motivo e reduz a contagem', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 3);
    const r = servico.anularSelo(historico[0].id, adminId, 'Lançado por engano');
    assert.equal(r.cartao.selos, 2);
    const linha = db.prepare('SELECT * FROM selos WHERE id = ?').get(historico[0].id);
    assert.ok(linha, 'o selo continua no banco');
    assert.ok(linha.anulado_em);
    assert.equal(linha.anulado_por, adminId);
    assert.equal(linha.motivo_anulacao, 'Lançado por engano');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM selos').get().n, 3);
  });

  it('não pode anular o mesmo selo duas vezes', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 1);
    servico.anularSelo(historico[0].id, adminId, 'engano');
    assert.throws(() => servico.anularSelo(historico[0].id, adminId, 'engano'), codigoDoErro('SELO_JA_ANULADO'));
  });

  it('anular um selo de cartão completo faz o cartão voltar a "aberto"', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 10);
    const r = servico.anularSelo(historico[0].id, adminId, 'engano');
    assert.equal(r.cartao.status, 'aberto');
    assert.equal(r.cartao.selos, 9);
    assert.equal(lancar(id, 1).cartao.status, 'completo');
  });

  it('selos nunca podem ser apagados do banco', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 1);
    assert.throws(() => db.prepare('DELETE FROM selos WHERE id = ?').run(historico[0].id), /SELO_NAO_PODE_SER_APAGADO/);
  });
});

describe('resgate do prêmio', () => {
  it('só é permitido com o cartão completo', () => {
    const id = novoCliente();
    lancar(id, 9);
    assert.throws(() => servico.resgatarPremio(id, adminId), codigoDoErro('CARTAO_NAO_COMPLETO'));
  });

  it('marca o cartão como resgatado (com data e responsável) e abre um novo zerado', () => {
    const id = novoCliente();
    lancar(id, 10);
    const r = servico.resgatarPremio(id, adminId);
    assert.deepEqual({ ciclo: r.cartao.ciclo, status: r.cartao.status, selos: r.cartao.selos }, { ciclo: 2, status: 'aberto', selos: 0 });
    assert.equal(r.resgates, 1);
    const antigo = db.prepare('SELECT * FROM cartoes WHERE cliente_id = ? AND numero_ciclo = 1').get(id);
    assert.equal(antigo.status, 'resgatado');
    assert.equal(antigo.resgatado_por, adminId);
    assert.ok(antigo.resgatado_em);
  });

  it('clicar duas vezes em "resgatar" não gera dois prêmios', () => {
    const id = novoCliente();
    lancar(id, 10);
    servico.resgatarPremio(id, adminId);
    assert.throws(() => servico.resgatarPremio(id, adminId), codigoDoErro('CARTAO_NAO_COMPLETO'));
    assert.equal(servico.obterCliente(id).resgates, 1);
  });

  it('selos de cartão já resgatado não podem ser anulados', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 10);
    servico.resgatarPremio(id, adminId);
    assert.throws(() => servico.anularSelo(historico[0].id, adminId, 'tentativa'), codigoDoErro('CARTAO_RESGATADO'));
  });
});

describe('link do cliente e visão pública', () => {
  it('mostra só primeiro nome, selos, status e resgates (sem telefone nem id)', () => {
    const r = servico.criarCliente({ nome: 'Maria Souza Lima', telefone: '(89) 99450-7551' }, adminId);
    lancar(r.cliente.id, 4);
    const publico = servico.cartaoPublico(r.cliente.token);
    assert.deepEqual(publico, { primeiroNome: 'Maria', selos: 4, total: 10, faltam: 6, status: 'aberto', resgates: 0 });
  });

  it('token inexistente ou malformado retorna nada', () => {
    assert.equal(servico.cartaoPublico('A'.repeat(24)), null);
    assert.equal(servico.cartaoPublico('1'), null);
    assert.equal(servico.cartaoPublico("' OR 1=1 --"), null);
  });

  it('regenerar o link invalida o anterior', () => {
    const r = servico.criarCliente({ nome: 'Ana' }, adminId);
    const novo = servico.regenerarLink(r.cliente.id, adminId);
    assert.notEqual(novo.cliente.token, r.cliente.token);
    assert.equal(servico.cartaoPublico(r.cliente.token), null);
    assert.equal(servico.cartaoPublico(novo.cliente.token).primeiroNome, 'Ana');
  });

  it('cliente desativado: link para de funcionar e não recebe selos; dados continuam guardados', () => {
    const r = servico.criarCliente({ nome: 'Pedro' }, adminId);
    lancar(r.cliente.id, 2);
    servico.atualizarCliente(r.cliente.id, { ativo: false }, adminId);
    assert.equal(servico.cartaoPublico(r.cliente.token), null);
    relogio.avancar(11_000);
    assert.throws(() => servico.lancarSelo(r.cliente.id, adminId), codigoDoErro('CLIENTE_INATIVO'));
    assert.equal(servico.obterCliente(r.cliente.id).cartao.selos, 2);
    // reativando, volta a funcionar
    servico.atualizarCliente(r.cliente.id, { ativo: true }, adminId);
    assert.equal(servico.cartaoPublico(r.cliente.token).selos, 2);
  });
});

describe('auditoria', () => {
  it('registra lançar, anular e resgatar no log de ações', () => {
    const id = novoCliente();
    const { historico } = lancar(id, 10);
    servico.anularSelo(historico[0].id, adminId, 'engano');
    lancar(id, 1);
    servico.resgatarPremio(id, adminId);
    const acoes = db.prepare('SELECT acao, COUNT(*) AS n FROM log_acoes WHERE cliente_id = ? GROUP BY acao').all(id);
    const mapa = Object.fromEntries(acoes.map((a) => [a.acao, a.n]));
    assert.deepEqual(mapa, { criar_cliente: 1, lancar_selo: 11, anular_selo: 1, resgatar_premio: 1 });
  });
});
