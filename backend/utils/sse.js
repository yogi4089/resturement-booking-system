const clients = new Set();

function eventsHandler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // establish SSE

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

function broadcastUpdate() {
  const message = 'event: data-updated\ndata: {}\n\n';
  for (const client of clients) {
    client.write(message);
  }
}

function broadcastAlert(type, message) {
  const payload = JSON.stringify({ type, message, timestamp: new Date().toISOString() });
  const sseMessage = `event: alert\ndata: ${payload}\n\n`;
  for (const client of clients) {
    client.write(sseMessage);
  }
}

module.exports = {
  eventsHandler,
  broadcastUpdate,
  broadcastAlert
};
