import { authClient } from './auth-client.js';

// This check never trusts email strings, user metadata, or browser storage flags.
export async function checkAdminAccess() {
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError' || error.status === 401) return { state: 'signed-out' };
    throw error;
  }
  if (!user) return { state: 'signed-out' };
  if (!user.email_confirmed_at) return { state: 'denied' };
  const { data: context, error: contextError } = await authClient.rpc('harupick_admin_context');
  if (contextError) {
    if (contextError.code === '42501') return { state: 'denied' };
    if (contextError.code === 'PGRST301' || contextError.code === 'PGRST303') return { state: 'signed-out' };
    throw contextError;
  }
  if (context?.role !== 'admin' || context.user_id !== user.id || !context.capabilities?.includes('access_admin_console')) {
    throw new Error('Invalid administrator context');
  }
  return { state: 'allowed', user, context };
}
