import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route OUT of JwtAuthGuard.
 * Use sparingly — only for /health, /auth/login, /auth/refresh.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
