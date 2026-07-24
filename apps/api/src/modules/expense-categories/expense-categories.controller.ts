import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ExpenseCategoriesService } from './expense-categories.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Expense categories')
@Controller('expense-categories')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Get()
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'List expense categories for the signed-in branch' })
  list(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.categories.listForBranch(user.branchId);
  }

  @Post()
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Create an expense category' })
  create(@Body() dto: CreateExpenseCategoryDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.categories.create(user.branchId, dto);
  }

  @Put(':id')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Update an expense category' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload;
    return this.categories.update(user.branchId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Delete an expense category' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.categories.remove(user.branchId, id);
  }
}
