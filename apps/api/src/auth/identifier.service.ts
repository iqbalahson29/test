import { Injectable } from '@nestjs/common';
import { normalizeIdentifier } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';
import { authError } from './security/primitives';
@Injectable()
export class IdentifierService {
  constructor(private readonly db: PrismaService) {}
  normalize(value: unknown) {
    try {
      return normalizeIdentifier(value);
    } catch {
      throw authError('VALIDATION_ERROR');
    }
  }
  resolve(value: unknown) {
    return this.db.user.findUnique({
      where: { emailNormalized: this.normalize(value).normalized },
    });
  }
}
