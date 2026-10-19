import { openStream } from '../src/core/stream';

describe('openStream', () => {
  it('parses SSE frames via XHR progressive text', async () => {
    const messages: any[] = [];
    const events: any[] = [];

    class FakeXHR {
      static last: FakeXHR;
      responseText = '';
      status = 200;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open() {
        FakeXHR.last = this;
      }
      setRequestHeader() {}
      abort() {
        this.onabort?.();
      }
      send() {
        this.responseText = 'event: ping\ndata: {"ok":true}\n\n';
        this.onprogress?.();
        this.onload?.();
      }
    }

    (global as any).XMLHttpRequest = FakeXHR;
    // Force XHR path by making fetch throw / lack body reader
    const originalFetch = global.fetch;
    (global as any).fetch = undefined;

    const stream = openStream('https://api.test', '/events', {
      parseJson: true,
      onMessage: (data) => messages.push(data),
      onEvent: (e) => events.push(e),
    });

    await stream.done;

    expect(events[0]).toMatchObject({ event: 'ping', data: '{"ok":true}' });
    expect(messages[0]).toEqual({ ok: true });

    (global as any).fetch = originalFetch;
  });
});
