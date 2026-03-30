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
import { AuthResult, OverrideResult } from './auth.types';
import { LoginPinDto } from './dto/login-pin.dto';
import { LoginEmailDto } from './dto/login-email.dto';
import { LoginGoogleDto } from './dto/login-google.dto';
import { NfcLoginDto } from './dto/nfc-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { OverrideDto } from './dto/override.dto';

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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PIN login (staff terminal)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginPinDto): Promise<AuthResult> {
    return this.authService.loginWithPin(dto);
  }

  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email + password (portal-style)' })
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

  @Post('login/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google ID token',
    description:
      'Verifies a Google ID token and issues API JWTs when staff email matches.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 400, description: 'Google OAuth not configured' })
  @ApiResponse({ status: 401, description: 'Invalid token or no linked staff' })
  async loginGoogle(@Body() dto: LoginGoogleDto): Promise<AuthResult> {
    return this.authService.loginWithGoogle(dto);
  }

  @Post('login/nfc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'NFC card login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid NFC card' })
  async loginNfc(@Body() dto: NfcLoginDto): Promise<AuthResult> {
    return this.authService.loginWithNfc(dto);
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

  @Post('override')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request manager override token' })
  @ApiResponse({ status: 200, description: 'Override token issued' })
  @ApiResponse({ status: 401, description: 'Invalid manager credentials' })
  @ApiResponse({ status: 403, description: 'Manager lacks required permission' })
  async override(@Body() dto: OverrideDto): Promise<OverrideResult> {
    return this.authService.requestOverride(dto);
  }
}
