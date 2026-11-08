export function isValidSupabaseAuthSession(session) {
  return Boolean(
    session?.user?.id &&
    typeof session.access_token === 'string' &&
    session.access_token.length >= 20
  );
}

function isRegistrationConflict(error) {
  if (Number(error?.status) !== 409) return false;
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '');
  return [
    'email_already_registered',
    'username_already_taken',
    'registration_identifier_conflict'
  ].includes(code) || /already registered|already in use|username is already taken|duplicate key/i.test(message);
}

/**
 * Make account creation resumable without weakening password verification.
 * If a previous attempt created the Auth user but failed before the app
 * session was issued, a retry can sign in with the same email/password.
 */
export async function createOrResumeSupabaseAccount({ register, signIn }) {
  if (typeof register !== 'function' || typeof signIn !== 'function') {
    throw new TypeError('Registration requires register and signIn functions.');
  }

  let registration;
  try {
    registration = await register();
  } catch (registrationError) {
    if (!isRegistrationConflict(registrationError)) throw registrationError;

    try {
      const authenticated = await signIn();
      if (isValidSupabaseAuthSession(authenticated)) {
        return { authenticated, resumedExistingAccount: true };
      }
    } catch (signInError) {
      // Always show the actual reason the existing account could not resume.
      // In particular, invalid credentials must direct the member to recovery
      // instead of leaving them stuck on an "already registered" message.
      throw signInError;
    }
    throw Object.assign(
      new Error('This email already has a Minglora account. Check the password or use Forgot password to reset it.'),
      { status: 401, code: 'invalid_credentials' }
    );
  }

  if (!registration?.user?.id) {
    throw Object.assign(
      new Error('Minglora could not verify the account creation result. Please retry account creation.'),
      { status: 502, code: 'registration_user_missing' }
    );
  }

  // Supabase admin account creation marks email_confirm=true. Successful
  // password authentication is the final proof that the new account is ready;
  // do not strand a created account on a brittle response-field check.
  const authenticated = await signIn();
  if (!isValidSupabaseAuthSession(authenticated)) {
    throw Object.assign(
      new Error('Your account was created, but Minglora could not start your sign-in session. Please retry with the same email and password.'),
      { status: 502, code: 'registration_session_missing' }
    );
  }

  return { authenticated, resumedExistingAccount: false };
}
