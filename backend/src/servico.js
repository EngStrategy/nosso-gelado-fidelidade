// =============================================================
// Regras de negócio do cartão fidelidade
// -------------------------------------------------------------
// Tudo que altera dados roda dentro de uma TRANSAÇÃO: ou a
// operação inteira dá certo, ou nada é gravado.
// =============================================================
import { ErroApp, TOKEN_REGEX, gerarTokenCliente } from './util.js';

export const SELOS_POR_CARTAO = 10;

/** "José  da Silva" -> "jose da silva" (para buscar sem se preocupar com acento). */
export function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza o telefone para o formato do WhatsApp: só dígitos, com 55.
 * "(89) 99450-7551" -> "5589994507551". Vazio -> null.
 */
export function normalizarTelefone(valor) {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos === '') return null;
  const completo = digitos.length === 10 || digitos.length === 11 ? '55' + digitos : digitos;
  if (!/^55\d{10,11}$/.test(completo)) {
    throw new ErroApp(400, 'TELEFONE_INVALIDO',
      'Telefone inválido. Informe DDD + número, ex.: (89) 99450-7551.');
  }
  return completo;
}

function textoOuNull(valor) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t === '' ? null : t;
}

function primeiroNome(nome) {
  return String(nome).trim().split(/\s+/)[0] || '';
}

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, '\\$&');
}

/**
 * Cria o "serviço" com todas as operações.
 * @param {import('better-sqlite3').Database} db
 * @param {{agora?: () => Date, intervaloSeloMs?: number, log?: object}} opcoes
 */
