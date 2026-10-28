// =============================================================
// Lógica do Painel do Administrador (admin.html)
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Telas Principais
  const viewLogin = document.getElementById('view-login');
  const viewAdmin = document.getElementById('view-admin');
  const subviewLista = document.getElementById('subview-lista');
  const subviewDetalhes = document.getElementById('subview-detalhes');

  // Elementos do Topo
  const adminUserDisplay = document.getElementById('admin-user-display');
  const btnLogout = document.getElementById('btn-logout');

  // Elementos da Lista
  const inputBusca = document.getElementById('input-busca');
  const checkInativos = document.getElementById('check-inativos');
  const listaContainer = document.getElementById('lista-clientes-container');
  const clientesContador = document.getElementById('clientes-contador');
  const btnAbrirNovoCliente = document.getElementById('btn-abrir-novo-cliente');

  // Elementos dos Detalhes
  const btnVoltarLista = document.getElementById('btn-voltar-lista');
  const detalheNome = document.getElementById('detalhe-nome');
  const detalheTelefone = document.getElementById('detalhe-telefone');
  const detalheObs = document.getElementById('detalhe-obs');
  const detalheStatusBadge = document.getElementById('detalhe-status-badge');
  const adminStampsGrid = document.getElementById('admin-stamps-grid');
  const adminProgressText = document.getElementById('admin-progress-text');
  const adminProgressRemaining = document.getElementById('admin-progress-remaining');
  const btnLancarSelo = document.getElementById('btn-lancar-selo');
  const btnResgatarPremio = document.getElementById('btn-resgatar-premio');
  const btnCopiarLink = document.getElementById('btn-copiar-link');
  const btnEnviarWhatsapp = document.getElementById('btn-enviar-whatsapp');
  const btnEditarCliente = document.getElementById('btn-editar-cliente');
  const btnRegenerarLink = document.getElementById('btn-regenerar-link');
  const btnToggleAtivo = document.getElementById('btn-toggle-ativo');
  const historicoContainer = document.getElementById('historico-selos-container');

  // Modais
  const modalNovoCliente = document.getElementById('modal-novo-cliente');
  const modalEditarCliente = document.getElementById('modal-editar-cliente');
  const modalAnularSelo = document.getElementById('modal-anular-selo');
  const modalConfirmarResgate = document.getElementById('modal-confirmar-resgate');
  const resgateNomeCliente = document.getElementById('resgate-nome-cliente');
  const btnConfirmarResgateAcao = document.getElementById('btn-confirmar-resgate-acao');

  // Estado Local da Interface
  let clienteAtualId = null;
  let dadosClienteAtual = null;
  let buscaTimeout = null;
  let bloqueioSeloTimer = null;

  // ---------------- Funções de Inicialização e Autenticação ----------------

  function checarSessao() {
    const token = Api.getToken();
    if (!token) {
      exibirTelaLogin();
      return;
    }
    adminUserDisplay.textContent = Api.getUsuario();
    exibirTelaAdmin();
    carregarListaClientes();
  }

  function exibirTelaLogin() {
    viewLogin.style.display = 'flex';
    viewAdmin.style.display = 'none';
  }

  function exibirTelaAdmin() {
    viewLogin.style.display = 'none';
    viewAdmin.style.display = 'block';
  }

  // Login
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-login');
    const u = document.getElementById('login-usuario').value.trim();
    const s = document.getElementById('login-senha').value;

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      const res = await Api.login(u, s);
      adminUserDisplay.textContent = res.usuario;
      Api.toast(`Bem-vindo(a), ${res.usuario}!`, 'success');
      exibirTelaAdmin();
      carregarListaClientes();
    } catch (err) {
      Api.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar no Painel';
    }
  });

  // Logout
  btnLogout.addEventListener('click', () => {
    if (confirm('Deseja realmente sair do painel?')) {
      Api.limparSessao();
      exibirTelaLogin();
      Api.toast('Você saiu do sistema.', 'info');
    }
  });

  // ---------------- Gerenciamento de Modais ----------------

  function fecharModais() {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('active'));
  }

  document.querySelectorAll('.btn-fechar-modal').forEach((b) => b.addEventListener('click', fecharModais));

  // Fechar ao clicar fora da caixa
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fecharModais();
    });
  });

  // ---------------- Lista de Clientes ----------------

  async function carregarListaClientes() {
    clientesContador.textContent = 'Atualizando...';
    try {
      const busca = inputBusca.value.trim();
      const inativos = checkInativos.checked;
      const res = await Api.listarClientes(busca, inativos);
      renderizarListaClientes(res.clientes || []);
    } catch (err) {
      clientesContador.textContent = 'Erro ao carregar';
    }
  }

  function renderizarListaClientes(clientes) {
    clientesContador.textContent = `${clientes.length} cliente(s) encontrado(s)`;
    listaContainer.innerHTML = '';

    if (clientes.length === 0) {
      listaContainer.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-dim);">
          Nenhum cliente encontrado.
        </div>`;
      return;
    }

    clientes.forEach((c) => {
      const card = document.createElement('div');
      card.className = `client-card ${!c.ativo ? 'inactive' : ''}`;

      let badgeHtml = '';
      if (!c.ativo) {
        badgeHtml = '<span class="badge-status badge-inactive">Desativado</span>';
      } else if (c.status === 'completo' || c.selos >= c.total) {
        badgeHtml = '<span class="badge-status badge-complete">🎉 Prêmio Pronto!</span>';
      } else {
        badgeHtml = `<span class="badge-status badge-open">${c.selos}/${c.total} selos</span>`;
      }

      card.innerHTML = `
        <div>
          <div style="font-weight: 700; font-size: 1rem; color: var(--text-white); margin-bottom: 2px;">
            ${escapeHtml(c.nome)}
          </div>
          <div style="font-size: 0.82rem; color: var(--lilac-light);">
            ${c.telefone ? formatarTelefoneVisual(c.telefone) : 'Sem WhatsApp cadastrado'}
          </div>
        </div>
        <div>${badgeHtml}</div>
      `;

      card.addEventListener('click', () => abrirDetalhesCliente(c.id));
      listaContainer.appendChild(card);
    });
  }

  // Busca instantânea (debounce)
  inputBusca.addEventListener('input', () => {
    clearTimeout(buscaTimeout);
    buscaTimeout = setTimeout(carregarListaClientes, 280);
  });

  checkInativos.addEventListener('change', carregarListaClientes);

  // ---------------- Cadastro de Cliente ----------------

  btnAbrirNovoCliente.addEventListener('click', () => {
    document.getElementById('form-novo-cliente').reset();
    modalNovoCliente.classList.add('active');
    setTimeout(() => document.getElementById('novo-nome').focus(), 100);
  });

  document.getElementById('form-novo-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('novo-nome').value.trim();
    const telefone = document.getElementById('novo-telefone').value.trim() || null;
    const observacao = document.getElementById('novo-obs').value.trim() || null;

    try {
      const res = await Api.cadastrarCliente({ nome, telefone, observacao });
      fecharModais();
      Api.toast(`Cliente ${res.cliente.nome} cadastrado com sucesso!`, 'success');
      abrirDetalhesCliente(res.cliente.id);
    } catch (err) {
      Api.toast(err.message, 'error');
    }
  });

  // ---------------- Detalhes do Cliente ----------------

  async function abrirDetalhesCliente(id) {
    clienteAtualId = id;
    subviewLista.style.display = 'none';
    subviewDetalhes.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    await atualizarTelaCliente();
  }

  btnVoltarLista.addEventListener('click', () => {
    subviewDetalhes.style.display = 'none';
    subviewLista.style.display = 'block';
    clienteAtualId = null;
    dadosClienteAtual = null;
    carregarListaClientes();
  });

  async function atualizarTelaCliente() {
    if (!clienteAtualId) return;

    try {
      const dados = await Api.obterCliente(clienteAtualId);
      dadosClienteAtual = dados;

      const c = dados.cliente;
      const cartao = dados.cartao;

      // Textos
      detalheNome.textContent = c.nome;
      detalheTelefone.textContent = c.telefone ? formatarTelefoneVisual(c.telefone) : 'Sem WhatsApp cadastrado';
      detalheObs.textContent = c.observacao ? `Obs: ${c.observacao}` : '';

      // Status
      if (!c.ativo) {
        detalheStatusBadge.className = 'badge-status badge-inactive';
        detalheStatusBadge.textContent = 'Cliente Desativado';
        btnToggleAtivo.textContent = 'Reativar Cliente';
        btnToggleAtivo.style.color = 'var(--success)';
      } else if (cartao.status === 'completo') {
        detalheStatusBadge.className = 'badge-status badge-complete';
        detalheStatusBadge.textContent = 'Prêmio Disponível';
        btnToggleAtivo.textContent = 'Desativar';
        btnToggleAtivo.style.color = 'var(--danger)';
      } else {
        detalheStatusBadge.className = 'badge-status badge-open';
        detalheStatusBadge.textContent = `Cartão Ciclo #${cartao.ciclo}`;
        btnToggleAtivo.textContent = 'Desativar';
        btnToggleAtivo.style.color = 'var(--danger)';
      }

      // Progresso
      adminProgressText.textContent = `${cartao.selos} de ${cartao.total} selos`;
      if (cartao.faltam === 0) {
        adminProgressRemaining.innerHTML = '<strong style="color: #34d399;">10 selos completos! Resgate o açaí grátis.</strong>';
      } else {
        adminProgressRemaining.textContent = `Faltam ${cartao.faltam} selo(s) para o açaí grátis`;
      }

      // Renderizar Grade com 10 Bolinhas
      adminStampsGrid.innerHTML = '';
      for (let i = 1; i <= cartao.total; i++) {
        const slot = document.createElement('div');
        slot.className = 'stamp-slot';
        if (i <= cartao.selos) {
          slot.classList.add('filled');
          const img = document.createElement('img');
          img.src = 'assets/logo-selo.png';
          img.onerror = () => { img.onerror = null; img.src = 'assets/logo-selo.svg'; };
          slot.appendChild(img);
        } else {
          slot.classList.add('empty');
        }
        adminStampsGrid.appendChild(slot);
      }

      // Botões de Ação Principal
      if (cartao.status === 'completo' || cartao.selos >= 10) {
        btnLancarSelo.style.display = 'none';
        btnResgatarPremio.style.display = 'block';
      } else {
        btnLancarSelo.style.display = 'block';
        btnResgatarPremio.style.display = 'none';
      }

      // Configurar links de envio e cópia
      configurarLinksCliente(c.token, c.nome, c.telefone);

      // Renderizar Histórico
      renderizarHistorico(dados.historico || []);

    } catch (err) {
      Api.toast(err.message, 'error');
    }
  }

  function gerarLinkPessoal(token) {
    const loc = window.location;
    // Garante que aponta para cartao.html
    const path = loc.pathname.replace(/admin\.html.*$/, '') + 'cartao.html';
    return `${loc.origin}${path}?c=${encodeURIComponent(token)}`;
  }

  function configurarLinksCliente(token, nome, telefone) {
    const linkCompleto = gerarLinkPessoal(token);

    btnCopiarLink.onclick = async () => {
      try {
        await navigator.clipboard.writeText(linkCompleto);
        Api.toast('Link do cartão copiado para a área de transferência! 📋', 'success');
      } catch {
        prompt('Copie o link abaixo:', linkCompleto);
      }
    };

    if (telefone) {
      const templateMsg = window.CONFIG?.MENSAGEM_WHATSAPP ||
        'Olá, {nome}! Este é o seu cartão fidelidade Nosso Gelado 💜 Acompanhe seus selos aqui: {link}';
      const textoFinal = templateMsg.replace('{nome}', nome).replace('{link}', linkCompleto);
      btnEnviarWhatsapp.href = `https://wa.me/${telefone}?text=${encodeURIComponent(textoFinal)}`;
      btnEnviarWhatsapp.style.display = 'inline-flex';
    } else {
      btnEnviarWhatsapp.style.display = 'none';
    }
  }

  // ---------------- Lançar Selo com Proteção de Clique Duplo ----------------

  btnLancarSelo.addEventListener('click', async () => {
    if (!clienteAtualId || !dadosClienteAtual) return;

    // Confirmação rápida
    const confirmou = confirm(`Deseja lançar 1 selo para ${dadosClienteAtual.cliente.nome}?`);
    if (!confirmou) return;

    // Bloqueia o botão na interface imediatamente
    bloquearBotaoSelo(10);

    try {
      const res = await Api.lancarSelo(clienteAtualId);
      Api.toast('Selo lançado com sucesso! ⭐', 'success');
      await atualizarTelaCliente();

      if (res.cartao?.status === 'completo') {
        Api.toast('🎉 Parabéns! Cartão completo, o açaí grátis foi liberado!', 'success', 5000);
      }
    } catch (err) {
      Api.toast(err.message, 'error');
      if (err.codigo === 'SELO_RECENTE' && err.segundosRestantes) {
        bloquearBotaoSelo(err.segundosRestantes);
      } else {
        desbloquearBotaoSelo();
      }
    }
  });

  function bloquearBotaoSelo(segundos) {
    clearInterval(bloqueioSeloTimer);
    btnLancarSelo.disabled = true;

    let restante = segundos;
    btnLancarSelo.textContent = `⏳ Aguarde ${restante}s...`;

    bloqueioSeloTimer = setInterval(() => {
      restante -= 1;
      if (restante <= 0) {
        desbloquearBotaoSelo();
      } else {
        btnLancarSelo.textContent = `⏳ Aguarde ${restante}s...`;
      }
    }, 1000);
  }

  function desbloquearBotaoSelo() {
    clearInterval(bloqueioSeloTimer);
    btnLancarSelo.disabled = false;
    btnLancarSelo.textContent = '⭐ Lançar Selo (+1)';
  }

  // ---------------- Resgate de Prêmio ----------------

  btnResgatarPremio.addEventListener('click', () => {
    if (!dadosClienteAtual) return;
    resgateNomeCliente.textContent = dadosClienteAtual.cliente.nome;
    modalConfirmarResgate.classList.add('active');
  });

  btnConfirmarResgateAcao.addEventListener('click', async () => {
    try {
      btnConfirmarResgateAcao.disabled = true;
      await Api.resgatarPremio(clienteAtualId);
      fecharModais();
      Api.toast('Prêmio registrado! Novo cartão zerado aberto com sucesso. 🎁', 'success', 4500);
      await atualizarTelaCliente();
    } catch (err) {
      Api.toast(err.message, 'error');
    } finally {
      btnConfirmarResgateAcao.disabled = false;
    }
  });

  // ---------------- Regenerar Link ----------------

  btnRegenerarLink.addEventListener('click', async () => {
    if (!dadosClienteAtual) return;
    const ok = confirm(
      `Atenção: Ao gerar um novo link, o link anterior enviado para ${dadosClienteAtual.cliente.nome} deixará de funcionar imediatamente. Deseja continuar?`
    );
    if (!ok) return;

    try {
      await Api.regenerarLink(clienteAtualId);
      Api.toast('Novo link gerado com sucesso! Lembre-se de reenviar ao cliente.', 'success');
      await atualizarTelaCliente();
    } catch (err) {
      Api.toast(err.message, 'error');
    }
  });

  // ---------------- Desativar / Reativar Cliente ----------------

  btnToggleAtivo.addEventListener('click', async () => {
    if (!dadosClienteAtual) return;
    const c = dadosClienteAtual.cliente;
    const novoStatus = !c.ativo;
    const acaoTexto = novoStatus ? 'reativar' : 'desativar';

    const ok = confirm(`Deseja realmente ${acaoTexto} o cliente ${c.nome}?`);
    if (!ok) return;

    try {
      await Api.atualizarCliente(c.id, { ativo: novoStatus });
      Api.toast(`Cliente ${novoStatus ? 'reativado' : 'desativado'} com sucesso.`, 'info');
      await atualizarTelaCliente();
    } catch (err) {
      Api.toast(err.message, 'error');
    }
  });

  // ---------------- Editar Cliente ----------------

  btnEditarCliente.addEventListener('click', () => {
    if (!dadosClienteAtual) return;
    const c = dadosClienteAtual.cliente;
    document.getElementById('edit-nome').value = c.nome;
    document.getElementById('edit-telefone').value = c.telefone ? formatarTelefoneVisual(c.telefone) : '';
    document.getElementById('edit-obs').value = c.observacao || '';
    modalEditarCliente.classList.add('active');
  });

  document.getElementById('form-editar-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('edit-nome').value.trim();
    const telefone = document.getElementById('edit-telefone').value.trim() || null;
    const observacao = document.getElementById('edit-obs').value.trim() || null;

    try {
      await Api.atualizarCliente(clienteAtualId, { nome, telefone, observacao });
      fecharModais();
      Api.toast('Dados do cliente atualizados!', 'success');
      await atualizarTelaCliente();
    } catch (err) {
      Api.toast(err.message, 'error');
    }
  });

  // ---------------- Anulação de Selo ----------------

  function abrirModalAnular(seloId) {
    document.getElementById('anular-selo-id').value = seloId;
    document.getElementById('anular-motivo').value = '';
    modalAnularSelo.classList.add('active');
    setTimeout(() => document.getElementById('anular-motivo').focus(), 100);
  }

  document.getElementById('form-anular-selo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const seloId = document.getElementById('anular-selo-id').value;
    const motivo = document.getElementById('anular-motivo').value.trim();

    try {
      await Api.anularSelo(seloId, motivo);
      fecharModais();
      Api.toast('Selo desfeito com sucesso! Auditoria registrada.', 'info');
      await atualizarTelaCliente();
    } catch (err) {
      Api.toast(err.message, 'error');
    }
  });

  // ---------------- Renderizar Histórico de Selos ----------------

  function renderizarHistorico(itens) {
    historicoContainer.innerHTML = '';
    if (itens.length === 0) {
      historicoContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-dim);">Nenhum selo registrado ainda.</div>';
      return;
    }

    itens.forEach((h) => {
      const div = document.createElement('div');
      div.className = `history-item ${h.anulado ? 'annulled' : ''}`;

      const dataFormatada = formatarDataHora(h.criadoEm);
      const detalhesTexto = h.anulado
        ? `Cancelado por ${escapeHtml(h.anuladoPor || 'admin')}: "${escapeHtml(h.motivoAnulacao || '')}"`
        : `Lançado por ${escapeHtml(h.criadoPor || 'admin')}`;

      div.innerHTML = `
        <div>
          <div style="font-weight: 600; color: var(--text-white);">
            ${h.anulado ? '❌ Selo Cancelado' : '⭐ 1 Selo (Ciclo #' + h.ciclo + ')'}
          </div>
          <div style="font-size: 0.75rem; color: var(--lilac-light); margin-top: 2px;">
            ${dataFormatada} — ${detalhesTexto}
          </div>
        </div>
        <div>
          ${h.podeAnular ? `<button class="btn btn-secondary btn-sm" style="color: var(--danger); padding: 4px 8px; font-size: 0.75rem;" onclick="window.abrirModalAnularSelo(${h.id})">Desfazer</button>` : ''}
        </div>
      `;
      historicoContainer.appendChild(div);
    });
  }

  // Disponibiliza a função de anular para cliques no HTML dinâmico
  window.abrirModalAnularSelo = abrirModalAnular;

  // ---------------- Funções Auxiliares ----------------

  function formatarDataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function formatarTelefoneVisual(t) {
    if (!t) return '';
    const d = String(t).replace(/\D/g, '');
    if (d.length === 13) {
      return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    }
    if (d.length === 12) {
      return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    }
    return t;
  }

  function escapeHtml(texto) {
    if (!texto) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(texto).replace(/[&<>"']/g, (m) => map[m]);
  }

  // Disparar verificação inicial
  checarSessao();
});
