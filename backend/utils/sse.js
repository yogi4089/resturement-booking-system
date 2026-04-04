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

module.exports = {
  eventsHandler,
  broadcastUpdate
};
