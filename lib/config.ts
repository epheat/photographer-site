// Single source of truth for the API's base hosted zone. The backend stack serves each stage
// from `${domain}.api.evanheaton.com` under this zone, so the frontend's API endpoint is fully
// derivable from the stage. Unlike the raw execute-api URL or the userPoolClientId (both CDK
// resource attributes that are unresolved tokens at synth time), this is a plain string, so it
// can be baked into the synth-time frontend build without hardcoding.
export const API_ZONE_NAME = 'api.evanheaton.com';

export const apiEndpointForStage = (domain: string): string =>
  `https://${domain.toLowerCase()}.${API_ZONE_NAME}`;
