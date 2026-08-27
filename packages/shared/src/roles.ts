export const Role = {
  ADMIN: "ADMIN",
  STUDENT: "STUDENT",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = [Role.ADMIN, Role.STUDENT];
