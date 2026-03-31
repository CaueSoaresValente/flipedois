import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async create(data: {
    nome: string;
    email: string;
    senha: string;
    role?: UserRole;
  }) {
    const exists = await this.repo.findOne({ where: { email: data.email } });
    if (exists) {
      throw new BadRequestException('Email já cadastrado');
    }

    const senhaHash = await bcrypt.hash(data.senha, 10);

    const user = this.repo.create({
      nome: data.nome,
      email: data.email,
      senha: senhaHash,
      role: data.role ?? 'FUNCIONARIO',
    });

    return this.repo.save(user);
  }

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email, ativo: true } });
  }

  async findAll(page = 1, limit = 20) {
    const [data, total] = await this.repo.findAndCount({
      select: ['id', 'nome', 'email', 'role', 'ativo'],
      order: { nome: 'ASC' },
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
}
