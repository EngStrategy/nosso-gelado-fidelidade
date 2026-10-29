// =============================================================
// Configuração do Frontend (GitHub Pages)
// -------------------------------------------------------------
// Este é o ÚNICO arquivo do frontend que você precisa editar
// para definir onde a API do seu notebook está rodando.
// =============================================================

window.CONFIG = {
  // URL pública da sua API (gerada pelo Tailscale Funnel no seu notebook).
  // Exemplo: https://note-acer-ubuntu-savio.tail12345.ts.net
  // Quando estiver testando localmente no seu computador, o sistema
  // detecta automaticamente e usa http://127.0.0.1:3000
  API_URL_PRODUCAO: 'https://api.engstrategy.com.br/nosso-gelado-fidelidade',

  // URL para testes locais no navegador
  API_URL_LOCAL: 'http://127.0.0.1:3000',

  // Telefone da loja para envio do WhatsApp e atendimento
  WHATSAPP_LOJA: '5589994507551',
  WHATSAPP_LOJA_FORMATADO: '(89) 99450-7551',

  // Nome e mensagem padrão ao enviar o link para o cliente
  NOME_LOJA: 'Nosso Gelado',
  MENSAGEM_WHATSAPP: 'Olá, {nome}! Este é o seu cartão fidelidade Nosso Gelado 💜 Acompanhe seus selos aqui: {link}',

  // Função inteligente que retorna a URL correta da API
  obterApiUrl() {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:';
    return isLocal ? this.API_URL_LOCAL : this.API_URL_PRODUCAO;
  }
};
