import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Checklist } from './checklist.entity';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,
  ) {}

  async create(nome: string) {
    const checklist = this.checklistRepository.create({
      nome,
      status: 'rascunho',
    });

    return this.checklistRepository.save(checklist);
  }

  async findAll() {
    return this.checklistRepository.find({
      relations: ['items'],
    });
  }

  // ✅ LIBERAR PARA SEPARAÇÃO
  async liberar(id: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    if (checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Checklist já foi liberado ou concluído',
      );
    }

    checklist.status = 'pronto';
    return this.checklistRepository.save(checklist);
  }
}
