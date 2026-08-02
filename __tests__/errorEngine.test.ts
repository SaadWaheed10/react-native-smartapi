import { ErrorEngine } from '../src/errors/ErrorEngine';

describe('ErrorEngine', () => {
  it('normalizes a standard HTTP error response', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ status: 404, body: { message: 'Not found' } });

    expect(error.status).toBe(404);
    expect(error.type).toBe('HTTP_ERROR');
    expect(error.message).toBe('Not found');
    expect(error.code).toBe('HTTP_404');
  });

  it('maps custom backend error codes to friendly messages', () => {
    const engine = new ErrorEngine({ USER_NOT_FOUND: 'User does not exist' });
    const error = engine.normalize({
      status: 400,
      body: { code: 'USER_NOT_FOUND' },
    });

    expect(error.code).toBe('USER_NOT_FOUND');
    expect(error.message).toBe('User does not exist');
  });

  it('marks 401/403 as AUTH_ERROR', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ status: 401, body: {} });
    expect(error.type).toBe('AUTH_ERROR');
  });

  it('marks 422 as VALIDATION_ERROR', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ status: 422, body: {} });
    expect(error.type).toBe('VALIDATION_ERROR');
  });

  it('falls back to a default message when status is unmapped', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ status: 418, body: {} });
    expect(error.message).toContain('418');
  });

  it('detects a network failure from a fetch exception', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ raw: new Error('Network request failed') });
    expect(error.type).toBe('NETWORK_ERROR');
    expect(error.code).toBe('NO_INTERNET');
  });

  it('detects an aborted request', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ aborted: true });
    expect(error.type).toBe('CANCELLED');
  });

  it('produces the unified error shape via toJSON', () => {
    const engine = new ErrorEngine();
    const error = engine.normalize({ status: 500, body: {} });
    const json = error.toJSON();
    expect(json).toEqual({
      code: 'HTTP_500',
      status: 500,
      message: expect.any(String),
      type: 'HTTP_ERROR',
      details: {},
    });
  });
});