export function criarServico(db, opcoes = {}) {
  const agora = opcoes.agora ?? (() => new Date());
  const intervaloSeloMs = opcoes.intervaloSeloMs ?? 10_000;
  const log = opcoes.log ?? { info() {}, aviso() {}, erro() {} };
  const iso = () => agora().toISOString();

  // Consultas preparadas (parametrizadas: protegem contra SQL injection)
  const q = {
    clientePorId: db.prepare('SELECT * FROM clientes WHERE id = ?'),
    clientePorTokenAtivo: db.prepare('SELECT id, nome FROM clientes WHERE token = ? AND ativo = 1'),
    inserirCliente: db.prepare(`
      INSERT INTO clientes (nome, nome_busca, telefone, observacao, token, ativo, criado_em)
      VALUES (@nome, @nomeBusca, @telefone, @observacao, @token, 1, @agora)`),
    atualizarCliente: db.prepare(`
      UPDATE clientes SET nome = @nome, nome_busca = @nomeBusca, telefone = @telefone,
             observacao = @observacao, ativo = @ativo, atualizado_em = @agora
      WHERE id = @id`),
    atualizarToken: db.prepare('UPDATE clientes SET token = ?, atualizado_em = ? WHERE id = ?'),

    cartaoAtual: db.prepare(`SELECT * FROM cartoes WHERE cliente_id = ? AND status IN ('aberto', 'completo')`),
    ultimoCiclo: db.prepare('SELECT COALESCE(MAX(numero_ciclo), 0) AS n FROM cartoes WHERE cliente_id = ?'),
    inserirCartao: db.prepare(`INSERT INTO cartoes (cliente_id, numero_ciclo, status, criado_em) VALUES (?, ?, 'aberto', ?)`),
    marcarCompleto: db.prepare(`UPDATE cartoes SET status = 'completo', completado_em = ? WHERE id = ? AND status = 'aberto'`),
    reabrirCartao: db.prepare(`UPDATE cartoes SET status = 'aberto', completado_em = NULL WHERE id = ? AND status = 'completo'`),
    resgatarCartao: db.prepare(`
      UPDATE cartoes SET status = 'resgatado', resgatado_em = ?, resgatado_por = ?
      WHERE id = ? AND status = 'completo'`),
    contarResgates: db.prepare(`SELECT COUNT(*) AS n FROM cartoes WHERE cliente_id = ? AND status = 'resgatado'`),

    contarSelos: db.prepare('SELECT COUNT(*) AS n FROM selos WHERE cartao_id = ? AND anulado_em IS NULL'),
    ultimoSeloValido: db.prepare(`
      SELECT s.criado_em FROM selos s JOIN cartoes ca ON ca.id = s.cartao_id
      WHERE ca.cliente_id = ? AND s.anulado_em IS NULL ORDER BY s.id DESC LIMIT 1`),
    inserirSelo: db.prepare('INSERT INTO selos (cartao_id, criado_em, criado_por, referencia_pedido) VALUES (?, ?, ?, ?)'),
    seloPorId: db.prepare(`
      SELECT s.*, ca.cliente_id, ca.status AS cartao_status
      FROM selos s JOIN cartoes ca ON ca.id = s.cartao_id WHERE s.id = ?`),
    anularSelo: db.prepare(`
      UPDATE selos SET anulado_em = ?, motivo_anulacao = ?, anulado_por = ?
      WHERE id = ? AND anulado_em IS NULL`),

    historico: db.prepare(`
      SELECT s.id, ca.numero_ciclo AS ciclo, ca.status AS cartao_status, s.criado_em,
             a1.usuario AS criado_por, s.referencia_pedido, s.anulado_em,
             s.motivo_anulacao, a2.usuario AS anulado_por
      FROM selos s
      JOIN cartoes ca ON ca.id = s.cartao_id
      LEFT JOIN admins a1 ON a1.id = s.criado_por
      LEFT JOIN admins a2 ON a2.id = s.anulado_por
      WHERE ca.cliente_id = ?
      ORDER BY s.id DESC LIMIT 200`),
    cartoesDoCliente: db.prepare(`
      SELECT ca.numero_ciclo AS ciclo, ca.status, ca.criado_em, ca.completado_em,
             ca.resgatado_em, a.usuario AS resgatado_por
      FROM cartoes ca LEFT JOIN admins a ON a.id = ca.resgatado_por
      WHERE ca.cliente_id = ? ORDER BY ca.numero_ciclo DESC`),

    listar: db.prepare(`
      SELECT c.id, c.nome, c.telefone, c.ativo,
             ca.status AS status, ca.numero_ciclo AS ciclo,
             (SELECT COUNT(*) FROM selos s WHERE s.cartao_id = ca.id AND s.anulado_em IS NULL) AS selos,
             (SELECT COUNT(*) FROM cartoes r WHERE r.cliente_id = c.id AND r.status = 'resgatado') AS resgates
      FROM clientes c
      LEFT JOIN cartoes ca ON ca.cliente_id = c.id AND ca.status IN ('aberto', 'completo')
      WHERE (@incluirInativos = 1 OR c.ativo = 1)
        AND (@termo IS NULL
             OR c.nome_busca LIKE @padrao ESCAPE '\\'
             OR (@digitos IS NOT NULL AND c.telefone LIKE @digitos))
      ORDER BY c.ativo DESC, c.nome_busca
      LIMIT 500`),

    registrarAcao: db.prepare('INSERT INTO log_acoes (criado_em, admin_id, acao, cliente_id, detalhes) VALUES (?, ?, ?, ?, ?)'),
  };

  // ---------- auxiliares internos ----------

  function registrar(adminId, acao, clienteId, detalhes = null) {
    q.registrarAcao.run(iso(), adminId, acao, clienteId, detalhes ? JSON.stringify(detalhes) : null);
    log.info(`ação: ${acao}`, { adminId, clienteId, ...(detalhes || {}) });
  }

  function exigirCliente(id) {
    const cliente = q.clientePorId.get(id);
    if (!cliente) throw new ErroApp(404, 'CLIENTE_NAO_ENCONTRADO', 'Cliente não encontrado.');
    return cliente;
  }

  function garantirCartaoAtual(clienteId) {
    const atual = q.cartaoAtual.get(clienteId);
    if (atual) return atual;
    const ciclo = q.ultimoCiclo.get(clienteId).n + 1;
    q.inserirCartao.run(clienteId, ciclo, iso());
    return q.cartaoAtual.get(clienteId);
  }

  // ---------- consultas ----------

  /** Lista de clientes para o painel (com busca por nome ou telefone). */
  function listarClientes({ busca, incluirInativos = false } = {}) {
    const termo = normalizarBusca(busca);
    const digitos = String(busca ?? '').replace(/\D/g, '');
    const linhas = q.listar.all({
      incluirInativos: incluirInativos ? 1 : 0,
      termo: termo || null,
      padrao: `%${escaparLike(termo)}%`,
      digitos: digitos.length >= 3 ? `%${digitos}%` : null,
    });
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      ativo: l.ativo === 1,
      status: l.status ?? 'aberto',
      ciclo: l.ciclo ?? 1,
      selos: l.selos ?? 0,
      total: SELOS_POR_CARTAO,
      resgates: l.resgates,
    }));
  }

  /** Dados completos de um cliente para a tela do admin. */
  function obterCliente(id) {
    const c = exigirCliente(id);
    const cartao = q.cartaoAtual.get(id);
    const selos = cartao ? q.contarSelos.get(cartao.id).n : 0;
    return {
      cliente: {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        observacao: c.observacao,
        token: c.token,
        ativo: c.ativo === 1,
        criadoEm: c.criado_em,
      },
      cartao: cartao
        ? {
            id: cartao.id,
            ciclo: cartao.numero_ciclo,
            status: cartao.status,
            selos,
            total: SELOS_POR_CARTAO,
            faltam: SELOS_POR_CARTAO - selos,
            criadoEm: cartao.criado_em,
            completadoEm: cartao.completado_em,
          }
        : null,
      resgates: q.contarResgates.get(id).n,
      historico: q.historico.all(id).map((h) => ({
        id: h.id,
        ciclo: h.ciclo,
        criadoEm: h.criado_em,
        criadoPor: h.criado_por,
        referenciaPedido: h.referencia_pedido,
        anulado: h.anulado_em !== null,
        anuladoEm: h.anulado_em,
        anuladoPor: h.anulado_por,
        motivoAnulacao: h.motivo_anulacao,
        podeAnular: h.anulado_em === null && h.cartao_status !== 'resgatado',
      })),
      cartoes: q.cartoesDoCliente.all(id).map((ca) => ({
        ciclo: ca.ciclo,
        status: ca.status,
        criadoEm: ca.criado_em,
        completadoEm: ca.completado_em,
        resgatadoEm: ca.resgatado_em,
        resgatadoPor: ca.resgatado_por,
      })),
    };
  }

  /**
   * Visão PÚBLICA do cartão (página do cliente).
   * Retorna null para token inválido, inexistente ou cliente desativado
   * (a rota responde sempre a mesma mensagem genérica).
   */
  function cartaoPublico(token) {
    if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) return null;
    const cliente = q.clientePorTokenAtivo.get(token);
    if (!cliente) return null;
    const cartao = q.cartaoAtual.get(cliente.id);
    const selos = cartao ? q.contarSelos.get(cartao.id).n : 0;
    return {
      primeiroNome: primeiroNome(cliente.nome),
      selos,
      total: SELOS_POR_CARTAO,
      faltam: SELOS_POR_CARTAO - selos,
      status: cartao?.status ?? 'aberto',
      resgates: q.contarResgates.get(cliente.id).n,
    };
  }

  // ---------- operações de escrita (todas transacionais) ----------

  function criarCliente({ nome, telefone, observacao }, adminId) {
    const nomeLimpo = textoOuNull(nome);
    if (!nomeLimpo) throw new ErroApp(400, 'NOME_OBRIGATORIO', 'Informe o nome do cliente.');
    const tx = db.transaction(() => {
      const r = q.inserirCliente.run({
        nome: nomeLimpo,
        nomeBusca: normalizarBusca(nomeLimpo),
        telefone: normalizarTelefone(telefone),
        observacao: textoOuNull(observacao),
        token: gerarTokenCliente(),
        agora: iso(),
      });
      const id = Number(r.lastInsertRowid);
      q.inserirCartao.run(id, 1, iso());
      registrar(adminId, 'criar_cliente', id);
      return id;
    });
    return obterCliente(tx.immediate());
  }

  /** Edita dados e/ou ativa/desativa (sem nunca excluir). */
  function atualizarCliente(id, dados, adminId) {
    const tx = db.transaction(() => {
      const c = exigirCliente(id);
      const novo = {
        id,
        nome: dados.nome !== undefined ? textoOuNull(dados.nome) : c.nome,
        telefone: dados.telefone !== undefined ? normalizarTelefone(dados.telefone) : c.telefone,
        observacao: dados.observacao !== undefined ? textoOuNull(dados.observacao) : c.observacao,
        ativo: dados.ativo !== undefined ? (dados.ativo ? 1 : 0) : c.ativo,
        agora: iso(),
      };
      if (!novo.nome) throw new ErroApp(400, 'NOME_OBRIGATORIO', 'Informe o nome do cliente.');
      novo.nomeBusca = normalizarBusca(novo.nome);

      const campos = ['nome', 'telefone', 'observacao', 'ativo'].filter((k) => novo[k] !== c[k]);
      if (campos.length === 0) return;
      q.atualizarCliente.run(novo);

      let acao = 'editar_cliente';
      if (campos.includes('ativo')) acao = novo.ativo ? 'reativar_cliente' : 'desativar_cliente';
      registrar(adminId, acao, id, { campos });
    });
    tx.immediate();
    return obterCliente(id);
  }

  /** Gera um novo link para o cliente; o link antigo para de funcionar. */
  function regenerarLink(id, adminId) {
    const tx = db.transaction(() => {
      exigirCliente(id);
      q.atualizarToken.run(gerarTokenCliente(), iso(), id);
      registrar(adminId, 'regenerar_link', id);
    });
    tx.immediate();
    return obterCliente(id);
  }

  /** Lança 1 selo no cartão atual do cliente. */
  function lancarSelo(clienteId, adminId, { referenciaPedido } = {}) {
    const tx = db.transaction(() => {
      const cliente = exigirCliente(clienteId);
      if (!cliente.ativo) {
        throw new ErroApp(409, 'CLIENTE_INATIVO', 'Este cliente está desativado. Reative-o para lançar selos.');
      }
      const cartao = garantirCartaoAtual(clienteId);
      if (cartao.status === 'completo') {
        throw new ErroApp(409, 'CARTAO_COMPLETO',
          'Cartão completo! Registre o resgate do açaí grátis antes de lançar um novo selo.');
      }

      // Proteção contra clique duplo: bloqueia novo selo por alguns segundos
      const ultimo = q.ultimoSeloValido.get(clienteId);
      if (ultimo && intervaloSeloMs > 0) {
        const decorrido = agora().getTime() - Date.parse(ultimo.criado_em);
        if (decorrido >= 0 && decorrido < intervaloSeloMs) {
          const segundos = Math.ceil((intervaloSeloMs - decorrido) / 1000);
          throw new ErroApp(429, 'SELO_RECENTE',
            `Um selo acabou de ser lançado para este cliente. Aguarde ${segundos} segundo(s) para lançar outro.`,
            { segundosRestantes: segundos });
        }
      }

      const atuais = q.contarSelos.get(cartao.id).n;
      if (atuais >= SELOS_POR_CARTAO) {
        throw new ErroApp(409, 'CARTAO_COMPLETO', 'Este cartão já tem 10 selos.');
      }
      const r = q.inserirSelo.run(cartao.id, iso(), adminId, textoOuNull(referenciaPedido));
      const total = atuais + 1;
      if (total === SELOS_POR_CARTAO) q.marcarCompleto.run(iso(), cartao.id);
      registrar(adminId, 'lancar_selo', clienteId, {
        seloId: Number(r.lastInsertRowid), ciclo: cartao.numero_ciclo, selos: total,
      });
    });
    tx.immediate();
    return obterCliente(clienteId);
  }

  /** Anula (desfaz) um selo. O selo continua no banco, marcado como anulado. */
  function anularSelo(seloId, adminId, motivo) {
    const motivoLimpo = textoOuNull(motivo);
    if (!motivoLimpo || motivoLimpo.length < 3) {
      throw new ErroApp(400, 'MOTIVO_OBRIGATORIO', 'Informe o motivo para desfazer o selo.');
    }
    const tx = db.transaction(() => {
      const selo = q.seloPorId.get(seloId);
      if (!selo) throw new ErroApp(404, 'SELO_NAO_ENCONTRADO', 'Selo não encontrado.');
      if (selo.anulado_em) throw new ErroApp(409, 'SELO_JA_ANULADO', 'Este selo já foi desfeito.');
      if (selo.cartao_status === 'resgatado') {
        throw new ErroApp(409, 'CARTAO_RESGATADO',
          'Este selo pertence a um cartão já resgatado e não pode ser desfeito.');
      }
      q.anularSelo.run(iso(), motivoLimpo, adminId, seloId);
      // Se o cartão estava completo, volta a ficar aberto (agora com 9)
      if (selo.cartao_status === 'completo') q.reabrirCartao.run(selo.cartao_id);
      registrar(adminId, 'anular_selo', selo.cliente_id, { seloId, motivo: motivoLimpo });
      return selo.cliente_id;
    });
    return obterCliente(tx.immediate());
  }

  /** Registra a entrega do açaí grátis e abre um novo cartão zerado. */
  function resgatarPremio(clienteId, adminId) {
    const tx = db.transaction(() => {
      const cliente = exigirCliente(clienteId);
      if (!cliente.ativo) {
        throw new ErroApp(409, 'CLIENTE_INATIVO', 'Este cliente está desativado. Reative-o primeiro.');
      }
      const cartao = q.cartaoAtual.get(clienteId);
      const selos = cartao ? q.contarSelos.get(cartao.id).n : 0;
      if (!cartao || cartao.status !== 'completo' || selos !== SELOS_POR_CARTAO) {
        throw new ErroApp(409, 'CARTAO_NAO_COMPLETO',
          `O cartão ainda não está completo (${selos} de ${SELOS_POR_CARTAO}).`);
      }
      q.resgatarCartao.run(iso(), adminId, cartao.id);
      q.inserirCartao.run(clienteId, cartao.numero_ciclo + 1, iso());
      registrar(adminId, 'resgatar_premio', clienteId, { ciclo: cartao.numero_ciclo });
    });
    tx.immediate();
    return obterCliente(clienteId);
  }

  return {
    listarClientes,
    obterCliente,
    cartaoPublico,
    criarCliente,
    atualizarCliente,
    regenerarLink,
    lancarSelo,
    anularSelo,
    resgatarPremio,
    registrar,
  };
}
