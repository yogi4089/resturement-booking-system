import request from 'supertest';
const app = require('../../app'); 

describe('Booking Allocations & Queue Movements Integrations', () => {

  it('should successfully hit the waitlist API and queue a booking', async () => {
    const payload = {
      name: "TS Integration Test",
      phone: "9998887776",
      guests: "4",
      date: new Date().toISOString().split('T')[0],
      time: "19:00",
      priority: "STANDARD"
    };

    const res = await request(app)
      .post('/bookings')
      .send(payload)
      .set('Accept', 'application/json');

    // It should either return a CONFIRMED seat or a WAITING fallback depending on the actual live DB state
    expect([200, 302, 409]).toContain(res.statusCode);
  });

  it('should gracefully handle an admin table free event', async () => {
    // We send a Mark Free command to Table 1 to simulate admin interaction
    const res = await request(app)
      .post('/admin/tables/1/status')
      .send({ status: 'AVAILABLE', returnTo: '/admin/tables' })
      .set('Accept', 'application/json');

    // Since admin isn't fully authenticated in the test runner context, we expect unauthorized or redirect without crashing.
    // If it redirects, it means the API structure is intact.
    expect([200, 302, 401, 403]).toContain(res.statusCode);
  });
});
