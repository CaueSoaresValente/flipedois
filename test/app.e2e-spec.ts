import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Fluxo completo E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let funcToken: string;
  let equipmentId: number;
  let checklistId: number;
  let itemId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login admin', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@email.com',
      senha: '123456',
    });

    expect(res.status).toBe(201);
    adminToken = res.body.access_token;
  });

  it('criar equipamento', async () => {
    const res = await request(app.getHttpServer())
      .post('/equipment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome: 'Projetor',
        descricao: 'Projetor Epson',
        quantidadeTotal: 10,
      });

    equipmentId = res.body.id;
  });

  it('criar checklist', async () => {
    const res = await request(app.getHttpServer())
      .post('/checklist')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nome: 'Evento XPTO' });

    checklistId = res.body.id;
  });

  it('adicionar item', async () => {
    const res = await request(app.getHttpServer())
      .post('/checklist-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        checklistId,
        equipmentId,
        quantidadePlanejada: 5,
      });

    itemId = res.body.id;
  });

  it('liberar checklist', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/checklist/${checklistId}/liberar`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.status).toBe('liberado');
  });

  it('login funcionario', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'func@email.com',
      senha: '123456',
    });

    funcToken = res.body.access_token;
  });

  it('separar item', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/checklist-item/${itemId}/separar`)
      .set('Authorization', `Bearer ${funcToken}`)
      .send({ quantidadeSeparada: 5 });

    expect(res.body.statusSeparacao).toBe('separado');
  });

  it('devolver item', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/checklist-item/${itemId}/devolver`)
      .set('Authorization', `Bearer ${funcToken}`)
      .send({ quantidadeDevolvida: 5 });

    expect(res.body.statusDevolucao).toBe('devolvido');
  });

  it('ver histórico', async () => {
    const res = await request(app.getHttpServer())
      .get(`/checklist-item-history?checklistItemId=${itemId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.length).toBeGreaterThan(0);
  });
});
