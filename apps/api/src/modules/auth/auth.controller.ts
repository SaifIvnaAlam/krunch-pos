import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';
import { AuthResult } from './auth.types';
import { LoginEmailDto } from './dto/login-email.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LookupRestaurantsDto } from './dto/lookup-restaurants.dto';
import { AuthBranchSummary } from './auth.types';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login/restaurants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List restaurants linked to an email (before password step)',
  })
  @ApiResponse({ status: 200, description: 'Restaurants for this email, if any' })
  async lookupRestaurants(
    @Body() dto: LookupRestaurantsDto,
  ): Promise<{ restaurants: AuthBranchSummary[] }> {
    const restaurants = await this.authService.lookupRestaurantsByEmail(dto.email);
    return { restaurants };
  }

  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email + password sign-in' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async loginEmail(@Body() dto: LoginEmailDto): Promise<AuthResult> {
    return this.authService.loginWithEmail({
      email: dto.email,
      password: dto.password,
      terminalId: dto.terminalId,
      branchId: dto.branchId,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Body() dto: RefreshDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and blacklist token' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(@Req() req: Request): Promise<{ message: string }> {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    const user = req.user as JwtPayload;
    await this.authService.logout(token, user.staffId);
    return { message: 'Logged out successfully' };
  }
}
