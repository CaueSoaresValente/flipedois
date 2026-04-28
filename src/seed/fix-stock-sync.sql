-- Sincronização de Estoque (REPAIR SCRIPT)
-- Este script corrige inconsistências onde o "em uso" não bate com os checklists.

BEGIN;

-- 1. Resetar temporariamente o 'em uso' de todos os equipamentos ativos
UPDATE equipment SET "quantidadeEmUso" = 0;

-- 2. Recalcular 'em uso' baseado em checklists ATIVOS de eventos NÃO ARQUIVADOS e NÃO CANCELADOS
-- Consideramos: liberado, em_evento, pendente_devolucao
WITH checklist_stock AS (
    SELECT 
        ci."equipmentId",
        SUM(
            ci."quantidadePlanejada" - 
            (
                COALESCE(ci."quantidadeOk", 0) + 
                COALESCE((
                    SELECT SUM(o.quantidade) 
                    FROM equipment_occurrence o 
                    WHERE o."checklistItemId" = ci.id 
                    AND o.status = 'BAIXADO' 
                    AND o.tipo IN ('DANO', 'PERDA')
                ), 0)
            )
        ) as real_em_uso
    FROM checklist_item ci
    JOIN checklist c ON ci."checklistId" = c.id
    JOIN event e ON c."eventId" = e.id
    WHERE e.arquivado = false 
      AND e.status != 'cancelado'
      AND c.status IN ('liberado', 'em_evento', 'pendente_devolucao')
    GROUP BY ci."equipmentId"
)
UPDATE equipment e
SET "quantidadeEmUso" = cs.real_em_uso
FROM checklist_stock cs
WHERE e.id = cs."equipmentId";

-- 3. Recalcular o 'disponivel' baseado na invariante: total = disponivel + emUso + danificada
-- (Perdida já foi removida do total em operações anteriores)
UPDATE equipment 
SET "quantidadeDisponivel" = "quantidadeTotal" - "quantidadeEmUso" - "quantidadeDanificada";

-- 4. Garantir que nada ficou negativo (safety check)
UPDATE equipment SET "quantidadeEmUso" = 0 WHERE "quantidadeEmUso" < 0;
UPDATE equipment SET "quantidadeDisponivel" = "quantidadeTotal" - "quantidadeDanificada" WHERE "quantidadeDisponivel" < 0;

COMMIT;
