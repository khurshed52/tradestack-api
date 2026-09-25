import type { Request, Response } from 'express';
import { CryptoInputError, getCryptoSnapshot, saveCrypto } from './crypto.service.js';

export const saveCryptoPrice = async (req: Request, res: Response) => {
    try {
        const data = await saveCrypto(req.body);
        return res.json({ statusCode: 100, message: 'Crypto saved successfully', data });
    } catch (error) {
        if (error instanceof CryptoInputError) {
            return res.status(400).json({ message: error.message });
        }
        throw error;
    }
};

export const getAllCrypto = async (_req: Request, res: Response) => {
    return res.json({
        statusCode: 100,
        message: 'Data fetched successfully',
        data: await getCryptoSnapshot(),
    });
};
