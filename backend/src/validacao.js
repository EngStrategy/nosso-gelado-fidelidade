// =============================================================
// Validação das entradas (zod)
// -------------------------------------------------------------
// Tudo que chega do navegador é conferido aqui antes de ser usado.
// Campos desconhecidos são rejeitados (strictObject).
// =============================================================
import { z } from 'zod';

if (z.locales?.pt) z.config(z.locales.pt()); // mensagens padrão em português

const textoOpcional = (max, rotulo) =>
  z.string().max(max, `${rotulo}: máximo de ${max} caracteres.`).nullable().optional();

export const esquemaLogin = z.strictObject({
  usuario: z.string().trim().min(1, 'Informe o usuário.').max(50),
  senha: z.string().min(1, 'Informe a senha.').max(200),
});

export const esquemaNovoCliente = z.strictObject({
  nome: z.string().trim().min(1, 'Informe o nome do cliente.').max(80, 'Nome: máximo de 80 caracteres.'),
  telefone: textoOpcional(30, 'Telefone'),
  observacao: textoOpcional(300, 'Observação'),
});

export const esquemaEditarCliente = z
  .strictObject({
    nome: z.string().trim().min(1, 'Informe o nome do cliente.').max(80, 'Nome: máximo de 80 caracteres.').optional(),
    telefone: textoOpcional(30, 'Telefone'),
    observacao: textoOpcional(300, 'Observação'),
    ativo: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Nada para alterar.');

export const esquemaLancarSelo = z.strictObject({
  referenciaPedido: textoOpcional(60, 'Referência do pedido'),
});

export const esquemaAnularSelo = z.strictObject({
  motivo: z.string().trim().min(3, 'Informe o motivo (mínimo 3 letras).').max(200, 'Motivo: máximo de 200 caracteres.'),
});

export const esquemaBusca = z.object({
  busca: z.string().max(60).optional(),
  incluirInativos: z.enum(['0', '1']).optional(),
});

export const esquemaId = z.coerce.number().int().positive();
