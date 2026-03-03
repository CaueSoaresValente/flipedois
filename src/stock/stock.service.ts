import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Equipment } from '../equipment/equipment.entity';

/**
 * ============================================================
 * SERVIÇO CENTRAL DE ESTOQUE — Fonte única da verdade
 * ============================================================
 * Todas as operações de estoque DEVEM passar por este serviço.
 *
 * FÓRMULA INVARIANTE:
 *   quantidadeTotal = disponivel + emUso + danificada + perdida
 *
 * FLUXO DE ESTOQUE:
 *
 * 1. LIBERAR CHECKLIST:
 *    interno:  disponivel -= planejado, emUso += planejado
 *    alugado:  emUso += planejado
 *
 * 2. DEVOLUÇÃO OK (qualquer origem):
 *    interno:  disponivel += qty
 *    ambos:    emUso -= qty
 *
 * 3. DEVOLUÇÃO DANIFICADA (imediato, sem esperar ocorrência):
 *    emUso -= qty
 *    danificada += qty
 *    total -= qty
 *
 * 4. DEVOLUÇÃO PERDIDA (imediato):
 *    emUso -= qty
 *    perdida += qty
 *    total -= qty
 *
 * 5. CANCELAR OCORRÊNCIA BAIXADA (dano reparado):
 *    DANO: danificada -= qty, disponivel += qty, total += qty
 *    PERDA: perdida -= qty, disponivel += qty, total += qty
 *
 * REGRAS:
 *   - Nenhum campo pode ficar negativo
 *   - Todo método deve ser chamado dentro de uma transação ativa
 *   - Todo método usa pessimistic_write lock no equipamento
 *   - Ocorrências são registros de auditoria — NÃO alteram estoque
 * ============================================================
 */
