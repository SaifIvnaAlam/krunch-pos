import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../redis/redis.service';
import { Request } from 'express';

interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const isBlacklisted = await this.redis.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return payload;
  }
}
