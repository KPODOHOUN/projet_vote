import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '@prisma/client';

@Injectable()
export class AccountPlanGuard implements CanActivate {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser;

    if (!user) {
      return false;
    }

    if (
      user.role === UserRole.PLATFORM_ADMIN ||
      user.role === UserRole.PLATFORM_SUPER_ADMIN
    ) {
      return true;
    }

    await this.subscriptionsService.assertCanCreateEvent(user.tenantId);
    return true;
  }
}
