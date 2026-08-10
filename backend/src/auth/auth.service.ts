import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // Ports AccountController.Login's verify step (email lookup + PasswordHasher.VerifyHashedPassword)
  // and TokenService.GenerateToken's claim shape (sub/email/role/tag/jti, HS256) — the JWT is the
  // real auth mechanism here (unlike the old app, where it was generated but never validated).
  async login(email: string, password: string) {
    const user = await this.prisma.db.user.findFirst({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const expiryMinutes = Number(this.config.get('JWT_EXPIRY_MINUTES') ?? 480);
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, tag: user.tag, jti: randomUUID() },
      { expiresIn: `${expiryMinutes}m` },
    );

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, tag: user.tag },
    };
  }

  async me(userId: number) {
    const user = await this.prisma.db.user.findFirst({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, role: user.role, tag: user.tag };
  }
}
