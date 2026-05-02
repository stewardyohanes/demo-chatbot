import {
  mapCrmMessageToIngestItem,
  normalizeCrmTimestamp,
} from './crm-history.mapper';

describe('CRM history mapper', () => {
  it('maps customer and agent messages from CRM rows', () => {
    expect(
      mapCrmMessageToIngestItem({
        id: 'm1',
        type: 'TEXT',
        text: 'Halo',
        from_me: false,
        from_bot: false,
      })?.senderRole,
    ).toBe('customer');

    expect(
      mapCrmMessageToIngestItem({
        id: 'm2',
        type: 'TEXT',
        text: 'Baik kak',
        from_me: true,
        from_bot: false,
      })?.senderRole,
    ).toBe('agent');
  });

  it('skips old bot templates by default but can include them explicitly', () => {
    const botRow = {
      id: 'm3',
      type: 'TEXT',
      text: 'Menu chatbot',
      from_me: false,
      from_bot: true,
    };

    expect(mapCrmMessageToIngestItem(botRow)).toBeUndefined();

    expect(
      mapCrmMessageToIngestItem(botRow, {
        includeBotMessages: true,
      })?.senderRole,
    ).toBe('bot');
  });

  it('uses wamid as external message id and skips blank text', () => {
    expect(
      mapCrmMessageToIngestItem({
        id: 'internal-id',
        wamid: 'wamid-1',
        type: 'TEXT',
        text: '  Saya mau tanya kelas  ',
      }),
    ).toEqual(
      expect.objectContaining({
        externalMessageId: 'wamid-1',
        text: 'Saya mau tanya kelas',
      }),
    );

    expect(
      mapCrmMessageToIngestItem({
        id: 'blank',
        text: '   ',
      }),
    ).toBeUndefined();
  });

  it('skips non-text and system log messages by default', () => {
    expect(
      mapCrmMessageToIngestItem({
        id: 'purchase-log',
        type: 'PURCHASE',
        text: 'Chat ini di ASSIGN ke sales',
      }),
    ).toBeUndefined();

    expect(
      mapCrmMessageToIngestItem({
        id: 'assign-log',
        type: 'TEXT',
        text: 'Chat ini di ASSIGN ke John',
      }),
    ).toBeUndefined();
  });

  it('keeps ticket, campaign, and department metadata for source tracing', () => {
    const item = mapCrmMessageToIngestItem({
      id: 'm4',
      type: 'TEXT',
      text: 'Harga kelasnya berapa?',
      ticket_id: 'ticket-1',
      ticket_status: 'SOLVED',
      ticket_rating: '5',
      department_id: 'dept-1',
      campaign_id: 'campaign-1',
    });

    expect(item?.metadata?.crmMessageId).toBe('m4');
    expect(item?.metadata?.crmTicketId).toBe('ticket-1');
    expect(item?.metadata?.crmTicketStatus).toBe('SOLVED');
    expect(item?.metadata?.crmTicketRating).toBe('5');
    expect(item?.metadata?.crmDepartmentId).toBe('dept-1');
    expect(item?.metadata?.crmCampaignId).toBe('campaign-1');
  });

  it('normalizes WhatsApp unix timestamps in seconds and milliseconds', () => {
    expect(normalizeCrmTimestamp(1_714_550_400)).toBe(
      '2024-05-01T08:00:00.000Z',
    );
    expect(normalizeCrmTimestamp(1_714_550_400_000)).toBe(
      '2024-05-01T08:00:00.000Z',
    );
    expect(normalizeCrmTimestamp(null, '2026-05-01T10:00:00.000Z')).toBe(
      '2026-05-01T10:00:00.000Z',
    );
  });
});
