import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { Request } from 'express';

interface JwtPayload { staffId: string; branchId: string; terminalId: string; roles: string[]; permissions: string[]; }

@ApiTags('Menu')
@Controller('menu')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth('access-token')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @RequirePermission('menu:read')
  @ApiOperation({ summary: 'Get menu (branch-scoped)' })
  async getMenu(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.menuService.getMenu(user.branchId);
  }

  @Post()
  @RequirePermission('menu:create')
  @ApiOperation({ summary: 'Create menu item' })
  async createItem(@Body() dto: { name: string; description?: string; price: number; category: string; modifiers?: Record<string, unknown> }, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.menuService.createItem(dto, user.staffId, user.branchId, user.terminalId);
  }

  @Patch(':id')
  @RequirePermission('menu:edit')
  @ApiOperation({ summary: 'Edit menu item' })
  async updateItem(@Param('id') id: string, @Body() dto: { name?: string; description?: string; price?: number; category?: string; isAvailable?: boolean; modifiers?: Record<string, unknown> }, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.menuService.updateItem(id, dto, user.staffId, user.branchId, user.terminalId);
  }

  @Delete(':id')
  @RequirePermission('menu:delete')
  @ApiOperation({ summary: 'Delete menu item' })
  async deleteItem(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.menuService.deleteItem(id, user.staffId, user.branchId, user.terminalId);
    return { message: 'Menu item deleted' };
  }

  @Post(':id/86')
  @RequirePermission('menu:86')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark as sold out (86)' })
  async mark86(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.menuService.mark86(id, user.staffId, user.branchId, user.terminalId);
  }

  @Delete(':id/86')
  @RequirePermission('menu:86')
  @ApiOperation({ summary: 'Un-86 item' })
  async un86(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.menuService.un86(id, user.staffId, user.branchId, user.terminalId);
  }
}
