# Checklist de Testes Manuais — Cartão Fidelidade Nosso Gelado

Utilize este roteiro para testar todas as funcionalidades do sistema, tanto localmente quanto após a implantação no notebook.

---

## 1. Testes de Acesso e Autenticação

- [ ] **1.1. Login com credenciais inválidas**
  - Tente entrar com usuário ou senha errados no `admin.html`.
  - **Resultado esperado:** Mensagem "Usuário ou senha incorretos." e acesso bloqueado.

- [ ] **1.2. Proteção contra força bruta (Rate Limit)**
  - Tente errar a senha 5 vezes consecutivas.
  - **Resultado esperado:** Na 5ª tentativa em diante, o sistema bloqueia temporariamente por 15 minutos com código 429.

- [ ] **1.3. Login bem-sucedido**
  - Digite o usuário e senha criados com `npm run criar-admin`.
  - **Resultado esperado:** O painel administrativo é exibido e seu nome aparece no topo.

- [ ] **1.4. Proteção de rotas restritas**
  - Tente acessar diretamente as rotas da API no navegador (ex.: `/api/admin/clientes`) sem o token.
  - **Resultado esperado:** Resposta 401 (Não autenticado).

- [ ] **1.5. Logout**
  - Clique no botão "Sair" no canto superior direito.
  - **Resultado esperado:** Sessão encerrada e redirecionamento para a tela de login.

---

## 2. Testes de Gerenciamento de Clientes

- [ ] **2.1. Cadastrar cliente com dados válidos**
  - Clique em "+ Novo", informe Nome (ex.: "Mariana Silva"), WhatsApp "(89) 99450-7551" e observação opcional.
  - **Resultado esperado:** Cliente criado instantaneamente com Cartão Ciclo #1 aberto e 0/10 selos. O link exclusivo é gerado.

- [ ] **2.2. Busca em tempo real**
  - Digite "Mariana" ou "99450" no campo de busca.
  - **Resultado esperado:** A lista filtra instantaneamente ignorando acentos ou maiúsculas.

- [ ] **2.3. Copiar Link e Enviar WhatsApp**
  - Na tela do cliente, clique em "📋 Copiar Link".
  - **Resultado esperado:** O link `cartao.html?c=TOKEN` é copiado para a área de transferência.
  - Clique em "📱 WhatsApp".
  - **Resultado esperado:** Abre o WhatsApp com a mensagem personalizada pronta para envio.

- [ ] **2.4. Regenerar Link**
  - Clique em "🔄 Novo Link" e confirme.
  - **Resultado esperado:** Um novo link secreto é gerado. Ao tentar abrir o link antigo no navegador, deve aparecer a tela "Cartão não encontrado".

- [ ] **2.5. Desativar e Reativar Cliente**
  - Clique em "Desativar" no cliente.
  - **Resultado esperado:** O cartão público do cliente deixa de ser acessível (mensagem genérica amigável).
  - Tente lançar um selo para ele enquanto desativado: o sistema recusa.
  - Clique em "Reativar Cliente": o cartão volta a funcionar com os mesmos selos que tinha antes.

---

## 3. Testes das Regras do Cartão e Selos

- [ ] **3.1. Lançar selo normal (+1)**
  - Clique em "⭐ Lançar Selo (+1)" e confirme.
  - **Resultado esperado:** A bolinha é preenchida com a logo da garrafa, o contador sobe para "1 de 10" e o registro entra no histórico com data, hora e responsável.

- [ ] **3.2. Proteção contra clique duplo (10 segundos)**
  - Imediatamente após lançar um selo, tente clicar de novo no botão.
  - **Resultado esperado:** O botão fica desabilitado com contagem regressiva ("Aguarde 10s..."). Caso uma requisição duplicada seja forçada, a API devolve erro 429 com os segundos restantes.

- [ ] **3.3. Desfazer / Anular selo lançado por engano**
  - No histórico de selos, clique em "Desfazer".
  - Deixe o motivo em branco: o sistema deve exigir o motivo.
  - Digite o motivo (ex: "Lançado no pedido errado") e confirme.
  - **Resultado esperado:** O selo é riscado do histórico, a bolinha é esvaziada e a contagem reduz de 1. O selo **não é apagado do banco** (auditoria preservada).

- [ ] **3.4. Completar 10 selos (Limite Máximo)**
  - Lance selos até atingir 10/10.
  - **Resultado esperado:** 
    - O status muda para "Prêmio Disponível / Cartão Completo".
    - O botão "⭐ Lançar Selo" desaparece/bloqueia.
    - O botão verde "🎁 Resgatar Açaí Grátis" aparece em destaque.
  - Tente forçar o 11º selo via API: o backend e a trava do banco SQLite bloqueiam a inserção.

- [ ] **3.5. Resgate do Prêmio e abertura de novo ciclo**
  - Clique em "🎁 Resgatar Açaí Grátis" e confirme.
  - **Resultado esperado:**
    - O cartão ciclo #1 é finalizado com data e responsável pelo resgate.
    - O ciclo #2 é iniciado automaticamente com 0/10 selos.
    - O total de resgates do cliente sobe para 1.

---

## 4. Testes na Página do Cliente (`cartao.html?c=TOKEN`)

- [ ] **4.1. Visualização sem login**
  - Abra o link pessoal do cliente em uma aba anônima ou no celular.
  - **Resultado esperado:** A página abre rápido, sem pedir nenhuma senha.

- [ ] **4.2. Exibição correta e privacidade**
  - **Resultado esperado:**
    - Exibe apenas o **primeiro nome** (ex.: "Olá, Mariana! 💜").
    - NÃO exibe telefone, ID interno do banco nem dados de outros clientes.
    - Exibe as bolinhas preenchidas correspondentes ao progresso atual.

- [ ] **4.3. Experiência de Cartão Completo**
  - Acesse o link de um cliente que possui 10 selos.
  - **Resultado esperado:** Exibe o banner comemorativo *"Parabéns! Seu açaí grátis está liberado!"* com o botão que abre diretamente o WhatsApp da loja `(89) 99450-7551`.

- [ ] **4.4. Tentativa de adulteração**
  - Tente alterar o token na URL para caracteres aleatórios ou números sequenciais.
  - **Resultado esperado:** Tela elegante de "Cartão não encontrado" com botão de suporte no WhatsApp.
