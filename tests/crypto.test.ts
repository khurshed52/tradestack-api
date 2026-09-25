import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCrypto, CryptoInputError } from '../src/modules/market/crypto.service.js';

const quote = { symbol: 'btcusdt', buyPrice: '100.0000000001', spread: '0.1', price: '100', changePercent: '-1.25', high: '110', low: '90' };

test('normalizes symbol and preserves decimal precision and negative change', () => {
    const result = parseCrypto(quote);
    assert.equal(result.symbol, 'BTCUSDT');
    assert.equal(result.buyPrice.toString(), '100.0000000001');
    assert.equal(result.changePercent.toString(), '-1.25');
});
test('rejects missing, negative, malformed and out-of-range prices', () => {
    for (const value of [undefined, null, '', -1, Infinity, 'NaN', '1.12345678901']) {
        assert.throws(() => parseCrypto({ ...quote, price: value }), CryptoInputError);
    }
    assert.throws(() => parseCrypto({ ...quote, low: '101' }), CryptoInputError);
    assert.throws(() => parseCrypto({ ...quote, high: '80' }), CryptoInputError);
    assert.throws(() => parseCrypto({ ...quote, symbol: 'bad symbol' }), CryptoInputError);
});
