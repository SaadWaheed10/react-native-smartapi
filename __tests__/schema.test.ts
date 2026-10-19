import { validateWithSchema } from '../src/core/schema';
import { SmartApiError } from '../src/core/types';
import { SmartApiClient } from '../src/core/SmartApiClient';

describe('schema validation', () => {
  it('passes data through a safeParse schema', () => {
    const schema = {
      safeParse: (data: unknown) =>
        typeof data === 'object' && data !== null && 'id' in (data as any)
          ? { success: true as const, data: data as { id: number } }
          : { success: false as const, error: { issues: [{ message: 'id required', path: [] }] } },
    };

    expect(validateWithSchema({ id: 1 }, schema)).toEqual({ id: 1 });
    expect(() => validateWithSchema({}, schema)).toThrow(SmartApiError);
  });

  it('validates responses in the client pipeline', async () => {
    (global as any).fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
        forEach: (cb: (v: string, k: string) => void) => cb('application/json', 'content-type'),
      },
      text: async () => JSON.stringify({ id: 1, name: 'Ada' }),
    });

    const client = new SmartApiClient({
      baseURL: 'https://api.test',
      attachDeviceHeaders: false,
    });

    const schema = {
      parse: (data: any) => {
        if (!data?.name) throw new Error('name missing');
        return data;
      },
    };

    const res = await client.get('/user', { schema });
    expect(res.data.name).toBe('Ada');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
        forEach: (cb: (v: string, k: string) => void) => cb('application/json', 'content-type'),
      },
      text: async () => JSON.stringify({ id: 2 }),
    });

    await expect(client.get('/user', { schema })).rejects.toMatchObject({
      code: 'SCHEMA_VALIDATION',
      type: 'VALIDATION_ERROR',
    });

    client.destroy();
  });
});
