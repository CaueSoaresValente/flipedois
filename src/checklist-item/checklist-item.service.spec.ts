import { Test, TestingModule } from '@nestjs/testing';
import { ChecklistItemService } from './checklist-item.service';

describe('ChecklistItemService', () => {
  let service: ChecklistItemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChecklistItemService],
    }).compile();

    service = module.get<ChecklistItemService>(ChecklistItemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
