import { createHmac } from 'node:crypto';
import { isPrivateAddress } from '../../common/public-url.js';
import { ActionsApiConnector } from './actions-api.connector.js';
import { ConnectorError } from './connector.js';

const customer = { customerId: 'c1', externalId: 'cust_1', email: 'sam@example.com', name: 'Sam' };

describe('ActionsApiConnector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs each request with an HMAC of the timestamp and raw body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ plan: 'Plus' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const connector = new ActionsApiConnector('org_1', 'https://api.example.com/groundline/', 'gls_secret');
    await expect(connector.getSubscription(customer)).resolves.toEqual({ plan: 'Plus' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/groundline/get_subscription');
    const header = (init.headers as Record<string, string>)['x-groundline-signature']!;
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header)!;
    expect(v1).toBe(createHmac('sha256', 'gls_secret').update(`${t}.${init.body as string}`).digest('hex'));
    expect(JSON.parse(init.body as string)).toEqual({
      organizationId: 'org_1',
      customer: { id: 'cust_1', email: 'sam@example.com', name: 'Sam' },
      input: {},
    });
    expect(init.redirect).toBe('error');
  });

  it("surfaces the backend's 4xx message to the model", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Order not refundable' }), { status: 422 })));
    const connector = new ActionsApiConnector('org_1', 'https://api.example.com', 'gls_secret');
    await expect(connector.requestRefund(customer, { orderId: 'O1', reason: 'broken' })).rejects.toThrow(
      new ConnectorError('Order not refundable'),
    );
  });
});

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
    'treats %s as private',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('treats %s as public', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});
