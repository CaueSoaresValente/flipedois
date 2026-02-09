import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChecklistTeam } from './checklist-team.entity';

@Injectable()
export class ChecklistTeamService {
  constructor(
    @InjectRepository(ChecklistTeam)
    private readonly repo: Repository<ChecklistTeam>,
  ) {}

  create(data: Partial<ChecklistTeam>) {
    return this.repo.save(this.repo.create(data));
  }

  findByChecklist(checklistId: number) {
    return this.repo.find({ where: { checklistId } });
  }

  remove(id: number) {
    return this.repo.delete(id);
  }
}
