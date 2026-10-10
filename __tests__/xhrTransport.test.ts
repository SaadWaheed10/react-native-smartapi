import { shouldUseXhr } from '../src/core/transports/xhrTransport';

describe('xhrTransport', () => {
  it('selects xhr when transport is xhr', () => {
    expect(shouldUseXhr('xhr', { url: '/x' })).toBe(true);
  });

  it('selects fetch when transport is fetch', () => {
    expect(shouldUseXhr('fetch', { url: '/x', onUploadProgress: () => undefined })).toBe(false);
  });

  it('auto-selects xhr when progress callbacks are present', () => {
    expect(shouldUseXhr('auto', { url: '/x', onUploadProgress: () => undefined })).toBe(true);
    expect(shouldUseXhr('auto', { url: '/x', onDownloadProgress: () => undefined })).toBe(true);
    expect(shouldUseXhr('auto', { url: '/x' })).toBe(false);
  });
});
