import { accessFailure } from './admin-members-client.js';

// Invalidate in-flight requests whenever access or the selected request changes.
export function createDashboardController({ load, onState, onAccessFailure }) {
  let active = false, version = 0;
  return {
    activate() { active = true; },
    deactivate() { active = false; version++; onState({ state: 'idle' }); },
    async refresh(days = 7) {
      if (!active) return;
      const request = ++version;
      onState({ state: 'loading' });
      try {
        const data = await load(days);
        if (active && request === version) onState({ state: 'ready', data });
      } catch (error) {
        if (!active || request !== version) return;
        const state = accessFailure(error);
        if (state) {
          active = false; version++; onState({ state: 'idle' }); onAccessFailure(state);
        } else onState({ state: 'error' });
      }
    }
  };
}

