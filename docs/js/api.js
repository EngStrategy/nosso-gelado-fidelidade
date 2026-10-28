// =============================================================
// Cliente da API (comunicação com o backend)
// =============================================================

const Api = {
  // Retorna a URL base configurada em config.js
  getBaseUrl() {
    if (window.CONFIG && typeof window.CONFIG.obterApiUrl === 'function') {
      return window.CONFIG.obterApiUrl().replace(/\/+$/, '');
    }
    return 'http://127.0.0.1:3000';
  },

  // Gerenciamento de token do Admin
  getToken() {
    return localStorage.getItem('nosso_gelado_admin_jwt') || sessionStorage.getItem('nosso_gelado_admin_jwt');
  },

  salvarToken(token, lembrar = true) {
    if (lembrar) {
      localStorage.setItem('nosso_gelado_admin_jwt', token);
    } else {
      sessionStorage.setItem('nosso_gelado_admin_jwt', token);
    }
  },

  limparSessao() {
    localStorage.removeItem('nosso_gelado_admin_jwt');
    sessionStorage.removeItem('nosso_gelado_admin_jwt');
    localStorage.removeItem('nosso_gelado_admin_usuario');
  },

  getUsuario() {
    return localStorage.getItem('nosso_gelado_admin_usuario') || 'Admin';
  },

  salvarUsuario(nome) {
    localStorage.setItem('nosso_gelado_admin_usuario', nome);
  },

  // Toast de notificação
  toast(mensagem, tipo = 'info', duracao = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duracao);
  },

  // Requisição base com tratamento de erros e expiração de sessão
  async requisicao(metodo, caminho, { corpo = null, publico = false } = {}) {
    const url = `${this.getBaseUrl()}${caminho}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (!publico) {
      const token = this.getToken();
      if (!token) {
        this.limparSessao();
        window.location.href = 'admin.html#login';
        throw new Error('Sessão não encontrada.');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const opcoes = {
        method: metodo,
        headers,
      };
      if (corpo !== null) {
        opcoes.body = JSON.stringify(corpo);
      }

      const resposta = await fetch(url, opcoes);
      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        // Se a sessão expirou no backend
        if (resposta.status === 401 && !publico) {
          this.limparSessao();
          this.toast('Sua sessão expirou. Faça login novamente.', 'error');
          setTimeout(() => {
            window.location.href = 'admin.html#login';
          }, 1200);
          throw new Error('Sessão expirada.');
        }

        const erro = new Error(dados.erro || 'Ocorreu um erro no servidor.');
        erro.status = resposta.status;
        erro.codigo = dados.codigo;
        erro.segundosRestantes = dados.segundosRestantes;
        throw erro;
      }

      return dados;
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        const msg = 'Não foi possível conectar ao servidor. Verifique se o notebook está ligado e conectado à internet.';
        this.toast(msg, 'error', 6000);
        throw new Error(msg);
      }
      throw err;
    }
  },

  // Métodos específicos
  async login(usuario, senha) {
    const res = await this.requisicao('POST', '/api/admin/login', {
      corpo: { usuario, senha },
      publico: true,
    });
    this.salvarToken(res.token);
    this.salvarUsuario(res.usuario);
    return res;
  },

  async consultarCartaoPublico(token) {
    return this.requisicao('GET', `/api/publico/cartao/${encodeURIComponent(token)}`, { publico: true });
  },

  async listarClientes(busca = '', incluirInativos = false) {
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (incluirInativos) params.set('incluirInativos', '1');
    return this.requisicao('GET', `/api/admin/clientes?${params.toString()}`);
  },

  async obterCliente(id) {
    return this.requisicao('GET', `/api/admin/clientes/${id}`);
  },

  async cadastrarCliente(dados) {
    return this.requisicao('POST', '/api/admin/clientes', { corpo: dados });
  },

  async atualizarCliente(id, dados) {
    return this.requisicao('PATCH', `/api/admin/clientes/${id}`, { corpo: dados });
  },

  async lancarSelo(clienteId, referenciaPedido = null) {
    return this.requisicao('POST', `/api/admin/clientes/${clienteId}/selos`, {
      corpo: { referenciaPedido },
    });
  },

  async anularSelo(seloId, motivo) {
    return this.requisicao('POST', `/api/admin/selos/${seloId}/anular`, {
      corpo: { motivo },
    });
  },

  async resgatarPremio(clienteId) {
    return this.requisicao('POST', `/api/admin/clientes/${clienteId}/resgatar`);
  },

  async regenerarLink(clienteId) {
    return this.requisicao('POST', `/api/admin/clientes/${clienteId}/regenerar-link`);
  },
};

window.Api = Api;
