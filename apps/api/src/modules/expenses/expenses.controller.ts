import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QuickExpenseDto } from './dto/quick-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Expenses')
@Controller('expenses')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'List expenses (payables) with derived paid/due/status' })
  list(@Query() query: ListExpensesQueryDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.expenses.listForBranch(user.branchId, query);
  }

  @Post()
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Create an expense payable' })
  create(@Body() dto: CreateExpenseDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.expenses.create(user.branchId, dto);
  }

  @Post('quick')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Quick Expense: create + pay in one step' })
  quick(@Body() dto: QuickExpenseDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.expenses.quick(user.branchId, dto);
  }

  @Get(':id')
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'Get one expense with items, payments and returns' })
  getOne(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.expenses.getOne(user.branchId, id);
  }

  @Put(':id')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Update an expense (items replaced when provided)' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.expenses.update(user.branchId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Delete an expense (must have no payments)' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.expenses.remove(user.branchId, id);
  }
}
