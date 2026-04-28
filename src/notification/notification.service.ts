import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../user/user.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Cria uma notificação para TODOS os funcionários ativos.
   * Chamado quando o admin edita/remove/adiciona itens em checklists ativos.
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

    await this.notificationRepository.save(notificacoes);
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
        return `Quantidade de "${equipmentNome}" aumentada: ${quantidadeAnterior} → ${quantidadeNova} no checklist "${checklistNome}". Separe +${diff} unidade(s).`;
      }
      case 'QUANTIDADE_DIMINUIDA': {
        const diff = (quantidadeAnterior ?? 0) - (quantidadeNova ?? 0);
        return `Quantidade de "${equipmentNome}" diminuída: ${quantidadeAnterior} → ${quantidadeNova} no checklist "${checklistNome}". Retire ${diff} unidade(s).`;
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
   */
  async findByUser(userId: number, page = 1, limit = 20) {
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
    return { message: 'Todas as notificações foram marcadas como lidas.' };
  }
}
