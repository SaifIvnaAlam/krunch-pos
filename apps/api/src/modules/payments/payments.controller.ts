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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermission('daily_entry:read')
  @ApiOperation({ summary: 'List payments (disbursements) for the signed-in branch' })
  list(@Query() query: ListPaymentsQueryDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.payments.list(user.branchId, query);
  }

  @Post()
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Record a payment against an expense or salary line' })
  create(@Body() dto: CreatePaymentDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.payments.create(user.branchId, dto);
  }

  @Put(':id')
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Update a payment' })
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.payments.update(user.branchId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('daily_entry:write')
  @ApiOperation({ summary: 'Delete a payment' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.payments.remove(user.branchId, id);
  }
}
