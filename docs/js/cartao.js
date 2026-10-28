// =============================================================
// Lógica da Página do Cliente (cartao.html?c=TOKEN)
// -------------------------------------------------------------
// Esta página é 100% somente leitura. Não possui autenticação,
// não envia ações e não expõe dados sensíveis.
// =============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const cardContent = document.getElementById('card-content');

  const clienteSaudacao = document.getElementById('cliente-saudacao');
  const stampsGrid = document.getElementById('stamps-grid');
  const progressText = document.getElementById('progress-text');
  const progressRemaining = document.getElementById('progress-remaining');
  const rewardBanner = document.getElementById('reward-banner');
  const btnWhatsappResgate = document.getElementById('btn-whatsapp-resgate');
  const rewardsHistory = document.getElementById('rewards-history');
  const resgatesContador = document.getElementById('resgates-contador');

  // 1) Ler o token da query string (?c=TOKEN)
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('c');

  if (!token) {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    return;
  }

  try {
    // 2) Consultar a API pública com o token
    const dados = await Api.consultarCartaoPublico(token);

    loadingState.style.display = 'none';
    cardContent.style.display = 'block';

    // 3) Preencher os dados na tela
    clienteSaudacao.textContent = `Olá, ${dados.primeiroNome}! 💜`;
    progressText.textContent = `${dados.selos} de ${dados.total} selos`;

    const faltam = dados.faltam;
    if (faltam === 0) {
      progressRemaining.innerHTML = `<strong>Cartão completo!</strong> Seu prêmio está liberado.`;
    } else if (faltam === 1) {
      progressRemaining.innerHTML = `Falta apenas <strong>1 selo</strong> para o seu açaí grátis!`;
    } else {
      progressRemaining.innerHTML = `Faltam <strong>${faltam} selos</strong> para o seu açaí grátis`;
    }

    // 4) Renderizar as 10 bolinhas
    stampsGrid.innerHTML = '';
    const selosValidos = dados.selos;

    for (let i = 1; i <= dados.total; i++) {
      const slot = document.createElement('div');
      slot.className = 'stamp-slot';

      if (i <= selosValidos) {
        slot.classList.add('filled');
        // Pequeno atraso em cascata para uma animação elegante
        slot.style.animationDelay = `${(i - 1) * 0.08}s`;

        const img = document.createElement('img');
        img.src = 'assets/logo-selo.webp';
        img.alt = `Selo ${i}`;
        // Fallback automático para o SVG se o PNG não existir
        img.onerror = () => {
          img.onerror = null;
          img.src = 'assets/logo-selo.svg';
        };
        slot.appendChild(img);
      } else {
        slot.classList.add('empty');
      }

      stampsGrid.appendChild(slot);
    }

    // 5) Banner de prêmio liberado
    if (dados.status === 'completo' || dados.selos >= dados.total) {
      rewardBanner.style.display = 'block';

      const telefoneLoja = window.CONFIG?.WHATSAPP_LOJA || '5589994507551';
      const msgResgate = encodeURIComponent(
        `Olá! Completei meu cartão fidelidade na Nosso Gelado (${dados.primeiroNome}) e gostaria de resgatar meu açaí grátis! 💜🎉`
      );
      btnWhatsappResgate.href = `https://wa.me/${telefoneLoja}?text=${msgResgate}`;
    }

    // 6) Exibir histórico discreto de resgates anteriores
    if (dados.resgates && dados.resgates > 0) {
      resgatesContador.textContent = dados.resgates;
      rewardsHistory.style.display = 'block';
    }

  } catch {
    // Qualquer erro (404, token inválido, cliente inativo) exibe tela amigável
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
  }
});
