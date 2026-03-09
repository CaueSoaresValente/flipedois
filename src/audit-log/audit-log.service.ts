import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repository: Repository<AuditLog>,
  ) {}

  async log(
    userId: number | null,
    userEmail: string | null,
    action: AuditAction,
    entity: string,
    entityId: number | null,
    changes?: Record<string, any>,
    description?: string,
  ) {
    const entry = this.repository.create({
      userId: userId ?? undefined,
      userEmail: userEmail ?? undefined,
      action,
      entity,
      entityId: entityId ?? undefined,
      changes: changes ? JSON.stringify(changes) : undefined,
      description,
    });

    return this.repository.save(entry);
  }

  async findAll(filters?: {
    userId?: number;
    entity?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const qb = this.repository.createQueryBuilder('log');

    if (filters?.userId) {
      qb.andWhere('log.userId = :userId', { userId: filters.userId });
    }

    if (filters?.entity) {
      qb.andWhere('log.entity = :entity', { entity: filters.entity });
    }

    if (filters?.action) {
      qb.andWhere('log.action = :action', { action: filters.action });
    }

    if (filters?.startDate) {
      qb.andWhere('log.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters?.endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate: filters.endDate });
    }

    qb.orderBy('log.createdAt', 'DESC');

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    qb.take(limit).skip(offset);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, limit, offset };
  }
}
