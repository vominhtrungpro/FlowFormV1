import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CurrentUserPayload } from '../common/current-user.decorator';

interface JwtClaims {
  sub: number;
  email: string;
  role: string;
  tag: string;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
      issuer: config.get<string>('JWT_ISSUER'),
      audience: config.get<string>('JWT_ISSUER'),
    });
  }

  // Return value becomes `request.user` — same shape read by the CurrentUser decorator.
  validate(payload: JwtClaims): CurrentUserPayload {
    return { userId: payload.sub, email: payload.email, role: payload.role, tag: payload.tag };
  }
}
