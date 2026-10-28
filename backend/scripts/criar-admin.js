// =============================================================
// Cria (ou redefine a senha de) um administrador.
//
//   npm run criar-admin                         -> pergunta usuário e senha
//   npm run criar-admin -- --desativar fulano   -> bloqueia o acesso de "fulano"
//   npm run criar-admin -- --listar             -> mostra os administradores
//
// A senha é digitada sem aparecer na tela e guardada com bcrypt.
// =============================================================
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { carregarArquivoEnv, carregarConfig } from '../src/config.js';
import { abrirBanco } from '../src/db.js';
import { BCRYPT_CUSTO } from '../src/auth.js';

carregarArquivoEnv();
const config = carregarConfig();
const db = abrirBanco(config.dbPath);

async function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await rl.question(texto);
  rl.close();
  return resposta.trim();
}

// Lê a senha mostrando "*" no lugar das letras
function perguntarSenha(texto) {
  if (!process.stdin.isTTY) return perguntar(texto);
  return new Promise((resolve) => {
    const entrada = process.stdin;
    let senha = '';
    process.stdout.write(texto);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const aoDigitar = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', aoDigitar);
          process.stdout.write('\n');
          return resolve(senha);
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); } // Ctrl+C
        if (ch === '\u007f' || ch === '\b') {
          if (senha.length) { senha = senha.slice(0, -1); process.stdout.write('\b \b'); }
          continue;
        }
        senha += ch;
        process.stdout.write('*');
      }
    };
    entrada.on('data', aoDigitar);
  });
}

function listar() {
  const admins = db.prepare('SELECT usuario, ativo, criado_em FROM admins ORDER BY usuario').all();
  if (!admins.length) return console.log('Nenhum administrador cadastrado.');
  for (const a of admins) console.log(`- ${a.usuario} ${a.ativo ? '(ativo)' : '(DESATIVADO)'} desde ${a.criado_em}`);
}

function desativar(usuario) {
  const r = db.prepare('UPDATE admins SET ativo = 0 WHERE usuario = ?').run(usuario);
  console.log(r.changes ? `✔ Administrador "${usuario}" desativado (não consegue mais entrar).`
                        : `Administrador "${usuario}" não encontrado.`);
}

async function criarOuRedefinir() {
  console.log('\n=== Nosso Gelado — cadastro de administrador ===\n');
  const usuario = await perguntar('Usuário (letras, números, ponto, hífen; 3 a 30): ');
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
    console.error('✖ Usuário inválido.');
    process.exit(1);
  }

  const existente = db.prepare('SELECT id FROM admins WHERE usuario = ?').get(usuario);
  if (existente) {
    const r = await perguntar(`O usuário "${usuario}" já existe. Redefinir a senha e reativar? (s/N): `);
    if (r.toLowerCase() !== 's') { console.log('Nada foi alterado.'); return; }
  }

  const senha = await perguntarSenha('Senha (mínimo 10 caracteres): ');
  if (senha.length < 10) { console.error('✖ Senha muito curta.'); process.exit(1); }
  const confirmacao = await perguntarSenha('Repita a senha: ');
  if (senha !== confirmacao) { console.error('✖ As senhas não conferem.'); process.exit(1); }

  const hash = await bcrypt.hash(senha, BCRYPT_CUSTO);
  if (existente) {
    db.prepare('UPDATE admins SET senha_hash = ?, ativo = 1 WHERE id = ?').run(hash, existente.id);
    console.log(`\n✔ Senha de "${usuario}" redefinida.`);
  } else {
    db.prepare('INSERT INTO admins (usuario, senha_hash, ativo, criado_em) VALUES (?, ?, 1, ?)')
      .run(usuario, hash, new Date().toISOString());
    console.log(`\n✔ Administrador "${usuario}" criado.`);
  }
}

const args = process.argv.slice(2);
try {
  if (args[0] === '--listar') listar();
  else if (args[0] === '--desativar' && args[1]) desativar(args[1]);
  else await criarOuRedefinir();
} finally {
  db.close();
}
