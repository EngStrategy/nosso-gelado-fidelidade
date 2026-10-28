// =============================================================
// Dados de TESTE (não use no sistema de verdade!)
//   npm run seed
//
// Cria alguns clientes fictícios em situações diferentes para você
// testar as telas. Precisa de pelo menos 1 admin (npm run criar-admin).
// =============================================================
import { carregarArquivoEnv, carregarConfig } from '../src/config.js';
import { abrirBanco } from '../src/db.js';
import { criarServico } from '../src/servico.js';

carregarArquivoEnv();
const config = carregarConfig();
const forcar = process.argv.includes('--forcar');

if (process.env.NODE_ENV === 'production' && !forcar) {
  console.error('✖ NODE_ENV=production: o seed não roda no sistema de verdade.');
  process.exit(1);
}

const db = abrirBanco(config.dbPath);
const admin = db.prepare('SELECT id FROM admins WHERE ativo = 1 ORDER BY id LIMIT 1').get();
if (!admin) {
  console.error('✖ Crie um administrador antes:  npm run criar-admin');
  process.exit(1);
}
const jaTem = db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n;
if (jaTem > 0 && !forcar) {
  console.error(`✖ Já existem ${jaTem} clientes. Para adicionar mesmo assim: npm run seed -- --forcar`);
  process.exit(1);
}

// Sem intervalo entre selos, para poder lançar vários de uma vez
const servico = criarServico(db, { intervaloSeloMs: 0 });
const lancar = (id, n) => { for (let i = 0; i < n; i++) servico.lancarSelo(id, admin.id); };

const exemplos = [
  { nome: 'Maria Souza', telefone: '(89) 99999-0001', selos: 3 },
  { nome: 'João Pereira', telefone: '89999990002', selos: 9 },
  { nome: 'Ana Lima', telefone: null, selos: 10 },             // prêmio disponível
  { nome: 'Carlos Alberto', telefone: null, selos: 0 },
  { nome: 'Fernanda Costa', telefone: '(89) 98888-0005', selos: 10, resgatar: true, depois: 2 },
  { nome: 'José Antônio', telefone: null, selos: 5, anular: true },
  { nome: 'Pedro Inativo', telefone: null, selos: 4, desativar: true },
];

const base = config.frontUrl || 'https://engstrategy.github.io/nosso-gelado-fidelidade';
console.log('\nClientes de teste criados:\n');
for (const ex of exemplos) {
  let r = servico.criarCliente({ nome: ex.nome, telefone: ex.telefone }, admin.id);
  const id = r.cliente.id;
  lancar(id, ex.selos);
  if (ex.resgatar) { servico.resgatarPremio(id, admin.id); lancar(id, ex.depois); }
  if (ex.anular) {
    const ultimo = servico.obterCliente(id).historico[0];
    servico.anularSelo(ultimo.id, admin.id, 'Teste: selo lançado por engano');
  }
  if (ex.desativar) servico.atualizarCliente(id, { ativo: false }, admin.id);
  r = servico.obterCliente(id);
  console.log(`- ${r.cliente.nome.padEnd(16)} ${String(r.cartao.selos).padStart(2)}/10  ${r.cartao.status.padEnd(9)} ${base}/cartao.html?c=${r.cliente.token}`);
}
db.close();