@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
  ) {}

  /**
   * Busca o equipamento com lock pessimista para operações transacionais.
   */
  private async getEquipmentWithLock(
    manager: EntityManager,
    equipmentId: number,
  ): Promise<Equipment> {
    const equipment = await manager.findOne(Equipment, {
      where: { id: equipmentId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!equipment) {
      throw new BadRequestException(`Equipamento ID ${equipmentId} não encontrado.`);
    }

    return equipment;
  }

  /**
   * Valida invariantes do estoque após modificação.
   * Garante que nenhum campo fique negativo.
   */
  private validarEstoque(equipment: Equipment): void {
    if (equipment.quantidadeDisponivel < 0) {
      throw new BadRequestException(
        `Estoque disponível de "${equipment.nome}" não pode ser negativo.`,
      );
    }
    if (equipment.quantidadeEmUso < 0) {
      throw new BadRequestException(
        `Quantidade em uso de "${equipment.nome}" não pode ser negativa.`,
      );
    }
    if (equipment.quantidadeDanificada < 0) {
      throw new BadRequestException(
        `Quantidade danificada de "${equipment.nome}" não pode ser negativa.`,
      );
    }
    if (equipment.quantidadePerdida < 0) {
      throw new BadRequestException(
        `Quantidade perdida de "${equipment.nome}" não pode ser negativa.`,
      );
    }
    if (equipment.quantidadeTotal < 0) {
      throw new BadRequestException(
        `Quantidade total de "${equipment.nome}" não pode ser negativa.`,
      );
    }
  }

  // ============================================================
  // RESERVAR / LIBERAR (Checklist release / cancel)
  // ============================================================

  /**
   * LIBERAR CHECKLIST: Reserva estoque ao liberar um checklist.
   *
   * Interno:  disponivel -= quantidade, emUso += quantidade
   * Alugado:  emUso += quantidade (não controla disponivel)
   *
   * Bloqueia se estoque interno insuficiente.
   */
  async reservarEstoque(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (equipment.origem === 'interno') {
      if (quantidade > equipment.quantidadeDisponivel) {
        throw new BadRequestException(
          `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${quantidade}.`,
        );
      }
      equipment.quantidadeDisponivel -= quantidade;
    }

    equipment.quantidadeEmUso += quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * CANCELAR LIBERAÇÃO: Reverte a reserva (cancela checklist/evento ou reduz quantidade).
   *
   * Interno:  disponivel += quantidade
   * Ambos:    emUso -= quantidade
   */
  async liberarReserva(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (equipment.origem === 'interno') {
      equipment.quantidadeDisponivel += quantidade;
    }
    equipment.quantidadeEmUso -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  // ============================================================
  // DEVOLUÇÃO (Return flows)
  // ============================================================

  /**
   * DEVOLUÇÃO OK: Equipamento devolvido em bom estado.
   *
   * Interno:  disponivel += quantidade, emUso -= quantidade
   * Alugado:  emUso -= quantidade (não recupera disponivel)
   *
   * CORRIGIDO: Antes retornava early para alugados sem decrementar emUso.
   */
  async registrarDevolucaoOk(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (equipment.origem === 'interno') {
      equipment.quantidadeDisponivel += quantidade;
    }
    // ✅ CORRIGIDO: Aplica para todos os tipos de origem (interno e alugado)
    equipment.quantidadeEmUso -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * DEVOLUÇÃO DANIFICADA: Equipamento devolvido danificado.
   * Ajuste imediato no momento da devolução — sem esperar confirmação de ocorrência.
   *
   * emUso -= quantidade
   * danificada += quantidade
   * total -= quantidade
   *
   * Aplica para qualquer origem (interno e alugado).
   */
  async registrarDevolucaoDanificado(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    equipment.quantidadeEmUso -= quantidade;
    equipment.quantidadeDanificada += quantidade;
    equipment.quantidadeTotal -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * DEVOLUÇÃO PERDIDA: Equipamento declarado como perdido.
   * Ajuste imediato no momento da devolução.
   *
   * emUso -= quantidade
   * perdida += quantidade
   * total -= quantidade
   *
   * Aplica para qualquer origem.
   */
  async registrarDevolucaoPerdido(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    equipment.quantidadeEmUso -= quantidade;
    equipment.quantidadePerdida += quantidade;
    equipment.quantidadeTotal -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  // ============================================================
  // CANCELAR OCORRÊNCIA (Occurrence reversal — repair/recovery)
  // ============================================================

  /**
   * CANCELAR DANO: Equipamento danificado foi reparado.
   * Restaura ao estoque disponível.
   *
   * danificada -= quantidade
   * disponivel += quantidade
   * total += quantidade
   *
   * Chamado apenas quando o status da ocorrência era BAIXADO.
   */
  async cancelarDano(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (equipment.origem !== 'interno') {
      return equipment;
    }

    if (quantidade > equipment.quantidadeDanificada) {
      throw new BadRequestException(
        `Quantidade a restaurar (${quantidade}) excede danificada atual (${equipment.quantidadeDanificada}) de "${equipment.nome}".`,
      );
    }

    equipment.quantidadeDanificada -= quantidade;
    equipment.quantidadeDisponivel += quantidade;
    equipment.quantidadeTotal += quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * CANCELAR PERDA: Equipamento perdido foi recuperado.
   * Restaura ao estoque disponível.
   *
   * perdida -= quantidade
   * disponivel += quantidade
   * total += quantidade
   *
   * Chamado apenas quando o status da ocorrência era BAIXADO.
   */
  async cancelarPerda(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (equipment.origem !== 'interno') {
      return equipment;
    }

    if (quantidade > equipment.quantidadePerdida) {
      throw new BadRequestException(
        `Quantidade a restaurar (${quantidade}) excede perdida atual (${equipment.quantidadePerdida}) de "${equipment.nome}".`,
      );
    }

    equipment.quantidadePerdida -= quantidade;
    equipment.quantidadeDisponivel += quantidade;
    equipment.quantidadeTotal += quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  // ============================================================
  // AJUSTE MANUAL
  // ============================================================

  /**
   * AJUSTE MANUAL: Ajuste positivo ou negativo de estoque pelo admin.
   * Afeta total e disponivel.
   */
  async ajustarEstoque(
    manager: EntityManager,
    equipmentId: number,
    delta: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    equipment.quantidadeTotal += delta;
    equipment.quantidadeDisponivel += delta;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }
}
