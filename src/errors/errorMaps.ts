export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Please check your input and try again.',
  401: 'You are not authorized. Please sign in again.',
  403: "You don't have permission to perform this action.",
  404: 'The requested resource was not found.',
  405: 'This action is not allowed.',
  408: 'The request timed out. Please try again.',
  409: 'There was a conflict with the current state of the resource.',
  422: 'Some fields failed validation. Please review and try again.',
  429: 'Too many requests. Please slow down and try again shortly.',
  500: 'Something went wrong on the server. Please try again later.',
  502: 'The server received an invalid response. Please try again later.',
  503: 'The service is temporarily unavailable. Please try again later.',
  504: 'The server took too long to respond. Please try again later.',
};

export const NETWORK_ERROR_MESSAGES: Record<string, string> = {
  NO_INTERNET: 'No internet connection. Please check your network and try again.',
  SLOW_CONNECTION: 'Your connection seems slow. This is taking longer than expected.',
  DNS_FAILURE: 'Could not resolve the server address. Please try again later.',
  SSL_ERROR: 'A secure connection could not be established.',
  CONNECTION_LOST: 'The connection was lost. Please try again.',
  REQUEST_CANCELLED: 'The request was cancelled.',
  TIMEOUT: 'The request timed out. Please try again.',
  UNKNOWN: 'An unexpected network error occurred.',
};

export function getHttpErrorMessage(status: number): string {
  return HTTP_STATUS_MESSAGES[status] ?? `Request failed with status code ${status}.`;
}
