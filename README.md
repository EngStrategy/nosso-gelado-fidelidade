# Cartão Fidelidade — Nosso Gelado (Açaí na Garrafa) 🍨💜

Sistema completo de cartão fidelidade digital (10 selos por ciclo) para a loja **Nosso Gelado**.

- **Frontend:** HTML, CSS e JavaScript puros (sem frameworks, sem build), hospedado gratuitamente no **GitHub Pages**.
- **Backend:** Node.js LTS, Express e banco de dados SQLite (`better-sqlite3`), rodando em um notebook com **Ubuntu Server**.
- **Acesso Seguro (HTTPS):** Túnel gratuito via **Tailscale Funnel**, sem abrir portas no roteador.
- **Identidade Visual:** Inspirada fielmente no cartão físico da loja (tons de roxo escuro, lilás, detalhes verdes de folha e a garrafinha de açaí nos selos).

---

## 📋 Sumário
1. [Descobrir Versão e Processador do seu Notebook](#1-descobrir-versão-e-processador-do-seu-notebook)
2. [Configurar o Notebook para Não Suspender ao Fechar a Tampa](#2-configurar-o-notebook-para-não-suspender-ao-fechar-a-tampa)
3. [Instalar Node.js e Git no Ubuntu Server](#3-instalar-nodejs-e-git-no-ubuntu-server)
4. [Instalar e Ativar o Tailscale Funnel](#4-instalar-e-ativar-o-tailscale-funnel)
5. [Baixar e Configurar o Sistema](#5-baixar-e-configurar-o-sistema)
6. [Criar seu Usuário Administrador](#6-criar-seu-usuário-administrador)
7. [Colocar para Rodar 24/7 com o PM2](#7-colocar-para-rodar-247-com-o-pm2)
8. [Configurar Backup Automático Diário](#8-configurar-backup-automático-diário)
9. [Publicar o Frontend no GitHub Pages](#9-publicar-o-frontend-no-github-pages)
10. [Como Atualizar o Sistema no Futuro](#10-como-atualizar-o-sistema-no-futuro)
11. [Como Restaurar um Backup](#11-como-restaurar-um-backup)
12. [Privacidade e LGPD Básica](#12-privacidade-e-lgpd-básica)

---

## 1. Descobrir Versão e Processador do seu Notebook

Conecte-se ao seu notebook Ubuntu Server e execute os seguintes comandos no terminal:

```bash
# Mostra a versão exata do Ubuntu (ex: 22.04 LTS ou 24.04 LTS):
lsb_release -d

# Mostra o modelo do processador (Intel ou AMD) e arquitetura (x86_64):
lscpu | grep -E "Model name|Architecture"
```

---

## 2. Configurar o Notebook para Não Suspender ao Fechar a Tampa

Por padrão, notebooks entram em modo de suspensão quando fechamos a tampa. Como ele será o seu servidor, execute estes comandos para que ele continue ligado mesmo com a tampa abaixada:

```bash
# 1. Abre o arquivo de configuração de energia do sistema:
sudo nano /etc/systemd/logind.conf
```

Dentro do arquivo, procure as linhas abaixo (se tiver um `#` na frente, remova o `#`) e altere para ficarem exatamente assim:

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

*Dica para salvar no nano:* Pressione `Ctrl + O`, depois aperte `Enter` para confirmar, e em seguida `Ctrl + X` para sair.

Agora, aplique a alteração reiniciando o serviço:

```bash
sudo systemctl restart systemd-logind
```

Pronto! Agora você já pode fechar a tampa do notebook que ele continuará funcionando.

---

## 3. Instalar Node.js e Git no Ubuntu Server

Instale o Node.js 22 LTS oficial:

```bash
# 1. Atualize a lista de pacotes do Ubuntu:
sudo apt update && sudo apt upgrade -y

# 2. Adicione o repositório oficial do Node.js:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -

# 3. Instale o Node.js, Git e utilitários de compilação:
sudo apt install -y nodejs git build-essential

# 4. Verifique se a instalação foi bem-sucedida:
node -v   # Deve mostrar v22.x ou superior
npm -v    # Deve mostrar 10.x ou superior
```

---

## 4. Instalar e Ativar o Tailscale Funnel

O **Tailscale Funnel** permite que o seu notebook receba conexões HTTPS públicas da internet de forma gratuita e sem precisar mexer em portas do seu roteador Wi-Fi.

### Passo 4.1: Instalar o Tailscale no notebook
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

### Passo 4.2: Fazer login no Tailscale
```bash
sudo tailscale up --operator=$USER
```
O terminal exibirá um link. Abra esse link no navegador do seu celular ou computador e faça login (pode usar sua conta Google).

### Passo 4.3: Habilitar o Funnel no painel da Tailscale
1. Acesse o painel da Tailscale pelo navegador: [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)
2. Vá em **Access Controls** (Controles de Acesso) e certifique-se de que o recurso "Funnel" está habilitado (caso seja a primeira vez, clique no botão azul para autorizar Funnel na sua conta).
3. Na lista de máquinas, você verá o seu notebook (`note-acer-ubuntu-savio`).

### Passo 4.4: Iniciar o túnel público apontando para a porta da nossa API (3000)
```bash
sudo tailscale funnel --bg 3000
```

Para ver o endereço público gerado, execute:
```bash
tailscale funnel status
```
Ele exibirá algo como:
`https://note-acer-ubuntu-savio.SUA-TAILNET.ts.net`

👉 **Guarde esse endereço!** Ele é a URL que colocaremos no arquivo `docs/config.js`.

---

## 5. Baixar e Configurar o Sistema

No terminal do seu notebook, clone o repositório:

```bash
# 1. Vá para sua pasta pessoal:
cd ~

# 2. Clone o repositório:
git clone https://github.com/EngStrategy/nosso-gelado-fidelidade.git

# 3. Entre na pasta do backend:
cd nosso-gelado-fidelidade/backend

# 4. Instale as dependências:
npm install

# 5. Crie o seu arquivo de configurações (.env):
cp .env.example .env
nano .env
```

No arquivo `.env`:
- Em `JWT_SECRET`, coloque uma frase longa e aleatória (mínimo 32 caracteres).
- Em `CORS_ORIGIN`, certifique-se de manter `https://engstrategy.github.io`.
- Pressione `Ctrl + O`, `Enter` e `Ctrl + X` para salvar e sair.

---

## 6. Criar seu Usuário Administrador

Execute o script interativo:

```bash
npm run criar-admin
```

O script pedirá:
1. **Nome de usuário** (ex: `savio` ou `admin`)
2. **Senha** (mínimo de 10 caracteres — enquanto digita, aparecerão asteriscos `*` para proteção)
3. **Confirmação da senha**

Você pode criar outros administradores ou redefinir a senha a qualquer momento rodando esse mesmo comando.

---

## 7. Colocar para Rodar 24/7 com o PM2

O **PM2** garante que o servidor reinicie sozinho caso o notebook desligue e ligue novamente:

```bash
# 1. Instale o PM2 globalmente:
sudo npm install -g pm2

# 2. Inicie a aplicação:
pm2 start ecosystem.config.cjs

# 3. Configure para iniciar automaticamente com o Ubuntu:
pm2 startup
```
*O comando `pm2 startup` exibirá uma linha de comando para você copiar e colar com `sudo`. Copie e execute ela.*

```bash
# 4. Salve o estado atual para gravar a inicialização:
pm2 save
```

### Comandos úteis do PM2 para o dia a dia:
```bash
pm2 status          # Vê se o sistema está rodando normalmente
pm2 logs nosso-gelado # Vê as ações dos administradores e acessos em tempo real
pm2 restart nosso-gelado # Reinicia o sistema
```

---

## 8. Configurar Backup Automático Diário

O sistema já possui um script que faz cópias seguras e compactas do banco SQLite e mantém os últimos 14 dias:

```bash
# Abra o agendador de tarefas do Ubuntu:
crontab -e
```
*(Se perguntar qual editor usar, escolha a opção `1` para o nano).*

Adicione a seguinte linha no final do arquivo (troque `SEU_USUARIO` pelo seu usuário no Ubuntu):

```cron
0 3 * * * cd /home/SEU_USUARIO/nosso-gelado-fidelidade/backend && /usr/bin/npm run backup >> /home/SEU_USUARIO/backup-fidelidade.log 2>&1
```

Isso fará o backup **todos os dias às 03:00 da madrugada** automaticamente.

---

## 9. Publicar o Frontend no GitHub Pages

O frontend fica na pasta `/docs` do mesmo repositório:

1. No seu computador, abra o arquivo `docs/config.js`.
2. Altere o valor de `API_URL_PRODUCAO` para a URL do seu Tailscale Funnel (obtida no passo 4.4):
   ```javascript
   API_URL_PRODUCAO: 'https://note-acer-ubuntu-savio.SUA-TAILNET.ts.net',
   ```
3. Envie as alterações para o GitHub (`git add .`, `git commit -m "Configura URL da API"`, `git push`).
4. Acesse o seu repositório no GitHub pelo navegador:
   - Vá na aba **Settings** (Configurações do repositório).
   - No menu lateral esquerdo, clique em **Pages**.
   - Em **Build and deployment** > **Branch**:
     - Selecione a branch `main`.
     - Na pasta, selecione **/docs** (em vez de root).
     - Clique em **Save**.
5. Em cerca de 1 a 2 minutos, seu site estará no ar em:
   - **Painel do Administrador:** `https://engstrategy.github.io/nosso-gelado-fidelidade/admin.html`
   - **Página do Cartão do Cliente:** `https://engstrategy.github.io/nosso-gelado-fidelidade/cartao.html?c=TOKEN`

---

## 10. Como Atualizar o Sistema no Futuro

Sempre que fizermos melhorias ou alterações no código, basta rodar no terminal do notebook:

```bash
cd ~/nosso-gelado-fidelidade
git pull
cd backend
npm install
pm2 restart nosso-gelado
```

---

## 11. Como Restaurar um Backup

Se algum dia você precisar voltar os dados para uma data anterior:

```bash
cd ~/nosso-gelado-fidelidade/backend

# 1. Pare temporariamente o sistema:
pm2 stop nosso-gelado

# 2. Veja a lista de backups disponíveis:
npm run restaurar

# 3. Restaure o arquivo desejado:
npm run restaurar -- fidelidade-2026-10-28_030000.db

# 4. Inicie o sistema novamente:
pm2 start nosso-gelado
```
*O script salva automaticamente uma cópia de segurança do banco atual antes de sobrescrever, garantindo risco zero.*

---

## 12. Privacidade e LGPD Básica

- **Dados Mínimos:** O sistema armazena apenas Nome, WhatsApp (opcional) e Observações operacionais para entrega de pedidos.
- **Sem senhas públicas:** Clientes não possuem senha e não podem alterar ou visualizar dados de outros clientes.
- **Link Criptográfico:** Os links dos clientes usam tokens seguros de 144 bits de entropia gerados aleatoriamente, impossíveis de serem adivinhados.
- **Auditoria Completa:** Todas as ações de lançamento, cancelamento de selos e resgates de prêmios registram data, hora e o usuário administrador responsável.
