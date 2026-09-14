import { assertOfflineScope, type OfflineScope } from "@/lib/offline/scope";
const pending = new WeakMap<OfflineScope, Set<Promise<unknown>>>();
/** Inclure la compression et les écritures photo déjà commencées dans la clôture. */
export function runOfflinePreparation<T>(scope: OfflineScope, action: () => Promise<T>): Promise<T> {
  assertOfflineScope(scope);
  const tasks = pending.get(scope) ?? new Set<Promise<unknown>>();
  pending.set(scope, tasks);
  const operation = Promise.resolve().then(action);
  tasks.add(operation);
  void operation.then(() => tasks.delete(operation), () => tasks.delete(operation));
  return operation;
}
export async function waitOfflinePreparations(scope: OfflineScope): Promise<void> {
  assertOfflineScope(scope);
  while (pending.get(scope)?.size) await Promise.all([...pending.get(scope)!]);
  assertOfflineScope(scope);
}
