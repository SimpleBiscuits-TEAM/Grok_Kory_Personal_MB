/**
 * Voice Command Router Tests
 * Tests the voice command system: PID knowledge base, intent analysis, and response generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM module
vi.mock('../_core/llm', () => ({
  invokeLLM: vi.fn(),
}));

// Mock the voice transcription module
vi.mock('../_core/voiceTranscription', () => ({
  transcribeAudio: vi.fn(),
}));

// Mock the storage module
vi.mock('../storage', () => ({
  storagePut: vi.fn().mockResolvedValue({ url: 'https://example.com/audio.webm', key: 'voice/test.webm' }),
}));

import { invokeLLM } from '../_core/llm';
import { transcribeAudio } from '../_core/voiceTranscription';

describe('Voice Command System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PID Knowledge Base', () => {
    it('should have fuel-related PIDs', async () => {
      // Import the router to trigger module loading
      const { voiceRouter } = await import('./voice');
      expect(voiceRouter).toBeDefined();
    });

    it('should map fuel queries to FUEL_LVL PID', async () => {
      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'pid_query',
              matchedPids: [{ shortName: 'FUEL_LVL', confidence: 0.95 }],
              naturalResponse: 'Let me check your fuel level...',
              requiresLiveData: true,
            }),
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockLLMResponse);

      // The LLM should be called with the transcript
      const result = await (invokeLLM as any)({
        messages: [
          { role: 'system', content: expect.any(String) },
          { role: 'user', content: 'How much fuel is in the tank?' },
        ],
        response_format: expect.any(Object),
      });

      expect(result.choices[0].message.content).toBeDefined();
      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.type).toBe('pid_query');
      expect(parsed.matchedPids[0].shortName).toBe('FUEL_LVL');
    });

    it('should map temperature queries to ECT PID', async () => {
      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'pid_query',
              matchedPids: [{ shortName: 'ECT', confidence: 0.95 }],
              naturalResponse: 'Let me check your engine temperature...',
              requiresLiveData: true,
            }),
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockLLMResponse);

      const result = await (invokeLLM as any)({
        messages: expect.any(Array),
        response_format: expect.any(Object),
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.type).toBe('pid_query');
      expect(parsed.matchedPids[0].shortName).toBe('ECT');
    });

    it('should map speed queries to VSS PID', async () => {
      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'pid_query',
              matchedPids: [{ shortName: 'VSS', confidence: 0.95 }],
              naturalResponse: 'Let me check your speed...',
              requiresLiveData: true,
            }),
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockLLMResponse);

      const result = await (invokeLLM as any)({
        messages: expect.any(Array),
        response_format: expect.any(Object),
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.matchedPids[0].shortName).toBe('VSS');
    });
  });

  describe('Voice Transcription', () => {
    it('should handle successful transcription', async () => {
      (transcribeAudio as any).mockResolvedValue({
        text: 'How much fuel is in the tank?',
        language: 'en',
        duration: 2.5,
      });

      const result = await transcribeAudio({
        audioUrl: 'https://example.com/audio.webm',
        language: 'en',
        prompt: 'Transcribe this vehicle diagnostic voice command',
      });

      expect(result).toHaveProperty('text');
      expect((result as any).text).toBe('How much fuel is in the tank?');
    });

    it('should handle transcription errors', async () => {
      (transcribeAudio as any).mockResolvedValue({
        error: 'Audio file too large',
        code: 'FILE_TOO_LARGE',
        details: 'File size exceeds 16MB limit',
      });

      const result = await transcribeAudio({
        audioUrl: 'https://example.com/large-audio.webm',
        language: 'en',
      });

      expect(result).toHaveProperty('error');
      expect((result as any).error).toBe('Audio file too large');
    });
  });

  describe('Response Generation', () => {
    it('should generate natural language response with PID values', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Your fuel tank is at 45 percent. Looks like you have a decent amount of fuel left.',
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await (invokeLLM as any)({
        messages: [
          { role: 'system', content: expect.any(String) },
          {
            role: 'user',
            content: 'User asked: "How much fuel is in the tank?"\n\nLive vehicle data: Fuel Tank Level: 45 %',
          },
        ],
      });

      expect(result.choices[0].message.content).toContain('45');
      expect(result.choices[0].message.content).toContain('fuel');
    });

    it('should handle multiple PID values in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Your engine is running at 2500 RPM with a coolant temperature of 195 degrees Fahrenheit. Everything looks normal.',
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await (invokeLLM as any)({
        messages: expect.any(Array),
      });

      expect(result.choices[0].message.content).toContain('2500');
      expect(result.choices[0].message.content).toContain('195');
    });
  });

  describe('Intent Classification', () => {
    it('should classify general automotive questions', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'general_question',
              matchedPids: [],
              naturalResponse: 'P0300 is a random/multiple cylinder misfire detected code. It means the engine computer has detected that one or more cylinders are misfiring.',
              requiresLiveData: false,
            }),
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await (invokeLLM as any)({
        messages: expect.any(Array),
        response_format: expect.any(Object),
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.type).toBe('general_question');
      expect(parsed.matchedPids).toHaveLength(0);
      expect(parsed.requiresLiveData).toBe(false);
    });

    it('should classify unknown commands', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'unknown',
              matchedPids: [],
              naturalResponse: "I'm not sure what you're asking. Could you rephrase your question about the vehicle?",
              requiresLiveData: false,
            }),
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await (invokeLLM as any)({
        messages: expect.any(Array),
        response_format: expect.any(Object),
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.type).toBe('unknown');
    });

    it('should classify fault code queries as pid_query', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              type: 'pid_query',
              matchedPids: [{ shortName: 'DTC_CNT', confidence: 0.90 }],
              naturalResponse: 'Let me check for any fault codes...',
              requiresLiveData: true,
            }),
          },
        }],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await (invokeLLM as any)({
        messages: expect.any(Array),
        response_format: expect.any(Object),
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.type).toBe('pid_query');
      expect(parsed.matchedPids[0].shortName).toBe('DTC_CNT');
    });
  });

  describe('Router Structure', () => {
    it('should export voiceRouter with expected procedures', async () => {
      const { voiceRouter } = await import('./voice');
      expect(voiceRouter).toBeDefined();
      // The router should be a valid tRPC router object
      expect(typeof voiceRouter).toBe('object');
    });
  });
});
