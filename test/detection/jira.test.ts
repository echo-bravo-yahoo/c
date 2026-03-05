/**
 * Tests for JIRA ticket extraction
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractJiraTicket, extractAllJiraTickets, extractJiraFromBranch, buildJiraUrl } from '../../src/detection/jira.ts';

describe('c', () => {
  describe('detection', () => {
    describe('jira', () => {
      describe('extractJiraTicket', () => {
        it('extracts MAC-1234 from text', () => {
          const result = extractJiraTicket('Fix issue MAC-1234 in the system');
          assert.strictEqual(result, 'MAC-1234');
        });

        it('extracts PROJ-567 from text', () => {
          const result = extractJiraTicket('Working on PROJ-567');
          assert.strictEqual(result, 'PROJ-567');
        });

        it('returns first ticket when multiple present', () => {
          const result = extractJiraTicket('MAC-111 depends on MAC-222');
          assert.strictEqual(result, 'MAC-111');
        });

        it('returns undefined for text without ticket', () => {
          const result = extractJiraTicket('No ticket here');
          assert.strictEqual(result, undefined);
        });

        it('requires at least 2 uppercase letters in prefix', () => {
          const result = extractJiraTicket('A-123 should not match');
          assert.strictEqual(result, undefined);
        });

        it('requires uppercase prefix', () => {
          const result = extractJiraTicket('mac-123 lowercase should not match');
          assert.strictEqual(result, undefined);
        });

        it('finds ticket at start of string', () => {
          const result = extractJiraTicket('MAC-100 is the ticket');
          assert.strictEqual(result, 'MAC-100');
        });

        it('finds ticket at end of string', () => {
          const result = extractJiraTicket('Ticket is MAC-100');
          assert.strictEqual(result, 'MAC-100');
        });

        it('allows 10-char prefixes', () => {
          const result = extractJiraTicket('Working on ABCDEFGHIJ-12345');
          assert.strictEqual(result, 'ABCDEFGHIJ-12345');
        });

        it('rejects 11+ char prefixes', () => {
          const result = extractJiraTicket('Working on VERYLONGPREFIX-12345');
          assert.strictEqual(result, undefined);
        });
      });

      describe('extractAllJiraTickets', () => {
        it('extracts all tickets from text', () => {
          const result = extractAllJiraTickets('MAC-111 depends on MAC-222 and PROJ-333');
          assert.deepStrictEqual(result, ['MAC-111', 'MAC-222', 'PROJ-333']);
        });

        it('deduplicates repeated tickets', () => {
          const result = extractAllJiraTickets('MAC-111 is mentioned twice: MAC-111');
          assert.deepStrictEqual(result, ['MAC-111']);
        });

        it('returns empty array when no tickets', () => {
          const result = extractAllJiraTickets('No tickets here');
          assert.deepStrictEqual(result, []);
        });
      });

      describe('extractJiraFromBranch', () => {
        it('extracts from feature/MAC-123-description', () => {
          const result = extractJiraFromBranch('feature/MAC-123-add-login');
          assert.strictEqual(result, 'MAC-123');
        });

        it('extracts from fix/PROJ-456', () => {
          const result = extractJiraFromBranch('fix/PROJ-456');
          assert.strictEqual(result, 'PROJ-456');
        });

        it('extracts from MAC-789-some-work', () => {
          const result = extractJiraFromBranch('MAC-789-some-work');
          assert.strictEqual(result, 'MAC-789');
        });

        it('returns nothing for main branch', () => {
          const result = extractJiraFromBranch('main');
          assert.strictEqual(result, undefined);
        });

        it('returns nothing for develop branch', () => {
          const result = extractJiraFromBranch('develop');
          assert.strictEqual(result, undefined);
        });

        it('returns nothing for ticketless branch', () => {
          const result = extractJiraFromBranch('feature/add-new-button');
          assert.strictEqual(result, undefined);
        });
      });

      describe('buildJiraUrl', () => {
        it('builds URL with default base', () => {
          const result = buildJiraUrl('MAC-123');
          assert.strictEqual(result, 'https://machinify.atlassian.net/browse/MAC-123');
        });

        it('builds URL with custom base', () => {
          const result = buildJiraUrl('PROJ-456', 'https://jira.example.com');
          assert.strictEqual(result, 'https://jira.example.com/browse/PROJ-456');
        });
      });
    });
  });
});
