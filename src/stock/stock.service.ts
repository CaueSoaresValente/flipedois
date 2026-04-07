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
 *   quantidadeTotal = disponivel + emUso + danificada
 *
 * NOTA: quantidadePerdida é um contador separado.
 * Itens perdidos são removidos do quantidadeTotal.
 * Itens danificados permanecem no quantidadeTotal (bucket danificada).
 *
 * FLUXO DE ESTOQUE:
 *
 * 1. LIBERAR CHECKLIST:
 *    disponivel -= planejado, emUso += planejado
 *
 * 2. DEVOLUÇÃO OK:
 *    disponivel += qty, emUso -= qty
 *
 * 3. DEVOLUÇÃO DANIFICADA (via confirmarBaixa):
 *    emUso -= qty
 *    danificada += qty
 *    (total NÃO muda — item permanece no total, apenas muda de bucket)
 *
 * 4. DEVOLUÇÃO PERDIDA (via confirmarBaixa):
 *    emUso -= qty
 *    perdida += qty
 *    total -= qty  (item sai do sistema)
 *
 * 5. CANCELAR/ACHAR OCORRÊNCIA BAIXADA:
 *    DANO: danificada -= qty, disponivel += qty
 *    PERDA: perdida -= qty, disponivel += qty, total += qty
 *
 * 6. DANO MANUAL (sem devolução):
 *    disponivel -= qty, danificada += qty
 *    (total NÃO muda)
 *
 * 7. PERDA MANUAL (sem devolução):
 *    disponivel -= qty, perdida += qty, total -= qty
 *
 * REGRAS:
 *   - Nenhum campo pode ficar negativo
 *   - Todo método deve ser chamado dentro de uma transação ativa
 *   - Todo método usa pessimistic_write lock no equipamento
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
      throw new BadRequestException(
        `Equipamento ID ${equipmentId} não encontrado.`,
      );
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
   * Regra de ouro (interno e alugado):
   *   disponivel -= quantidade, emUso += quantidade
   *
   * Bloqueia se estoque insuficiente.
   */
  async reservarEstoque(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException(
        'Quantidade inválida para reservar estoque.',
      );
    }

    if (quantidade > equipment.quantidadeDisponivel) {
      throw new BadRequestException(
        `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${quantidade}.`,
      );
    }

    equipment.quantidadeDisponivel -= quantidade;
    equipment.quantidadeEmUso += quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * CANCELAR LIBERAÇÍO: Reverte a reserva (cancela checklist/evento ou reduz quantidade).
   *
   * Regra de ouro (interno e alugado):
   *   disponivel += quantidade
   *   emUso -= quantidade
   */
  async liberarReserva(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException(
        'Quantidade inválida para liberar reserva.',
      );
    }

    // Guard forte: não aceitar estados inconsistentes (rollback via exception)
    if (quantidade > equipment.quantidadeEmUso) {
      throw new BadRequestException(
        `Não é possível liberar ${quantidade} de "${equipment.nome}" porque emUso atual é ${equipment.quantidadeEmUso}.`,
      );
    }

    equipment.quantidadeDisponivel += quantidade;
    equipment.quantidadeEmUso -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  // ============================================================
  // DEVOLUÇÍO (Return flows)
  // ============================================================

  /**
   * DEVOLUÇÍO OK: Equipamento devolvido em bom estado.
   *
   * Regra de ouro (interno e alugado):
   *   disponivel += quantidade
   *   emUso -= quantidade
   *
   * CORRIGIDO: Antes retornava early para alugados sem decrementar emUso.
   */
  async registrarDevolucaoOk(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida para devolução.');
    }

    if (quantidade > equipment.quantidadeEmUso) {
      throw new BadRequestException(
        `Devolução excede o emUso atual de "${equipment.nome}". Em uso: ${equipment.quantidadeEmUso}, devolvendo: ${quantidade}.`,
      );
    }

    equipment.quantidadeDisponivel += quantidade;
    equipment.quantidadeEmUso -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * DEVOLUÇÍO DANIFICADA: Equipamento devolvido danificado.
   * Ajuste imediato no momento da devolução — sem esperar confirmação de ocorrência.
   *
   * emUso -= quantidade
   * danificada += quantidade
   *
   * total NÃO muda — item permanece no total, apenas muda de bucket.
   * Aplica para qualquer origem (interno e alugado).
   */
  async registrarDevolucaoDanificado(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida para devolução.');
    }

    if (quantidade > equipment.quantidadeEmUso) {
      throw new BadRequestException(
        `Devolução excede o emUso atual de "${equipment.nome}". Em uso: ${equipment.quantidadeEmUso}, devolvendo: ${quantidade}.`,
      );
    }

    equipment.quantidadeEmUso -= quantidade;
    equipment.quantidadeDanificada += quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * DEVOLUÇÍO PERDIDA: Equipamento declarado como perdido.
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

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida para devolução.');
    }

    if (quantidade > equipment.quantidadeEmUso) {
      throw new BadRequestException(
        `Devolução excede o emUso atual de "${equipment.nome}". Em uso: ${equipment.quantidadeEmUso}, devolvendo: ${quantidade}.`,
      );
    }

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
   *
   * total NÃO muda — restaura de danificada para disponivel.
   * Chamado apenas quando o status da ocorrência era BAIXADO.
   */
  async cancelarDano(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida para cancelar dano.');
    }

    if (quantidade > equipment.quantidadeDanificada) {
      throw new BadRequestException(
        `Quantidade a restaurar (${quantidade}) excede danificada atual (${equipment.quantidadeDanificada}) de "${equipment.nome}".`,
      );
    }

    equipment.quantidadeDanificada -= quantidade;
    equipment.quantidadeDisponivel += quantidade;

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

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida para cancelar perda.');
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
  // OCORRÊNCIA MANUAL (Manual damage/loss — stock from disponivel)
  // ============================================================

  /**
   * DANO MANUAL: Equipamento danificado fora do fluxo de devolução.
   * Reduz de disponível (não de emUso).
   *
   * disponivel -= quantidade
   * danificada += quantidade
   * total -= quantidade
   */
  async registrarDanoManual(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida para registrar dano.');
    }

    if (quantidade > equipment.quantidadeDisponivel) {
      throw new BadRequestException(
        `Estoque disponível insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${quantidade}.`,
      );
    }

    equipment.quantidadeDisponivel -= quantidade;
    equipment.quantidadeDanificada += quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }

  /**
   * PERDA MANUAL: Equipamento perdido fora do fluxo de devolução.
   * Reduz de disponível (não de emUso).
   *
   * disponivel -= quantidade
   * perdida += quantidade
   * total -= quantidade
   */
  async registrarPerdaManual(
    manager: EntityManager,
    equipmentId: number,
    quantidade: number,
  ): Promise<Equipment> {
    const equipment = await this.getEquipmentWithLock(manager, equipmentId);

    if (quantidade <= 0) {
      throw new BadRequestException(
        'Quantidade inválida para registrar perda.',
      );
    }

    if (quantidade > equipment.quantidadeDisponivel) {
      throw new BadRequestException(
        `Estoque disponível insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${quantidade}.`,
      );
    }

    equipment.quantidadeDisponivel -= quantidade;
    equipment.quantidadePerdida += quantidade;
    equipment.quantidadeTotal -= quantidade;

    this.validarEstoque(equipment);
    return manager.save(Equipment, equipment);
  }
}
