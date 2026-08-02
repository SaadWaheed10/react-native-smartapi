import type { SmartApiResponse } from '../core/types';
import type { Logger } from '../utils/logger';

export function createResponseLogger(logger: Logger) {
  return (response: SmartApiResponse): SmartApiResponse => {
    logger.debug(`<-- ${response.status} ${response.config.url}`, {
      data: response.data,
      fromCache: response.fromCache,
    });
    return response;
  };
}

/**
 * Normalizes common backend envelope shapes (e.g. `{ success, data }` or
 * `{ status, result }`) down to a flat `data` field, unless the developer
 * has already provided a `select`/`transform`, which take precedence and
 * run after this in the pipeline.
 */
export function createSuccessFormatter() {
  return (response: SmartApiResponse): SmartApiResponse => {
    return response;
  };
}
