import { canOperate } from '../../constants/roles';
import type { SessionUser } from '../../types';

/**
 * My Work has a few contextual actions whose old UI rules predate the server
 * capability payload. Keep those rules only for legacy sessions. Once the BFF
 * supplies `capabilities.operations`, it is the authority for rendering an
 * executable control.
 */
export const MY_WORK_ACTION_OPERATIONS = {
  defectHandoff: 'testing:manage',
  taskHandoff: 'projects:manage',
} as const;

export type MyWorkAction = keyof typeof MY_WORK_ACTION_OPERATIONS;

export function hasAuthoritativeMyWorkOperations(user: SessionUser | null | undefined): boolean {
  return Array.isArray(user?.capabilities?.operations);
}

export function isMyWorkActionEligible(
  user: SessionUser | null | undefined,
  action: MyWorkAction,
  legacyEligible: boolean,
): boolean {
  if (hasAuthoritativeMyWorkOperations(user)) {
    return canOperate(user, MY_WORK_ACTION_OPERATIONS[action]);
  }
  return legacyEligible;
}
