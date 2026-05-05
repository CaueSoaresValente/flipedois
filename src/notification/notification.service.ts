import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../user/user.entity';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private lastCleanup = 0; // timestamp da última limpeza

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly gateway: NotificationGateway,
  ) {}

  /**
   * Cria uma notificação para TODOS os funcionários ativos.
   * Chamado quando o admin edita/remove/adiciona itens em checklist ativo.
   */
  async notificarFuncionarios(
    tipo: NotificationType,
    checklistId: number,
    checklistNome: string,
    equipmentNome: string,
    quantidadeAnterior?: number,
    quantidadeNova?: number,
  ) {
    // Busca todos os funcionários ativos
    const funcionarios = await this.userRepository.find({
      where: { role: 'FUNCIONARIO', ativo: true },
      select: ['id'],
    });

    if (funcionarios.length === 0) return;

    // Gera a mensagem legível
    const mensagem = this.gerarMensagem(
      tipo,
      equipmentNome,
      checklistNome,
      quantidadeAnterior,
      quantidadeNova,
    );

    // Cria uma notificação para cada funcionário
    const notificacoes = funcionarios.map((func) =>
      this.notificationRepository.create({
        userId: func.id,
        tipo,
        mensagem,
        checklistId,
        checklistNome,
        equipmentNome,
        quantidadeAnterior: quantidadeAnterior ?? undefined,
        quantidadeNova: quantidadeNova ?? undefined,
        lida: false,
      }),
    );

    const saved = await this.notificationRepository.save(notificacoes);

    // Push via WebSocket instantaneamente
    const userIds = funcionarios.map(f => f.id);
    for (const notif of saved) {
      this.gateway.sendToUser(notif.userId, notif);
    }
  }

  /**
   * Notifica todos os funcionarios sobre ações em eventos/checklist.
   * Usado para: liberar, cancelar, finalizar eventos e checklist.
   */
  async notificarEvento(
    tipo: NotificationType,
    mensagem: string,
    checklistId?: number,
    checklistNome?: string,
    equipmentNome?: string,
  ) {
    const funcionarios = await this.userRepository.find({
      where: { role: 'FUNCIONARIO', ativo: true },
      select: ['id'],
    });

    if (funcionarios.length === 0) return;

    const notificacoes = funcionarios.map((func) =>
      this.notificationRepository.create({
        userId: func.id,
        tipo,
        mensagem,
        checklistId: checklistId ?? undefined,
        checklistNome: checklistNome ?? undefined,
        equipmentNome: equipmentNome ?? undefined,
        lida: false,
      }),
    );

    const saved = await this.notificationRepository.save(notificacoes);

    for (const notif of saved) {
      this.gateway.sendToUser(notif.userId, notif);
    }
  }

  private gerarMensagem(
    tipo: NotificationType,
    equipmentNome: string,
    checklistNome: string,
    quantidadeAnterior?: number,
    quantidadeNova?: number,
  ): string {
    switch (tipo) {
      case 'QUANTIDADE_AUMENTADA': {
        const diff = (quantidadeNova ?? 0) - (quantidadeAnterior ?? 0);
        return `Quantidade de "${equipmentNome}" aumentada: ${quantidadeAnterior} \u2192 ${quantidadeNova} no checklist "${checklistNome}". Separe +${diff} unidade(s).`;
      }
      case 'QUANTIDADE_DIMINUIDA': {
        const diff = (quantidadeAnterior ?? 0) - (quantidadeNova ?? 0);
        return `Quantidade de "${equipmentNome}" diminu\u00edda: ${quantidadeAnterior} \u2192 ${quantidadeNova} no checklist "${checklistNome}". Retire ${diff} unidade(s).`;
      }
      case 'EQUIPAMENTO_REMOVIDO':
        return `Equipamento "${equipmentNome}" foi removido do checklist "${checklistNome}".`;
      case 'EQUIPAMENTO_ADICIONADO':
        return `Equipamento "${equipmentNome}" adicionado ao checklist "${checklistNome}" (${quantidadeNova} unidade(s)).`;
      default:
        return `Checklist "${checklistNome}" foi alterado.`;
    }
  }

  /**
   * Lista notificações de um usuário, paginadas e ordenadas por data (mais recente primeiro).
   * Executa limpeza periódica automática (a cada 1h).
   */
  async findByUser(userId: number, page = 1, limit = 20) {
    // Auto-cleanup: roda no máximo 1x por hora
    await this.autoCleanup();

    const [data, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Conta notificações não lidas do usuário.
   */
  async countUnread(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, lida: false },
    });
  }

  /**
   * Marca uma notificação como lida (somente se pertencer ao userId).
   */
  async markAsRead(notificationId: number, userId: number) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) return null;

    notification.lida = true;
    return this.notificationRepository.save(notification);
  }

  /**
   * Marca todas as notificações do usuário como lidas.
   */
  async markAllAsRead(userId: number) {
    await this.notificationRepository.update(
      { userId, lida: false },
      { lida: true },
    );
    return { message: 'Todas as notifica\u00e7\u00f5es foram marcadas como lidas.' };
  }

  /**
   * AUTO-CLEANUP: Remove notificações antigas para manter o banco limpo.
   * - Lidas: remove após 30 dias
   * - Não lidas: remove após 90 dias (segurança)
   * Roda no máximo 1x por hora para não sobrecarregar.
   */
  private async autoCleanup() {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    if (now - this.lastCleanup < ONE_HOUR) return;
    this.lastCleanup = now;

    try {
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

      // Remove lidas com mais de 30 dias
      await this.notificationRepository.delete({
        lida: true,
        createdAt: LessThan(thirtyDaysAgo),
      });

      // Remove não-lidas com mais de 90 dias (proteção)
      await this.notificationRepository.delete({
        lida: false,
        createdAt: LessThan(ninetyDaysAgo),
      });
    } catch {
      // Silently ignore cleanup errors
    }
  }
}
