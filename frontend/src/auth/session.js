import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { authStore } from './store.js';

// Wraps Amplify's fetchAuthSession to expose the pieces this app actually uses:
// the bearer token for API calls, and the decoded ID token (used for the
// user's `sub` and their `cognito:groups` membership).
// see: https://docs.amplify.aws/lib/auth/manageusers/q/platform/js/#retrieve-current-session
export async function getAuthSession() {
  const session = await fetchAuthSession();
  return {
    accessToken: session.tokens?.accessToken?.toString(),
    idToken: session.tokens?.idToken?.toString(),
    idTokenPayload: session.tokens?.idToken?.payload,
  };
}

// Loads the current user (if any) and syncs the authStore accordingly.
// Used on app boot, and after sign-in/sign-out, since v6's signIn/signOut no
// longer return a full user object like v5 did.
export async function refreshAuthState() {
  try {
    const user = await getCurrentUser();
    const { idTokenPayload } = await getAuthSession();
    authStore.setLoggedIn(user, idTokenPayload);
  } catch (err) {
    authStore.setLoggedOut();
  }
}
