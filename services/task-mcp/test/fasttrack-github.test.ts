import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastTrackGitHub } from '../src/domain/FastTrackGitHub.js';
import { TaskRecord } from '../src/domain/TaskRecord.js';
import { FastTrackResult, PostDevGuardResult } from '../src/domain/FastTrack.js';

describe('FastTrackGitHub', () => {
  let github: FastTrackGitHub;
  let mockOpenPR: any;
  let mockAddLabels: any;
  let mockComment: any;

  let mockTask: TaskRecord;
  let mockFastTrackResult: FastTrackResult;
  let mockGuardResult: PostDevGuardResult;

  beforeEach(() => {
    mockOpenPR = vi.fn();
    mockAddLabels = vi.fn();
    mockComment = vi.fn();

    github = new FastTrackGitHub(mockOpenPR, mockAddLabels, mockComment);

    mockTask = {
      id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      title: 'Test Task',
      acceptance_criteria: ['test'],
      scope: 'minor',
      status: 'po',
      rev: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z'
    };

    mockFastTrackResult = {
      eligible: true,
      score: 75,
      reasons: ['scope_minor', 'diff_small'],
      hardBlocks: []
    };

    mockGuardResult = {
      revoke: true,
      reason: 'coverage_below_threshold'
    };
  });

  describe('onFastTrackEvaluated', () => {
    it('should add labels and comment when PR number provided', async () => {
      mockAddLabels.mockResolvedValue({ added: true });
      mockComment.mockResolvedValue({ commented: true });

      await github.onFastTrackEvaluated(mockTask, mockFastTrackResult, 123);

      expect(mockAddLabels).toHaveBeenCalledWith({
        number: 123,
        labels: ['fast-track', 'fast-track:eligible'],
        type: 'pr'
      });

      expect(mockComment).toHaveBeenCalledWith({
        number: 123,
        body: expect.stringContaining('Fast-Track Evaluation'),
        type: 'pr'
      });
    });

    it('should not do anything when no PR number provided', async () => {
      await github.onFastTrackEvaluated(mockTask, mockFastTrackResult);

      expect(mockAddLabels).not.toHaveBeenCalled();
      expect(mockComment).not.toHaveBeenCalled();
    });

    it('should add blocked labels for ineligible tasks', async () => {
      const ineligibleResult: FastTrackResult = {
        eligible: false,
        score: 45,
        reasons: [],
        hardBlocks: ['public_api']
      };

      mockAddLabels.mockResolvedValue({ added: true });
      mockComment.mockResolvedValue({ commented: true });

      await github.onFastTrackEvaluated(mockTask, ineligibleResult, 123);

      expect(mockAddLabels).toHaveBeenCalledWith({
        number: 123,
        labels: ['fast-track:incompatible', 'fast-track:blocked'],
        type: 'pr'
      });
    });
  });

  describe('onFastTrackRevoked', () => {
    it('should add revoked label and comment when revoked', async () => {
      mockAddLabels.mockResolvedValue({ added: true });
      mockComment.mockResolvedValue({ commented: true });

      await github.onFastTrackRevoked(mockTask, mockGuardResult, 123);

      expect(mockAddLabels).toHaveBeenCalledWith({
        number: 123,
        labels: ['fast-track:revoked'],
        type: 'pr'
      });

      expect(mockComment).toHaveBeenCalledWith({
        number: 123,
        body: expect.stringContaining('Fast-Track Revoked'),
        type: 'pr'
      });
    });

    it('should not do anything when not revoked', async () => {
      const notRevokedResult: PostDevGuardResult = { revoke: false };

      await github.onFastTrackRevoked(mockTask, notRevokedResult, 123);

      expect(mockAddLabels).not.toHaveBeenCalled();
      expect(mockComment).not.toHaveBeenCalled();
    });

    it('should not do anything when no PR number provided', async () => {
      await github.onFastTrackRevoked(mockTask, mockGuardResult);

      expect(mockAddLabels).not.toHaveBeenCalled();
      expect(mockComment).not.toHaveBeenCalled();
    });
  });

  describe('createFastTrackPR', () => {
    it('should create draft PR for eligible tasks', async () => {
      mockOpenPR.mockResolvedValue({ number: 123 });

      const result = await github.createFastTrackPR(mockTask, mockFastTrackResult, 'feature/test');

      expect(mockOpenPR).toHaveBeenCalledWith({
        title: 'Test Task [FAST-TRACK]',
        head: 'feature/test',
        base: 'main',
        body: expect.stringContaining('Fast-Track Eligible'),
        draft: true,
        labels: ['fast-track', 'fast-track:eligible']
      });

      expect(result).toEqual({ number: 123 });
    });

    it('should create regular PR for ineligible tasks', async () => {
      const ineligibleResult: FastTrackResult = {
        eligible: false,
        score: 45,
        reasons: [],
        hardBlocks: ['public_api']
      };

      mockOpenPR.mockResolvedValue({ number: 123 });

      const result = await github.createFastTrackPR(mockTask, ineligibleResult, 'feature/test');

      expect(mockOpenPR).toHaveBeenCalledWith({
        title: 'Test Task [FAST-TRACK]',
        head: 'feature/test',
        base: 'main',
        body: expect.stringContaining('Standard Process Required'),
        draft: false,
        labels: ['fast-track:incompatible', 'fast-track:blocked']
      });
    });
  });

  describe('comment formatting', () => {
    it('should format evaluation comment correctly', async () => {
      mockComment.mockResolvedValue({ commented: true });

      await github.onFastTrackEvaluated(mockTask, mockFastTrackResult, 123);

      const commentCall = mockComment.mock.calls[0][0];
      const body = commentCall.body;

      expect(body).toContain('## 🚀 Fast-Track Evaluation');
      expect(body).toContain('**Task:** Test Task (TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C)');
      expect(body).toContain('**Eligible:** ✅ Yes');
      expect(body).toContain('**Score:** 75/100');
      expect(body).toContain('🎉 **Fast-track approved!**');
    });

    it('should format revocation comment correctly', async () => {
      mockComment.mockResolvedValue({ commented: true });

      await github.onFastTrackRevoked(mockTask, mockGuardResult, 123);

      const commentCall = mockComment.mock.calls[0][0];
      const body = commentCall.body;

      expect(body).toContain('## ⚠️ Fast-Track Revoked');
      expect(body).toContain('**Reason:** Test coverage below required threshold');
    });
  });
});