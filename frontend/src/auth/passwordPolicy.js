// Must stay in sync with the Cognito user pool's passwordPolicy in lib/constructs/ps-auth.ts.
export const PASSWORD_REQUIREMENTS_TEXT = "At least 8 characters, with a lowercase letter and a number.";

// Returns an error message if the password doesn't meet the policy, or null if it's valid.
export function validatePassword(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include a number.";
  }
  return null;
}
