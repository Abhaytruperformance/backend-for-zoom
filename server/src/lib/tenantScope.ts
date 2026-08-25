/**
 * Every tenant-owned table lookup goes through here instead of ad hoc
 * `findUnique({ where: { id } })` calls, so a stray query can't leak
 * another tenant's row by id guessing.
 */
export class NotFoundInTenantError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundInTenantError";
  }
}

export function tenantWhere<T extends Record<string, unknown>>(tenantId: string, where: T): T & { tenantId: string } {
  return { ...where, tenantId };
}

/** Throws if the row's tenantId doesn't match the caller's tenant — use after any findFirst/findUnique that isn't already tenant-scoped in the query itself. */
export function assertTenantOwns<T extends { tenantId: string } | null | undefined>(
  entity: string,
  row: T,
  tenantId: string
): asserts row is NonNullable<T> {
  if (!row || row.tenantId !== tenantId) {
    throw new NotFoundInTenantError(entity);
  }
}
