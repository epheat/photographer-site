import { get, post } from 'aws-amplify/api';

// Amplify v6 replaces the v5 `API.get/post('ps-api', path, options)` calls
// (which returned the parsed JSON body directly) with functions that return
// an operation whose `.response` resolves to a raw HTTP response. These
// helpers restore the old ergonomics so call sites don't need to change.
// see: https://docs.amplify.aws/javascript/build-a-backend/troubleshooting/migrate-from-javascript-v5-to-v6/

const API_NAME = 'ps-api';

async function parseBody(body) {
  const text = await body.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// v6 throws a RestApiError on non-2xx responses with the raw response body
// as a string on `err.response.body`. Pull the server's `message` field (if
// any) up onto `err.message`, matching how call sites already handle errors.
function normalizeError(err) {
  const rawBody = err?.response?.body;
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed?.message) {
        err.message = parsed.message;
      }
    } catch {
      // not JSON, leave err.message as-is
    }
  }
  throw err;
}

async function call(operation, path, options) {
  try {
    const { body } = await operation({ apiName: API_NAME, path, options }).response;
    return await parseBody(body);
  } catch (err) {
    normalizeError(err);
  }
}

export function apiGet(path, options) {
  return call(get, path, options);
}

export function apiPost(path, options) {
  return call(post, path, options);
}
