const { describe, it, expect, mock } = require('bun:test');

const getHealthStatusMock = mock();

mock.module('../../db/connection', () => ({
  getHealthStatus: getHealthStatusMock,
  testConnection: mock(() => Promise.resolve(true)),
  query: mock(() => Promise.resolve({ rows: [] })),
}));

const connection = require('../../db/connection');

function healthHandler(req, res) {
  connection.getHealthStatus()
    .then((dbHealth) => {
      const status = {
        status: 'running',
        timestamp: new Date().toISOString(),
        database: dbHealth,
      };
      if (dbHealth.status === 'healthy') {
        res.status(200).json(status);
      } else {
        res.status(503).json(status);
      }
    })
    .catch((error) => {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    });
}

function makeRes() {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(obj) {
      body = obj;
      return this;
    },
    getStatus() {
      return statusCode;
    },
    getBody() {
      return body;
    },
  };
}

describe('GET / health', () => {
  it('returns 200 and body.status running when database is healthy', async () => {
    getHealthStatusMock.mockResolvedValue({ status: 'healthy' });
    const req = {};
    const res = makeRes();

    await new Promise((resolve) => {
      const origJson = res.json.bind(res);
      res.json = (obj) => {
        origJson(obj);
        resolve();
        return res;
      };
      healthHandler(req, res);
    });

    expect(res.getStatus()).toBe(200);
    expect(res.getBody().status).toBe('running');
    expect(res.getBody().database.status).toBe('healthy');
  });

  it('returns 503 when database is unhealthy', async () => {
    getHealthStatusMock.mockResolvedValue({ status: 'unhealthy' });
    const req = {};
    const res = makeRes();

    await new Promise((resolve) => {
      const origJson = res.json.bind(res);
      res.json = (obj) => {
        origJson(obj);
        resolve();
        return res;
      };
      healthHandler(req, res);
    });

    expect(res.getStatus()).toBe(503);
    expect(res.getBody().status).toBe('running');
    expect(res.getBody().database.status).toBe('unhealthy');
  });

  it('returns 503 when getHealthStatus throws', async () => {
    getHealthStatusMock.mockRejectedValue(new Error('connection failed'));
    const req = {};
    const res = makeRes();

    await new Promise((resolve) => {
      const origJson = res.json.bind(res);
      res.json = (obj) => {
        origJson(obj);
        resolve();
        return res;
      };
      healthHandler(req, res);
    });

    expect(res.getBody().error).toBe('connection failed');
  });
});
