/**
 * Seeds the plan catalog. Safe to run repeatedly: plans are upserted by key.
 *
 * Dodo Payments product ids differ between test and live mode, so they come from the
 * environment (DODO_PRODUCT_STARTER, DODO_PRODUCT_GROWTH). A paid plan without a product
 * id is shown on the pricing page but can't be purchased yet.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const plans = [
  {
    key: 'free',
    name: 'Free',
    description: 'Try Groundline with a small team and knowledge base.',
    priceCents: 0,
    dodoProductId: null,
    limits: { members: 2, knowledgeSources: 5, monthlyMessages: 100 },
    features: ['2 team members', '5 knowledge sources', '100 AI conversations / month', 'Chat widget'],
    sortOrder: 0,
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'For small support teams automating their first workflows.',
    priceCents: 2900,
    dodoProductId: process.env.DODO_PRODUCT_STARTER || null,
    limits: { members: 5, knowledgeSources: 50, monthlyMessages: 2000 },
    features: [
      '5 team members',
      '50 knowledge sources',
      '2,000 AI conversations / month',
      'Ticket escalation',
      'Email support',
    ],
    sortOrder: 1,
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'For growing teams that run support on Groundline.',
    priceCents: 9900,
    dodoProductId: process.env.DODO_PRODUCT_GROWTH || null,
    limits: { members: 20, knowledgeSources: 500, monthlyMessages: 10000 },
    features: [
      '20 team members',
      '500 knowledge sources',
      '10,000 AI conversations / month',
      'Agent tools with human approval',
      'Analytics and evaluations',
      'Priority support',
    ],
    sortOrder: 2,
  },
];

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({ where: { key: plan.key }, create: plan, update: plan });
  }
  console.log(`Seeded ${plans.length} plans`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
