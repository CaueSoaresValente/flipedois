import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ChecklistItemHistoryService } from './checklist-item-history.service';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN', 'FUNCIONARIO')
@Controller('checklist-item-history')
export class ChecklistItemHistoryController {
  constructor(private readonly historyService: ChecklistItemHistoryService) {}

  @Get()
  findByChecklistItem(@Query('checklistItemId') checklistItemId: string) {
    const id = Number(checklistItemId);

    if (!id || isNaN(id)) {
      throw new BadRequestException(
        'checklistItemId é obrigatório e deve ser numérico',
      );
    }

    return this.historyService.findByChecklistItem(id);
  }
}
