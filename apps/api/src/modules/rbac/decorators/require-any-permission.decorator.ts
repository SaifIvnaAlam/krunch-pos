import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_any_permissions';

export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
