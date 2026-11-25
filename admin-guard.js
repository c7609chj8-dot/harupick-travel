// Discard stale responses after sign-out, a tab change, or another access check.
export function createAdminGuard({ check, onState }) {
  let generation = 0;
  let disposed = false;
  return {
    invalidate(state = 'checking') {
      generation += 1;
      if (!disposed) onState({ state });
    },
    async refresh() {
      if (disposed) return;
      const version = ++generation;
      onState({ state: 'checking' });
      try {
        const result = await check();
        if (!disposed && version === generation) onState(result);
      } catch {
        if (!disposed && version === generation) onState({ state: 'error' });
      }
    },
    dispose() { generation += 1; disposed = true; }
  };
}
