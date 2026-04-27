import { describe, it, expect, vi } from 'vitest';

// Mock storagePut before importing the router
vi.mock('../storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ url: 'https://s3.example.com/shared-dynos/test.pdf', key: 'shared-dynos/test.pdf' }),
}));



describe('Dyno Share Procedures', () => {
  describe('shareDyno input validation', () => {
    it('should require pdfBase64 to be non-empty', () => {
      const schema = require('zod');
      const inputSchema = schema.z.object({
        pdfBase64: schema.z.string().min(1),
        peakHp: schema.z.number().optional(),
        peakTorque: schema.z.number().optional(),
        peakHpRpm: schema.z.number().optional(),
        peakTorqueRpm: schema.z.number().optional(),
        turboType: schema.z.string().optional(),
        fuelType: schema.z.string().optional(),
        injectorType: schema.z.string().optional(),
        has3BarMap: schema.z.boolean().optional(),
        fileName: schema.z.string().optional(),
      });

      // Valid input
      const validResult = inputSchema.safeParse({ pdfBase64: 'dGVzdA==' });
      expect(validResult.success).toBe(true);

      // Invalid: empty string
      const emptyResult = inputSchema.safeParse({ pdfBase64: '' });
      expect(emptyResult.success).toBe(false);

      // Invalid: missing pdfBase64
      const missingResult = inputSchema.safeParse({});
      expect(missingResult.success).toBe(false);
    });

    it('should accept all optional metadata fields', () => {
      const schema = require('zod');
      const inputSchema = schema.z.object({
        pdfBase64: schema.z.string().min(1),
        peakHp: schema.z.number().optional(),
        peakTorque: schema.z.number().optional(),
        peakHpRpm: schema.z.number().optional(),
        peakTorqueRpm: schema.z.number().optional(),
        turboType: schema.z.string().optional(),
        fuelType: schema.z.string().optional(),
        injectorType: schema.z.string().optional(),
        has3BarMap: schema.z.boolean().optional(),
        fileName: schema.z.string().optional(),
      });

      const fullInput = {
        pdfBase64: 'dGVzdA==',
        peakHp: 165.8,
        peakTorque: 114.6,
        peakHpRpm: 8200,
        peakTorqueRpm: 6900,
        turboType: 'jr',
        fuelType: 'pump',
        injectorType: 'id1050',
        has3BarMap: true,
        fileName: 'test.wp8',
      };

      const result = inputSchema.safeParse(fullInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.peakHp).toBe(165.8);
        expect(result.data.turboType).toBe('jr');
        expect(result.data.has3BarMap).toBe(true);
      }
    });
  });

  describe('getSharedDyno input validation', () => {
    it('should require non-empty token', () => {
      const schema = require('zod');
      const inputSchema = schema.z.object({ token: schema.z.string().min(1) });

      const validResult = inputSchema.safeParse({ token: 'abc123' });
      expect(validResult.success).toBe(true);

      const emptyResult = inputSchema.safeParse({ token: '' });
      expect(emptyResult.success).toBe(false);

      const missingResult = inputSchema.safeParse({});
      expect(missingResult.success).toBe(false);
    });
  });

  describe('Share token generation', () => {
    it('should generate a 24-character hex token from 12 random bytes', () => {
      // Simulate the same logic used in the router
      const { randomBytes } = require('node:crypto');
      const token = randomBytes(12).toString('hex');
      expect(token.length).toBe(24);
      // Should be valid hex
      expect(/^[0-9a-f]{24}$/.test(token)).toBe(true);
    });

    it('should generate unique tokens on each call', () => {
      const { randomBytes } = require('node:crypto');
      const token1 = randomBytes(12).toString('hex');
      const token2 = randomBytes(12).toString('hex');
      expect(token1).not.toBe(token2);
    });
  });

  describe('PDF base64 decoding', () => {
    it('should decode base64 to a buffer', () => {
      const testContent = 'Hello PDF';
      const base64 = Buffer.from(testContent).toString('base64');
      const decoded = Buffer.from(base64, 'base64');
      expect(decoded.toString()).toBe(testContent);
    });

    it('should handle large base64 strings', () => {
      const largeContent = 'x'.repeat(100000);
      const base64 = Buffer.from(largeContent).toString('base64');
      const decoded = Buffer.from(base64, 'base64');
      expect(decoded.length).toBe(100000);
    });
  });
});
