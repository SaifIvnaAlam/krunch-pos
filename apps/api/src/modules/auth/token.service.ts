import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { parseEnvSeconds } from '../../common/parse-env-int';

interface TokenPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
}

interface JwtPayloadFull extends TokenPayload {
  iat: number;
  exp: number;
}

@Injectable()
export class TokenService {
  private readonly refreshSecret: string;
  private readonly refreshExpiry: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.refreshExpiry = parseEnvSeconds(
      this.configService,
      'JWT_REFRESH_EXPIRY',
      28800,
    );
  }

  async generateTokenPair(
    payload: TokenPayload,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiry,
    });

    return { accessToken, refreshToken };
  }

  async verifyRefreshToken(token: string): Promise<JwtPayloadFull> {
    try {
      return this.jwtService.verify<JwtPayloadFull>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async decodeToken(token: string): Promise<JwtPayloadFull> {
    const payload = this.jwtService.decode(token) as JwtPayloadFull | null;
    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }
    return payload;
  }
}
