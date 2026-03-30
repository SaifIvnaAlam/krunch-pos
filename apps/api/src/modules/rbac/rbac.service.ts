import { Injectable } from '@nestjs/common';

@Injectable()
export class RbacService {
  hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    if (userPermissions.includes('*')) {
      return true;
    }
    return userPermissions.includes(requiredPermission);
  }

  hasAnyPermission(
    userPermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    if (userPermissions.includes('*')) {
      return true;
    }
    return requiredPermissions.some((p) => userPermissions.includes(p));
  }

  hasAllPermissions(
    userPermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    if (userPermissions.includes('*')) {
      return true;
    }
    return requiredPermissions.every((p) => userPermissions.includes(p));
  }

  resolveEffectivePermissions(
    rolePermissions: string[][],
    tempPermissions: string[] = [],
  ): string[] {
    const allPermissions = rolePermissions.flat().concat(tempPermissions);
    return [...new Set(allPermissions)];
  }
}
