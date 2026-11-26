// Authentication events can arrive after the reset page has already rendered.
// Keep SDK requests outside onAuthStateChange's callback to avoid its auth lock.
export function createRecoveryController({ validate, onState, schedule = callback => setTimeout(callback, 0) }) {
  let revision = 0;
  let disposed = false;
  let active = false;
  function clear() {
    revision++;
    active = false;
    if (!disposed) onState({ state: 'request' });
  }
  async function check() {
    if (disposed) return;
    const current = ++revision;
    active = true;
    onState({ state: 'checking' });
    try {
      await validate();
      if (!disposed && current === revision) onState({ state: 'password' });
    } catch (error) {
      if (!disposed && current === revision) {
        active = false;
        onState({ state: 'error', error });
      }
    }
  }
  return {
    check, clear,
    handleAuthEvent(event) {
      if (disposed) return;
      if (event === 'PASSWORD_RECOVERY') schedule(() => { if (!disposed) check(); });
      else if (event === 'SIGNED_OUT' || (active && event === 'SIGNED_IN')) clear();
    },
    dispose() { disposed = true; revision++; }
  };
}
