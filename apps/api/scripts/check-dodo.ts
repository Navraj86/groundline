/** Checks the Dodo Payments connection and that each paid plan's product can renew monthly. */
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import DodoPayments from 'dodopayments';
import { PrismaClient } from '../src/generated/prisma/client.js';

for (const file of ['.env', '../../.env']) if (existsSync(file)) process.loadEnvFile(file);

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as 'test_mode' | 'live_mode') ?? 'test_mode',
});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const plans = await prisma.plan.findMany({ where: { dodoProductId: { not: null } }, orderBy: { sortOrder: 'asc' } });
  let ok = true;
  for (const plan of plans) {
    try {
      const product = await dodo.products.retrieve(plan.dodoProductId!);
      const price = product.price as unknown as Record<string, unknown>;
      const issues: string[] = [];
      if (!product.is_recurring) issues.push('not a subscription product');
      if (price.price !== plan.priceCents) issues.push(`price ${price.price} != plan ${plan.priceCents}`);
      if (price.currency !== plan.currency) issues.push(`currency ${price.currency} != ${plan.currency}`);
      const freq = `${price.payment_frequency_count} ${price.payment_frequency_interval}`;
      const period = `${price.subscription_period_count} ${price.subscription_period_interval}`;
      if (freq === period) issues.push(`subscription period equals billing frequency (${freq}); it would expire after one charge`);
      console.log(`${plan.key}: "${product.name}" ${price.price} ${price.currency} every ${freq}, period ${period}${issues.length ? `\n  ! ${issues.join('\n  ! ')}` : ' ✓'}`);
      if (issues.length) ok = false;
    } catch (err) {
      ok = false;
      console.log(`${plan.key}: could not load product (${(err as Error).message.split('\n')[0]})`);
    }
  }
  process.exitCode = ok ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
