import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { Checklist } from '../checklist/checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { EventTeam } from '../event/event-team.entity';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';
import { User } from '../user/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SystemPopulatorSeed implements OnModuleInit {
  constructor(
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(Checklist)
    private readonly checklistRepo: Repository<Checklist>,
    @InjectRepository(ChecklistItem)
    private readonly itemRepo: Repository<ChecklistItem>,
    @InjectRepository(EventTeam)
    private readonly teamRepo: Repository<EventTeam>,
    @InjectRepository(EquipmentOccurrence)
    private readonly occurrenceRepo: Repository<EquipmentOccurrence>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // Force population for now to ensure user sees data
    console.log('--- INICIANDO POPULAÇÃO DO SISTEMA ---');
    console.log('🚀 Populando o sistema com dados iniciais...');

    try {
      await this.dataSource.transaction(async (manager) => {
        // 1. Criar Equipamentos
        const equipmentsData = [
          // ÁUDIO
          { nome: 'Microfone Shure SM58', desc: 'Microfone dinâmico vocal clássico', qty: 20, setor: 'som' },
          { nome: 'Microfone Shure SM57', desc: 'Microfone para instrumentos', qty: 15, setor: 'som' },
          { nome: 'Caixa Ativa JBL EON715', desc: 'Caixa de som 15 pol 1300W', qty: 8, setor: 'som' },
          { nome: 'Mesa Digital Behringer X32', desc: 'Console de mixagem 32 canais', qty: 2, setor: 'som' },
          { nome: 'Cabo XLR 10m', desc: 'Cabo balanceado para áudio', qty: 50, setor: 'som' },
          { nome: 'Pedestal para Microfone', desc: 'Suporte tipo girafa', qty: 25, setor: 'som' },
          
          // VÍDEO
          { nome: 'Projetor Epson 5000 Lumens', desc: 'Projetor Full HD alto brilho', qty: 4, setor: 'video' },
          { nome: 'Tela de Projeção 120 pol', desc: 'Tela retrátil manual', qty: 4, setor: 'video' },
          { nome: 'TV LED 55 pol 4K', desc: 'Monitor para retorno/apresentação', qty: 6, setor: 'video' },
          { nome: 'Cabo HDMI 15m', desc: 'Cabo blindado v2.0', qty: 15, setor: 'video' },
          { nome: 'Switcher Blackmagic ATEM Mini Pro', desc: 'Mesa de corte de vídeo', qty: 2, setor: 'video' },
          { nome: 'Notebook Dell G15 (PPT)', desc: 'Notebook para apresentações', qty: 5, setor: 'video' },

          // LUZ
          { nome: 'Refletor LED Par 64 RGBW', desc: 'Refletor 18x12W', qty: 40, setor: 'luz' },
          { nome: 'Moving Head Beam 7R', desc: 'Cabeça móvel de feixe concentrado', qty: 12, setor: 'luz' },
          { nome: 'Mesa de Luz MA onPC Command Wing', desc: 'Controladora DMX profissional', qty: 1, setor: 'luz' },
          { nome: 'Cabo DMX 5m', desc: 'Cabo para sinal de iluminação', qty: 40, setor: 'luz' },
          { nome: 'Máquina de Fumaça 1500W', desc: 'Máquina de efeito de fumaça', qty: 3, setor: 'luz' },

          // ESTRUTURA
          { nome: 'Treliça Q20 2m', desc: 'Módulo de alumínio', qty: 20, setor: 'estrutura' },
          { nome: 'Base de Ferro 60x60', desc: 'Base para treliça', qty: 12, setor: 'estrutura' },
          { nome: 'Praticável Pantográfico 2x1m', desc: 'Palco modular', qty: 15, setor: 'estrutura' },
        ];

        const createdEquips: Equipment[] = [];
        for (const eq of equipmentsData) {
          let e = await manager.findOne(Equipment, { where: { nome: eq.nome } });
          if (!e) {
            e = manager.create(Equipment, {
              nome: eq.nome,
              descricao: eq.desc,
              quantidadeTotal: eq.qty,
              quantidadeDisponivel: eq.qty,
              quantidadeEmUso: 0,
              quantidadeDanificada: 0,
              quantidadePerdida: 0,
              setor: eq.setor,
              origem: 'interno',
              ativo: true,
            });
            e = await manager.save(Equipment, e);
          }
          createdEquips.push(e);
        }

        // 2. Criar Eventos com diferentes status
        const now = new Date();
        
        // --- EVENTO 1: FINALIZADO (Passado) ---
        let ev1 = await manager.findOne(Event, { where: { nome: 'Convenção Nacional de Vendas 2023' } });
        if (!ev1) {
          ev1 = await manager.save(Event, manager.create(Event, {
            nome: 'Convenção Nacional de Vendas 2023',
            cliente: 'Empresa Global S/A',
            local: 'Centro de Convenções Expo Center',
            dataInicio: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 dias atrás
            dataFim: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
            status: 'finalizado',
            finalizadoEm: new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000),
            finalizadoPor: 'admin@email.com',
            foiFinalizadoPreviamente: true,
          }));

          const cl1 = await manager.save(Checklist, manager.create(Checklist, {
            nome: 'Checklist Principal',
            status: 'concluido',
            event: ev1,
          }));

          // Adicionar itens e algumas ocorrências (simulando perda/dano)
          const item1_1 = await manager.save(ChecklistItem, manager.create(ChecklistItem, {
            checklist: cl1,
            equipmentId: createdEquips[0].id, // SM58
            nomeSnapshot: createdEquips[0].nome,
            descricaoSnapshot: createdEquips[0].descricao,
            quantidadePlanejada: 10,
            quantidadeSeparada: 10,
            quantidadeDevolvida: 10,
            quantidadeOk: 9,
            quantidadeQuebrada: 1,
            statusSeparacao: 'separado',
            statusDevolucao: 'devolvido',
          }));
          
          // Criar ocorrência de dano para o item 1
          await manager.save(EquipmentOccurrence, manager.create(EquipmentOccurrence, {
            checklistItemId: item1_1.id,
            equipment: createdEquips[0],
            tipo: 'DANO',
            quantidade: 1,
            descricao: 'Cápsula amassada após queda no palco',
            status: 'BAIXADO',
          }));
          
          // Atualizar estoque para refletir o dano
          createdEquips[0].quantidadeTotal -= 1;
          createdEquips[0].quantidadeDisponivel -= 1;
          createdEquips[0].quantidadeDanificada += 1;
          await manager.save(Equipment, createdEquips[0]);
        }

        // --- EVENTO 2: ATIVO (Em andamento - Separado) ---
        let ev2 = await manager.findOne(Event, { where: { nome: 'Casamento Marina & Pedro' } });
        if (!ev2) {
          ev2 = await manager.save(Event, manager.create(Event, {
            nome: 'Casamento Marina & Pedro',
            cliente: 'Marina Silva',
            local: 'Fazenda Santa Maria',
            dataInicio: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // Ontem
            dataFim: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // Amanhã
            status: 'ativo',
          }));

          const cl2 = await manager.save(Checklist, manager.create(Checklist, {
            nome: 'Checklist Som e Luz',
            status: 'em_evento',
            event: ev2,
          }));

          // Itens reservados (quantidadeEmUso)
          const itemsToReserve = [
            { eqIdx: 2, qty: 4 }, // JBL EON
            { eqIdx: 4, qty: 10 }, // Cabos XLR
            { eqIdx: 12, qty: 12 }, // Par LED
            { eqIdx: 13, qty: 4 }, // Moving Head
          ];

          for (const it of itemsToReserve) {
            const eq = createdEquips[it.eqIdx];
            await manager.save(ChecklistItem, manager.create(ChecklistItem, {
              checklist: cl2,
              equipmentId: eq.id,
              nomeSnapshot: eq.nome,
              descricaoSnapshot: eq.descricao,
              quantidadePlanejada: it.qty,
              quantidadeSeparada: it.qty,
              statusSeparacao: 'separado',
              statusDevolucao: 'pendente',
            }));
            
            eq.quantidadeDisponivel -= it.qty;
            eq.quantidadeEmUso += it.qty;
            await manager.save(Equipment, eq);
          }

          // 3. Adicionar equipe
          const equipeNomes = ['Carlos Silva', 'Ana Oliveira', 'Ricardo Santos', 'Beatriz Lima'];
          const equipeFuncoes = ['montagem', 'operacao', 'montagem', 'operacao'];
          
          for (let i = 0; i < equipeNomes.length; i++) {
            await manager.save(EventTeam, manager.create(EventTeam, {
              nome: equipeNomes[i],
              funcao: equipeFuncoes[i] as any,
              event: ev2,
            }));
          }
        }

        // --- EVENTO 3: RASCUNHO (Futuro) ---
        let ev3 = await manager.findOne(Event, { where: { nome: 'Lançamento Novo Carro X' } });
        if (!ev3) {
          ev3 = await manager.save(Event, manager.create(Event, {
            nome: 'Lançamento Novo Carro X',
            cliente: 'Concessionária Top',
            local: 'Pavilhão de Eventos',
            dataInicio: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 dias no futuro
            dataFim: new Date(now.getTime() + 17 * 24 * 60 * 60 * 1000),
            status: 'ativo',
          }));

          const cl3 = await manager.save(Checklist, manager.create(Checklist, {
            nome: 'Estrutura e Vídeo',
            status: 'rascunho',
            event: ev3,
          }));

          await manager.save(ChecklistItem, manager.create(ChecklistItem, {
            checklist: cl3,
            equipmentId: createdEquips[6].id, // Projetor
            nomeSnapshot: createdEquips[6].nome,
            descricaoSnapshot: createdEquips[6].descricao,
            quantidadePlanejada: 2,
          }));
          
          await manager.save(ChecklistItem, manager.create(ChecklistItem, {
            checklist: cl3,
            equipmentId: createdEquips[17].id, // Treliça
            nomeSnapshot: createdEquips[17].nome,
            descricaoSnapshot: createdEquips[17].descricao,
            quantidadePlanejada: 8,
          }));
        }

        // --- EVENTO 4: ARQUIVADO (Lixeira) ---
        let ev4 = await manager.findOne(Event, { where: { nome: 'Show de Talentos Escola XYZ' } });
        if (!ev4) {
          await manager.save(Event, manager.create(Event, {
            nome: 'Show de Talentos Escola XYZ',
            cliente: 'Escola XYZ',
            local: 'Teatro Municipal',
            dataInicio: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
            dataFim: new Date(now.getTime() - 44 * 24 * 60 * 60 * 1000),
            status: 'finalizado',
            arquivado: true,
            arquivadoEm: new Date(),
            arquivadoPor: 'admin@email.com',
            foiFinalizadoPreviamente: true,
          }));
        }

        // --- EVENTO 5: CANCELADO ---
        let ev5 = await manager.findOne(Event, { where: { nome: 'Festa de Final de Ano Cancelada' } });
        if (!ev5) {
          await manager.save(Event, manager.create(Event, {
            nome: 'Festa de Final de Ano Cancelada',
            cliente: 'Empresa B',
            local: 'Clube de Campo',
            dataInicio: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
            dataFim: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
            status: 'cancelado',
            motivoCancelamento: 'Corte de orçamento do cliente',
            canceladoEm: new Date(),
            canceladoPor: 'admin@email.com',
          }));
        }

        // 4. Criar Usuários Adicionais
        const extraUsers = [
          { nome: 'João Técnico', email: 'joao@email.com', role: 'FUNCIONARIO' },
          { nome: 'Maria Produtora', email: 'maria@email.com', role: 'FUNCIONARIO' },
          { nome: 'Pedro Logística', email: 'pedro@email.com', role: 'FUNCIONARIO' },
          { nome: 'Ana Coordenação', email: 'ana@email.com', role: 'ADMIN' },
        ];

        for (const u of extraUsers) {
          const exists = await manager.findOne(User, { where: { email: u.email } });
          if (!exists) {
            await manager.save(User, manager.create(User, {
              nome: u.nome,
              email: u.email,
              senha: bcrypt.hashSync('123456', 10),
              role: u.role as any,
              ativo: true,
            }));
          }
        }

        console.log('✅ Sistema populado com sucesso!');
      });
    } catch (error) {
      console.error('❌ Erro ao popular o sistema:', error);
    }
  }
}
