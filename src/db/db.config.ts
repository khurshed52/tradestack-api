import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is required. Set it in your .env file.');
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
     log: ['query', 'info', 'warn', 'error'],
});

export default prisma;
