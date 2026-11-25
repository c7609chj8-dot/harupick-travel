import { accessFailure } from './admin-members-client.js';

// Each request is tied to the current access check. Never render a late response.
export function createMembersController({ list, detail, onList, onDetail, onAccessFailure }) {
  let active = false, listVersion = 0, detailVersion = 0;
  function failure(error) {
    const state = accessFailure(error);
    if (!state) return false;
    controller.deactivate();
    onAccessFailure(state);
    return true;
  }
  const controller = {
    activate() { active = true; },
    deactivate() {
      active = false; listVersion++; detailVersion++;
      onList({ state: 'idle' }); onDetail({ state: 'idle' });
    },
    closeDetail() { detailVersion++; onDetail({ state: 'idle' }); },
    async loadList(params) {
      if (!active) return;
      const version = ++listVersion;
      controller.closeDetail();
      onList({ state: 'loading' });
      try {
        const data = await list(params);
        if (active && version === listVersion) onList({ state: 'ready', data });
      } catch (error) {
        if (active && version === listVersion && !failure(error)) onList({ state: 'error' });
      }
    },
    async loadDetail(id) {
      if (!active) return;
      const version = ++detailVersion;
      onDetail({ state: 'loading', id });
      try {
        const data = await detail(id);
        if (active && version === detailVersion) onDetail({ state: data ? 'ready' : 'missing', data, id });
      } catch (error) {
        if (active && version === detailVersion && !failure(error)) onDetail({ state: 'error', id });
      }
    }
  };
  return controller;
}

