import { clientIp } from './client-ip-throttler.guard.js';

const req = (headers: Record<string, string> = {}) => ({ ip: '76.76.21.1', headers });
const SECRET = 'proxy-secret-0123456789abcdef0123';

describe('clientIp', () => {
  it('uses the forwarded visitor IP when the proxy secret matches', () => {
    expect(clientIp(req({ 'x-groundline-proxy-secret': SECRET, 'x-client-ip': '203.0.113.7' }), SECRET)).toBe('203.0.113.7');
  });

  it('ignores the forwarded IP without the right secret', () => {
    expect(clientIp(req({ 'x-client-ip': '203.0.113.7' }), SECRET)).toBe('76.76.21.1');
    expect(clientIp(req({ 'x-groundline-proxy-secret': 'wrong', 'x-client-ip': '203.0.113.7' }), SECRET)).toBe('76.76.21.1');
  });

  it('ignores it when no secret is configured or the value is not an IP', () => {
    expect(clientIp(req({ 'x-groundline-proxy-secret': '', 'x-client-ip': '203.0.113.7' }), '')).toBe('76.76.21.1');
    expect(clientIp(req({ 'x-groundline-proxy-secret': SECRET, 'x-client-ip': 'evil' }), SECRET)).toBe('76.76.21.1');
  });
});
