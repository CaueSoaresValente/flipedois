-- ============================================================
-- SCRIPT DE RECONCILIAÇÃO DE ESTOQUE (v1.0)
-- Recalcula danificada e perdida a partir das ocorrências BAIXADO
-- e recalcula disponivel com base no invariante:
--   total = disponivel + emUso + danificada
-- ============================================================

-- 1. Zerar contadores de dano/perda para recalcular com precisão
UPDATE equipment SET "quantidadeDanificada" = 0, "quantidadePerdida" = 0;

-- 2. Recalcular danificada a partir de ocorrências BAIXADO tipo DANO
UPDATE equipment e
SET "quantidadeDanificada" = COALESCE((
  SELECT SUM(o.quantidade)
  FROM equipment_occurrence o
  WHERE o."equipmentId" = e.id
    AND o.status = 'BAIXADO'
    AND o.tipo = 'DANO'
), 0);

-- 3. Recalcular perdida a partir de ocorrências BAIXADO tipo PERDA
UPDATE equipment e
SET "quantidadePerdida" = COALESCE((
  SELECT SUM(o.quantidade)
  FROM equipment_occurrence o
  WHERE o."equipmentId" = e.id
    AND o.status = 'BAIXADO'
    AND o.tipo = 'PERDA'
), 0);

-- 4. Recalcular disponivel usando a fórmula invariante:
--    disponivel = total - emUso - danificada
--    (perdida já foi subtraída do total em cada confirmarBaixa)
UPDATE equipment
SET "quantidadeDisponivel" = "quantidadeTotal" - "quantidadeEmUso" - "quantidadeDanificada";

-- 5. Safety check: garantir que nenhum campo ficou negativo por erro histórico
UPDATE equipment SET "quantidadeDisponivel" = 0 WHERE "quantidadeDisponivel" < 0;
UPDATE equipment SET "quantidadeEmUso" = 0 WHERE "quantidadeEmUso" < 0;
UPDATE equipment SET "quantidadeDanificada" = 0 WHERE "quantidadeDanificada" < 0;
UPDATE equipment SET "quantidadePerdida" = 0 WHERE "quantidadePerdida" < 0;

-- 6. Verificação final dos saldos
SELECT id, nome, "quantidadeTotal", "quantidadeDisponivel", "quantidadeEmUso",
       "quantidadeDanificada", "quantidadePerdida",
       ("quantidadeDisponivel" + "quantidadeEmUso" + "quantidadeDanificada") AS soma_invariante,
       CASE
         WHEN "quantidadeTotal" = ("quantidadeDisponivel" + "quantidadeEmUso" + "quantidadeDanificada")
         THEN '✅ OK'
         ELSE '❌ INCONSISTENTE'
       END AS status
FROM equipment;
