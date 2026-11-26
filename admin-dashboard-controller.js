import { accessFailure } from './admin-members-client.js';

// Invalidate in-flight requests whenever access or the selected request changes.
export function createDashboardController({ load, onState, onAccessFailure }) {
  let active = false, version = 0, selectedDays = 7;
  return {
    activate() { active = true; },
    deactivate() { active = false; selectedDays = 7; version++; onState({ state: 'idle' }); },
    async refresh(days = selectedDays) {
      if (!active) return;
      if (![7,30].includes(days)) throw new TypeError('Dashboard days must be 7 or 30');
      selectedDays = days;
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

