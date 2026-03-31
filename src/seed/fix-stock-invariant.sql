-- =============================================================
-- SCRIPT DE CORREÇÍO DO INVARIANTE DE ESTOQUE
-- =============================================================
-- Executa APÓS a implementação das mudanças de código.
--
-- Problema: Na versão anterior, DANO reduzia quantidadeTotal.
-- Agora DANO não reduz mais. Precisamos recalcular.
--
-- Novo invariante: quantidadeTotal = disponivel + emUso + danificada
-- (perdida NÍO faz parte do total — itens perdidos já foram removidos)
-- =============================================================

-- 1. Recalcular quantidadeTotal para todos os equipamentos
UPDATE equipment
SET "quantidadeTotal" = "quantidadeDisponivel" + "quantidadeEmUso" + "quantidadeDanificada";

-- 2. Verificação: listar equipamentos com invariante quebrado (deveria ser vazio se tudo OK)
SELECT
  id,
  nome,
  "quantidadeTotal" AS total,
  "quantidadeDisponivel" AS disponivel,
  "quantidadeEmUso" AS "emUso",
  "quantidadeDanificada" AS danificada,
  "quantidadePerdida" AS perdida,
  ("quantidadeDisponivel" + "quantidadeEmUso" + "quantidadeDanificada") AS "totalCalculado",
  CASE
    WHEN "quantidadeTotal" = ("quantidadeDisponivel" + "quantidadeEmUso" + "quantidadeDanificada")
    THEN '✅ OK'
    ELSE '❌ INCONSISTENTE'
  END AS status
FROM equipment
WHERE ativo = true
ORDER BY nome;
